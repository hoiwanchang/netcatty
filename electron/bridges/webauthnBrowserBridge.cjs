/**
 * WebAuthn Browser Bridge (macOS workaround)
 *
 * Electron's embedded WebAuthn prompt is unreliable on macOS (Touch ID / platform authenticators),
 * often leaving navigator.credentials.{create,get} pending with no UI.
 *
 * This bridge works around the issue by opening the system browser on a localhost helper page that
 * performs WebAuthn using the browser's working UI, then POSTs the result back to Electron.
 *
 * NOTE: This is intended as a pragmatic fallback; keep the UX minimal and secure (ephemeral port + token).
 */

const http = require("node:http");
const crypto = require("node:crypto");

let server = null;
let baseUrl = null;

// token -> { mode, resolve, reject, timeout }
const pending = new Map();

function resolveElectronModule() {
  try {
    return require("node:electron");
  } catch {
    return require("electron");
  }
}

function bufToUtf8(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

function writeJson(res, statusCode, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function writeHtml(res, html) {
  const body = Buffer.from(html, "utf-8");
  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": String(body.length),
    "Cache-Control": "no-store",
  });
  res.end(body);
}

function getHelperHtml() {
  // Keep this page self-contained (no external assets) and compatible with modern browsers.
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Netcatty WebAuthn Helper</title>
    <style>
      :root { color-scheme: light dark; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif; margin: 24px; }
      .card { max-width: 720px; margin: 0 auto; padding: 18px 18px 14px; border: 1px solid rgba(120,120,120,.35); border-radius: 12px; }
      h1 { font-size: 18px; margin: 0 0 10px; }
      p { margin: 8px 0; line-height: 1.45; }
      code { font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; font-size: 12px; }
      button { padding: 10px 14px; border-radius: 10px; border: 1px solid rgba(120,120,120,.45); cursor: pointer; }
      button.primary { background: #2563eb; color: white; border-color: #2563eb; }
      button:disabled { opacity: .6; cursor: not-allowed; }
      .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; margin-top: 12px; }
      .muted { opacity: .75; }
      .status { margin-top: 10px; white-space: pre-wrap; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1 id="title">WebAuthn</h1>
      <p class="muted">
        This page was opened by Netcatty to complete a WebAuthn operation using your browser UI.
      </p>
      <p><strong>RP ID:</strong> <code id="rpId"></code></p>
      <div class="row">
        <button id="run" class="primary">Continue</button>
        <button id="close">Close</button>
      </div>
      <div id="status" class="status muted"></div>
    </div>

    <script>
      (() => {
        const qs = new URLSearchParams(location.search);
        const mode = qs.get("mode") || "";
        const token = qs.get("token") || "";
        const rpId = qs.get("rpId") || "localhost";
        const name = qs.get("name") || "user";
        const displayName = qs.get("displayName") || name;
        const attachment = qs.get("attachment") || "platform";
        const uv = qs.get("uv") || "required";
        const timeoutMs = Math.max(1000, Number(qs.get("timeoutMs") || "180000") || 180000);
        const credentialIdB64 = qs.get("credentialId") || "";
        const challengeB64 = qs.get("challenge") || "";

        const titleEl = document.getElementById("title");
        const rpEl = document.getElementById("rpId");
        const statusEl = document.getElementById("status");
        const runBtn = document.getElementById("run");
        const closeBtn = document.getElementById("close");

        titleEl.textContent = mode === "get" ? "Authenticate (WebAuthn)" : "Create Credential (WebAuthn)";
        rpEl.textContent = rpId;

        const setStatus = (msg) => { statusEl.textContent = String(msg || ""); };

        const bufToBase64Url = (buf) => {
          const bytes = new Uint8Array(buf);
          let binary = "";
          const chunkSize = 0x8000;
          for (let i = 0; i < bytes.length; i += chunkSize) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
          }
          return btoa(binary).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/g, "");
        };

        const base64UrlToBuf = (b64url) => {
          if (!b64url) return new Uint8Array();
          const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
          const padded = b64 + "=".repeat((4 - (b64.length % 4)) % 4);
          const bin = atob(padded);
          const out = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
          return out;
        };

        const postResult = async (payload) => {
          const resp = await fetch("/__netcatty_webauthn/complete", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          });
          const text = await resp.text().catch(() => "");
          if (!resp.ok) throw new Error("Failed to deliver result: " + resp.status + " " + text);
        };

        const run = async () => {
          if (!window.PublicKeyCredential || !navigator.credentials) {
            throw new Error("WebAuthn is not supported in this browser.");
          }
          if (!window.isSecureContext) {
            throw new Error("WebAuthn requires a secure context (HTTPS/localhost).");
          }

          if (!token) throw new Error("Missing token.");

          setStatus("Requesting WebAuthn...\\nIf nothing appears, ensure Touch ID/Passkeys are enabled.");
          runBtn.disabled = true;

          if (mode === "create") {
            const userId = new Uint8Array(32);
            crypto.getRandomValues(userId);

            const publicKey = {
              challenge: crypto.getRandomValues(new Uint8Array(32)),
              rp: { id: rpId, name: "Netcatty SSH Manager" },
              user: { id: userId, name, displayName },
              pubKeyCredParams: [
                { type: "public-key", alg: -7 },    // ES256
                { type: "public-key", alg: -257 },  // RS256
              ],
              authenticatorSelection: {
                authenticatorAttachment: attachment,
                residentKey: "discouraged",
                userVerification: uv,
              },
              timeout: timeoutMs,
              attestation: "none",
            };

            const credential = await navigator.credentials.create({ publicKey });
            if (!credential) throw new Error("Credential creation was cancelled.");

            const resp = credential.response;
            const attestationObject = resp.attestationObject ? bufToBase64Url(resp.attestationObject) : "";
            const clientDataJSON = resp.clientDataJSON ? bufToBase64Url(resp.clientDataJSON) : "";
            const rawId = credential.rawId ? bufToBase64Url(credential.rawId) : "";
            const spki = typeof resp.getPublicKey === "function" ? resp.getPublicKey() : null;
            const publicKeySpki = spki && spki.byteLength ? bufToBase64Url(spki) : "";

            await postResult({
              token,
              ok: true,
              mode,
              result: {
                rpId,
                origin: window.location.origin,
                credentialId: rawId,
                attestationObject,
                clientDataJSON,
                publicKeySpki,
              },
            });

            setStatus("Success. You can close this tab.");
            return;
          }

          if (mode === "get") {
            if (!credentialIdB64) throw new Error("Missing credentialId.");
            if (!challengeB64) throw new Error("Missing challenge.");

            const idBytes = base64UrlToBuf(credentialIdB64);
            const challengeBytes = base64UrlToBuf(challengeB64);

            const publicKey = {
              rpId,
              challenge: challengeBytes,
              allowCredentials: [{ type: "public-key", id: idBytes }],
              userVerification: uv,
              timeout: timeoutMs,
            };

            const assertion = await navigator.credentials.get({ publicKey });
            if (!assertion) throw new Error("Credential assertion was cancelled.");

            const resp = assertion.response;
            const rawId = assertion.rawId ? bufToBase64Url(assertion.rawId) : "";
            const authenticatorData = resp.authenticatorData ? bufToBase64Url(resp.authenticatorData) : "";
            const clientDataJSON = resp.clientDataJSON ? bufToBase64Url(resp.clientDataJSON) : "";
            const signature = resp.signature ? bufToBase64Url(resp.signature) : "";
            const userHandle = resp.userHandle ? bufToBase64Url(resp.userHandle) : null;

            await postResult({
              token,
              ok: true,
              mode,
              result: {
                rpId,
                origin: window.location.origin,
                credentialId: rawId,
                authenticatorData,
                clientDataJSON,
                signature,
                userHandle,
              },
            });

            setStatus("Success. You can close this tab.");
            return;
          }

          throw new Error("Unknown mode: " + mode);
        };

        const runWithUi = async () => {
          try {
            await run();
          } catch (e) {
            const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
            const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
            setStatus((name ? name + ": " : "") + msg);
            runBtn.disabled = false;
            // For most failures, notify Electron so it can stop waiting.
            // If the failure is due to missing user activation, let the user click again.
            if (name !== "NotAllowedError") {
              try {
                await postResult({ token, ok: false, mode, error: (name ? name + ": " : "") + msg });
              } catch {}
            }
          }
        };

        runBtn.addEventListener("click", () => void runWithUi());
        closeBtn.addEventListener("click", () => window.close());

        // Best-effort auto-run: if it fails due to user activation, the button remains available.
        void runWithUi();
      })();
    </script>
  </body>
</html>`;
}

async function ensureServer() {
  if (baseUrl) return baseUrl;

  server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const pathname = url.pathname;

      if (req.method === "GET" && pathname === "/__netcatty_webauthn") {
        return writeHtml(res, getHelperHtml());
      }

      if (req.method === "POST" && pathname === "/__netcatty_webauthn/complete") {
        const bodyText = await bufToUtf8(req);
        let payload;
        try {
          payload = JSON.parse(bodyText || "{}");
        } catch {
          return writeJson(res, 400, { ok: false, error: "Invalid JSON" });
        }

        const token = payload?.token;
        if (!token || typeof token !== "string") {
          return writeJson(res, 400, { ok: false, error: "Missing token" });
        }

        const entry = pending.get(token);
        if (!entry) {
          return writeJson(res, 404, { ok: false, error: "Unknown or expired token" });
        }

        if (payload?.mode && payload.mode !== entry.mode) {
          pending.delete(token);
          clearTimeout(entry.timeout);
          entry.reject(new Error("Mismatched WebAuthn response mode"));
          return writeJson(res, 400, { ok: false, error: "Mismatched mode" });
        }

        pending.delete(token);
        clearTimeout(entry.timeout);

        if (payload?.ok) {
          entry.resolve(payload.result || null);
        } else {
          entry.reject(new Error(payload?.error || "WebAuthn request failed"));
        }

        return writeJson(res, 200, { ok: true });
      }

      return writeJson(res, 404, { ok: false, error: "Not Found" });
    } catch (err) {
      return writeJson(res, 500, { ok: false, error: err?.message || String(err) });
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });

  const address = server.address();
  const port = address && typeof address === "object" ? address.port : null;
  if (!port) throw new Error("Failed to bind WebAuthn helper server");

  baseUrl = `http://localhost:${port}`;
  return baseUrl;
}

function makeToken() {
  return crypto.randomBytes(16).toString("hex");
}

async function openInBrowser(url) {
  const { shell } = resolveElectronModule();
  await shell.openExternal(url);
}

async function createCredentialInBrowser(options) {
  const {
    rpId,
    name,
    displayName,
    authenticatorAttachment = "platform",
    userVerification = "required",
    timeoutMs = 180000,
  } = options || {};

  if (typeof rpId !== "string" || !rpId) throw new Error("Missing rpId");

  const helperBase = await ensureServer();
  const token = makeToken();

  const url = new URL(`${helperBase}/__netcatty_webauthn`);
  url.searchParams.set("mode", "create");
  url.searchParams.set("token", token);
  url.searchParams.set("rpId", rpId);
  url.searchParams.set("name", typeof name === "string" && name ? name : "user");
  url.searchParams.set("displayName", typeof displayName === "string" && displayName ? displayName : (typeof name === "string" ? name : "user"));
  url.searchParams.set("attachment", authenticatorAttachment);
  url.searchParams.set("uv", userVerification);
  url.searchParams.set("timeoutMs", String(Math.max(1000, Number(timeoutMs) || 180000)));

  await openInBrowser(url.toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(token);
      reject(new Error("WebAuthn browser flow timed out"));
    }, Math.max(1000, Number(timeoutMs) || 180000));

    pending.set(token, { mode: "create", resolve, reject, timeout });
  });
}

async function getAssertionInBrowser(options) {
  const {
    rpId,
    credentialId,
    challenge,
    userVerification = "preferred",
    timeoutMs = 180000,
  } = options || {};

  if (typeof rpId !== "string" || !rpId) throw new Error("Missing rpId");
  if (typeof credentialId !== "string" || !credentialId) throw new Error("Missing credentialId");
  if (typeof challenge !== "string" || !challenge) throw new Error("Missing challenge");

  const helperBase = await ensureServer();
  const token = makeToken();

  const url = new URL(`${helperBase}/__netcatty_webauthn`);
  url.searchParams.set("mode", "get");
  url.searchParams.set("token", token);
  url.searchParams.set("rpId", rpId);
  url.searchParams.set("credentialId", credentialId);
  url.searchParams.set("challenge", challenge);
  url.searchParams.set("uv", userVerification);
  url.searchParams.set("timeoutMs", String(Math.max(1000, Number(timeoutMs) || 180000)));

  await openInBrowser(url.toString());

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      pending.delete(token);
      reject(new Error("WebAuthn browser flow timed out"));
    }, Math.max(1000, Number(timeoutMs) || 180000));

    pending.set(token, { mode: "get", resolve, reject, timeout });
  });
}

function shutdown() {
  if (server) {
    try {
      server.close();
    } catch {}
  }
  server = null;
  baseUrl = null;

  // Reject pending requests
  for (const [token, entry] of pending.entries()) {
    clearTimeout(entry.timeout);
    entry.reject(new Error("WebAuthn helper server shut down"));
    pending.delete(token);
  }
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:webauthn:browser:create", async (_event, options) => {
    return createCredentialInBrowser(options);
  });
  ipcMain.handle("netcatty:webauthn:browser:get", async (_event, options) => {
    return getAssertionInBrowser(options);
  });
}

module.exports = {
  registerHandlers,
  createCredentialInBrowser,
  getAssertionInBrowser,
  shutdown,
};

