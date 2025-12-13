/**
 * Netcatty in-process SSH agent
 *
 * Implements ssh2's BaseAgent interface to support:
 * - OpenSSH certificate authentication (client cert + private key)
 * - WebAuthn-backed SSH auth (Windows Hello / Touch ID / FIDO2) using
 *   OpenSSH's webauthn-sk-ecdsa-sha2-nistp256@openssh.com signature format.
 */

const crypto = require("node:crypto");
const { BaseAgent } = require("ssh2/lib/agent.js");
const { parseKey } = require("ssh2/lib/protocol/keyParser.js");
const { convertSignature } = require("ssh2/lib/protocol/utils.js");
const { requestWebAuthnAssertion } = require("./webauthnIpc.cjs");

const DUMMY_ED25519_PUB =
  "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEBAQEB netcatty-agent-dummy";

function base64UrlToBuffer(b64url) {
  const b64 = String(b64url).replace(/-/g, "+").replace(/_/g, "/");
  const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
  return Buffer.from(padded, "base64");
}

function bufferToBase64Url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function readUInt32BE(buf, offset) {
  return (
    ((buf[offset] << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3]) >>>
    0
  );
}

function writeUInt32BE(n) {
  const out = Buffer.allocUnsafe(4);
  out.writeUInt32BE(n >>> 0, 0);
  return out;
}

function sshString(value) {
  const buf = Buffer.isBuffer(value) ? value : Buffer.from(String(value), "utf8");
  return Buffer.concat([writeUInt32BE(buf.length), buf]);
}

function mpintBytes(unsignedBigEndian) {
  let b = Buffer.from(unsignedBigEndian);
  while (b.length > 0 && b[0] === 0x00) b = b.slice(1);
  if (b.length === 0) return b;
  if (b[0] & 0x80) return Buffer.concat([Buffer.from([0x00]), b]);
  return b;
}

function sshMpint(unsignedBigEndian) {
  const b = mpintBytes(unsignedBigEndian);
  return Buffer.concat([writeUInt32BE(b.length), b]);
}

function parseOpenSshKeyLine(line) {
  if (typeof line !== "string" || !line.trim()) throw new Error("Empty OpenSSH key line");
  const firstLine = line.split(/\r?\n/).find((l) => l.trim());
  if (!firstLine) throw new Error("Empty OpenSSH key line");
  const m = /^\s*(\S+)\s+([A-Za-z0-9+/=]+)(?:\s+(.*))?\s*$/.exec(firstLine);
  if (!m) throw new Error("Invalid OpenSSH key line");
  const type = m[1];
  const blob = Buffer.from(m[2], "base64");
  const comment = m[3] || "";
  return { type, blob, comment };
}

function parseEcdsaDerSignature(der) {
  // Minimal ASN.1 DER parser for ECDSA signatures: SEQUENCE { INTEGER r, INTEGER s }
  const buf = Buffer.from(der);
  let p = 0;

  const readU8 = () => {
    if (p >= buf.length) throw new Error("DER: out of range");
    return buf[p++];
  };

  const readLen = () => {
    const first = readU8();
    if ((first & 0x80) === 0) return first;
    const n = first & 0x7f;
    if (n === 0 || n > 4) throw new Error("DER: invalid length");
    let len = 0;
    for (let i = 0; i < n; i++) len = (len << 8) | readU8();
    return len >>> 0;
  };

  const expect = (v) => {
    const got = readU8();
    if (got !== v) throw new Error(`DER: expected 0x${v.toString(16)}`);
  };

  expect(0x30);
  const seqLen = readLen();
  const seqEnd = p + seqLen;

  expect(0x02);
  const rLen = readLen();
  const r = buf.subarray(p, p + rLen);
  p += rLen;

  expect(0x02);
  const sLen = readLen();
  const s = buf.subarray(p, p + sLen);
  p += sLen;

  if (p !== seqEnd) throw new Error("DER: trailing bytes");

  return { r, s };
}

function buildWebAuthnSkEcdsaSignatureBlob({ origin, authenticatorData, clientDataJSON, signatureDer }) {
  if (!Buffer.isBuffer(authenticatorData) || authenticatorData.length < 37) {
    throw new Error("Invalid authenticatorData");
  }

  const flags = authenticatorData[32];
  const counter = readUInt32BE(authenticatorData, 33);
  const extensions = (flags & 0x80) !== 0 ? authenticatorData.subarray(37) : Buffer.alloc(0);

  const { r, s } = parseEcdsaDerSignature(signatureDer);
  const ecdsaInner = Buffer.concat([sshMpint(r), sshMpint(s)]);
  const ecdsaSig = sshString(ecdsaInner);

  return Buffer.concat([
    ecdsaSig,
    Buffer.from([flags]),
    writeUInt32BE(counter),
    sshString(origin || ""),
    sshString(clientDataJSON),
    sshString(extensions),
  ]);
}

function buildCertificateIdentityKey({ certType, certBlob, comment }) {
  const key = parseKey(DUMMY_ED25519_PUB);
  if (key instanceof Error) throw key;
  key.type = certType;
  key.comment = comment || key.comment;
  key.getPublicSSH = () => certBlob;
  return key;
}

function buildWebAuthnIdentityKey({ algoType, pubKeyBlob, comment }) {
  const key = parseKey(DUMMY_ED25519_PUB);
  if (key instanceof Error) throw key;
  key.type = algoType;
  key.comment = comment || key.comment;
  key.getPublicSSH = () => pubKeyBlob;
  return key;
}

function normalizeBaseTypeForConversion(type) {
  if (typeof type !== "string") return type;
  // ssh-rsa-cert-v01@openssh.com -> ssh-rsa, ecdsa-sha2-nistp256-cert-v01@openssh.com -> ecdsa-sha2-nistp256
  return type.replace(/-cert-v0[01]@openssh\.com$/i, "");
}

class NetcattyAgent extends BaseAgent {
  constructor(opts) {
    super();
    this._mode = opts.mode;
    this._webContents = opts.webContents;
    this._key = null;
    this._meta = opts.meta;

    if (this._mode === "certificate") {
      const { certificate, label } = opts.meta || {};
      if (!certificate) throw new Error("Missing certificate");
      const { type: certType, blob: certBlob } = parseOpenSshKeyLine(certificate);
      this._key = buildCertificateIdentityKey({
        certType,
        certBlob,
        comment: label || "",
      });
    } else if (this._mode === "webauthn") {
      const { publicKey, label } = opts.meta || {};
      if (!publicKey) throw new Error("Missing publicKey");
      const { blob: pubKeyBlob } = parseOpenSshKeyLine(publicKey);
      this._key = buildWebAuthnIdentityKey({
        algoType: "webauthn-sk-ecdsa-sha2-nistp256@openssh.com",
        pubKeyBlob,
        comment: label || "",
      });
    } else {
      throw new Error(`Unknown agent mode: ${opts.mode}`);
    }
  }

  getIdentities(cb) {
    cb(null, [this._key]);
  }

  sign(_pubKey, data, options, cb) {
    if (typeof options === "function") {
      cb = options;
      options = undefined;
    }
    if (typeof cb !== "function") cb = () => {};

    (async () => {
      if (this._mode === "certificate") {
        const { privateKey, passphrase } = this._meta || {};
        if (!privateKey) throw new Error("Missing privateKey for certificate auth");

        const parsed = parseKey(privateKey, passphrase);
        if (parsed instanceof Error) throw parsed;
        const key = Array.isArray(parsed) ? parsed[0] : parsed;

        const baseType = normalizeBaseTypeForConversion(key.type);
        const hash = options && options.hash ? options.hash : undefined;
        let sig = key.sign(data, hash);
        if (sig instanceof Error) throw sig;

        // For ECDSA/DSS, convertSignature expects base (non-cert) key types.
        if (baseType === "ssh-dss" || /^ecdsa-sha2-nistp\d+$/i.test(baseType)) {
          sig = convertSignature(sig, baseType);
          if (!sig) throw new Error("Failed to convert signature");
        }

        return Buffer.from(sig);
      }

      if (this._mode === "webauthn") {
        const { credentialId, rpId, userVerification } = this._meta || {};
        if (!credentialId) throw new Error("Missing credentialId for WebAuthn auth");
        if (!rpId) throw new Error("Missing rpId for WebAuthn auth");
        if (!this._webContents || this._webContents.isDestroyed()) {
          throw new Error("WebContents unavailable for WebAuthn signing");
        }

        const challenge = crypto.createHash("sha256").update(data).digest();
        const assertion = await requestWebAuthnAssertion(this._webContents, {
          credentialId,
          rpId,
          challenge: bufferToBase64Url(challenge),
          userVerification: userVerification || "preferred",
          keySource: this._meta?.keySource,
        });

        const origin = assertion?.origin || "";
        const authenticatorData = base64UrlToBuffer(assertion?.authenticatorData || "");
        const clientDataJSON = base64UrlToBuffer(assertion?.clientDataJSON || "");
        const signatureDer = base64UrlToBuffer(assertion?.signature || "");

        return buildWebAuthnSkEcdsaSignatureBlob({
          origin,
          authenticatorData,
          clientDataJSON,
          signatureDer,
        });
      }

      throw new Error("Unsupported agent mode");
    })()
      .then((sig) => cb(null, sig))
      .catch((err) => cb(err));
  }
}

module.exports = {
  NetcattyAgent,
};
