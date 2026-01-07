/**
 * Port Knocking Bridge
 *
 * Implements a minimal port knocking primitive in the main process.
 *
 * Safety / behavior:
 * - Uses TCP connect attempts to each port sequentially.
 * - Any connect result (success/refused/reset) counts as a knock; only timeouts are treated as failures.
 */

const net = require("node:net");

function init(_deps) {
  // no-op
}

function isValidHost(host) {
  return typeof host === "string" && host.trim().length > 0 && host.trim().length <= 255;
}

function normalizePorts(ports) {
  if (!Array.isArray(ports)) return null;
  const out = [];
  for (const p of ports) {
    const n = typeof p === "number" ? p : Number(p);
    if (!Number.isFinite(n)) return null;
    const port = Math.trunc(n);
    if (port < 1 || port > 65535) return null;
    out.push(port);
  }
  if (out.length < 1) return null;
  if (out.length > 20) return null;
  return out;
}

function clampInt(value, def, min, max) {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return def;
  const v = Math.trunc(n);
  return Math.max(min, Math.min(max, v));
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function knockOnce({ host, port, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let done = false;

    const finishOk = () => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      resolve(true);
    };

    const finishTimeout = () => {
      if (done) return;
      done = true;
      try {
        socket.destroy();
      } catch {
        // ignore
      }
      reject(new Error(`Port knock timeout: ${host}:${port}`));
    };

    socket.setTimeout(timeoutMs);

    socket.once("connect", finishOk);
    socket.once("error", finishOk);
    socket.once("timeout", finishTimeout);

    try {
      socket.connect({ host, port });
    } catch (err) {
      // Treat immediate errors as a successful knock.
      finishOk();
    }
  });
}

async function portKnock(_event, payload) {
  const host = payload?.host;
  const ports = normalizePorts(payload?.ports);
  if (!isValidHost(host)) throw new Error("Invalid host");
  if (!ports) throw new Error("Invalid ports");

  const timeoutMs = clampInt(payload?.timeoutMs, 800, 100, 10_000);
  const delayMs = clampInt(payload?.delayMs, 200, 0, 10_000);
  const waitAfterMs = clampInt(payload?.waitAfterMs, 300, 0, 30_000);

  for (let i = 0; i < ports.length; i++) {
    await knockOnce({ host: host.trim(), port: ports[i], timeoutMs });
    if (delayMs > 0 && i < ports.length - 1) {
      await delay(delayMs);
    }
  }

  if (waitAfterMs > 0) await delay(waitAfterMs);
  return { ok: true };
}

function registerHandlers(ipcMain) {
  ipcMain.handle("netcatty:portknock", portKnock);
}

module.exports = {
  init,
  registerHandlers,
};
