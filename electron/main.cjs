// Make sure the helper processes do not get forced into Node-only mode.
// Presence of ELECTRON_RUN_AS_NODE (even "0") makes helpers parse Chromium
// switches as Node flags, leading to "bad option: --type=renderer".
if (process.env.ELECTRON_RUN_AS_NODE) {
  delete process.env.ELECTRON_RUN_AS_NODE;
}

let electronModule;
try {
  electronModule = require("node:electron");
} catch {
  electronModule = require("electron");
}
console.log("electron module raw:", electronModule);
console.log("process.versions:", process.versions);
console.log("env ELECTRON_RUN_AS_NODE:", process.env.ELECTRON_RUN_AS_NODE);
const { app, BrowserWindow } = electronModule || {};
if (!app || !BrowserWindow) {
  throw new Error("Failed to load Electron runtime. Ensure the app is launched with the Electron binary.");
}
const path = require("node:path");
const os = require("node:os");
const fs = require("node:fs");
const pty = require("node-pty");
const SftpClient = require("ssh2-sftp-client");
const { Client: SSHClient } = require("ssh2");

// GPU: keep hardware acceleration enabled for smoother rendering
// (If you hit GPU issues, you can restore these switches.)
// app.commandLine.appendSwitch("disable-gpu");
// app.commandLine.appendSwitch("disable-software-rasterizer");
app.commandLine.appendSwitch("no-sandbox");

const devServerUrl = process.env.VITE_DEV_SERVER_URL;
const isDev = !!devServerUrl;
const preload = path.join(__dirname, "preload.cjs");
const isMac = process.platform === "darwin";
const appIcon = path.join(__dirname, "../public/icon.png");

const sessions = new Map();
const sftpClients = new Map();
const keyRoot = path.join(os.homedir(), ".nebula-ssh", "keys");

// On Windows, node-pty with conpty needs full paths to executables
const findExecutable = (name) => {
  if (process.platform !== "win32") return name;
  
  const { execSync } = require("child_process");
  try {
    const result = execSync(`where.exe ${name}`, { encoding: "utf8" });
    const firstLine = result.split(/\r?\n/)[0].trim();
    if (firstLine && fs.existsSync(firstLine)) {
      return firstLine;
    }
  } catch (err) {
    console.warn(`Could not find ${name} via where.exe:`, err.message);
  }
  
  // Fallback to common locations
  const commonPaths = [
    path.join(process.env.SystemRoot || "C:\\Windows", "System32", "OpenSSH", `${name}.exe`),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", "usr", "bin", `${name}.exe`),
    path.join(process.env.ProgramFiles || "C:\\Program Files", "OpenSSH", `${name}.exe`),
  ];
  
  for (const p of commonPaths) {
    if (fs.existsSync(p)) return p;
  }
  
  return name; // Fall back to bare name
};

const ensureKeyDir = () => {
  try {
    fs.mkdirSync(keyRoot, { recursive: true, mode: 0o700 });
  } catch (err) {
    console.warn("Unable to ensure key cache dir", err);
  }
};

const writeKeyToDisk = (keyId, privateKey) => {
  if (!privateKey) return null;
  ensureKeyDir();
  const filename = `${keyId || "temp"}.pem`;
  const target = path.join(keyRoot, filename);
  const normalized = privateKey.endsWith("\n") ? privateKey : `${privateKey}\n`;
  try {
    fs.writeFileSync(target, normalized, { mode: 0o600 });
    return target;
  } catch (err) {
    console.error("Failed to persist private key", err);
    return null;
  }
};

const registerSSHBridge = (win) => {
  if (registerSSHBridge._registered) return;
  registerSSHBridge._registered = true;

  // Pure ssh2-based SSH session (no external ssh.exe required)
  const start = (event, options) => {
    return new Promise((resolve, reject) => {
      const sessionId =
        options.sessionId ||
        `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const conn = new SSHClient();
      const cols = options.cols || 80;
      const rows = options.rows || 24;

      const connectOpts = {
        host: options.hostname,
        port: options.port || 22,
        username: options.username || "root",
        readyTimeout: 30000,
        keepaliveInterval: 10000,
      };

      // Authentication: private key takes precedence
      if (options.privateKey) {
        connectOpts.privateKey = options.privateKey;
        if (options.passphrase) {
          connectOpts.passphrase = options.passphrase;
        }
      } else if (options.password) {
        connectOpts.password = options.password;
      }

      // Agent forwarding
      if (options.agentForwarding) {
        connectOpts.agentForward = true;
        if (process.platform === "win32") {
          connectOpts.agent = "\\\\.\\pipe\\openssh-ssh-agent";
        } else {
          connectOpts.agent = process.env.SSH_AUTH_SOCK;
        }
      }

      conn.on("ready", () => {
        conn.shell(
          {
            term: "xterm-256color",
            cols,
            rows,
            env: { LANG: options.charset || "en_US.UTF-8" },
          },
          (err, stream) => {
            if (err) {
              conn.end();
              reject(err);
              return;
            }

            const session = {
              conn,
              stream,
              webContentsId: event.sender.id,
            };
            sessions.set(sessionId, session);

            stream.on("data", (data) => {
              const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
              contents?.send("nebula:data", { sessionId, data: data.toString("utf8") });
            });

            stream.stderr?.on("data", (data) => {
              const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
              contents?.send("nebula:data", { sessionId, data: data.toString("utf8") });
            });

            stream.on("close", () => {
              const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
              contents?.send("nebula:exit", { sessionId, exitCode: 0 });
              sessions.delete(sessionId);
              conn.end();
            });

            // Run startup command if specified
            if (options.startupCommand) {
              setTimeout(() => {
                stream.write(`${options.startupCommand}\n`);
              }, 300);
            }

            resolve({ sessionId });
          }
        );
      });

      conn.on("error", (err) => {
        console.error("SSH connection error:", err.message);
        const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
        contents?.send("nebula:exit", { sessionId, exitCode: 1, error: err.message });
        sessions.delete(sessionId);
        reject(err);
      });

      conn.on("close", () => {
        const contents = BrowserWindow.fromWebContents(event.sender)?.webContents;
        contents?.send("nebula:exit", { sessionId, exitCode: 0 });
        sessions.delete(sessionId);
      });

      conn.connect(connectOpts);
    });
  };

  const write = (_event, payload) => {
    const session = sessions.get(payload.sessionId);
    session?.stream?.write(payload.data);
  };

  const resize = (_event, payload) => {
    const session = sessions.get(payload.sessionId);
    if (!session?.stream) return;
    try {
      session.stream.setWindow(payload.rows, payload.cols, 0, 0);
    } catch (err) {
      console.warn("Resize failed", err);
    }
  };

  const close = (_event, payload) => {
    const session = sessions.get(payload.sessionId);
    if (!session) return;
    try {
      session.stream?.close();
      session.conn?.end();
    } catch (err) {
      console.warn("Close failed", err);
    }
    sessions.delete(payload.sessionId);
  };

  electronModule.ipcMain.handle("nebula:start", start);
  electronModule.ipcMain.handle("nebula:local:start", (event, payload) => {
    const sessionId =
      payload?.sessionId ||
      `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const defaultShell = process.platform === "win32" 
      ? findExecutable("powershell") || "powershell.exe"
      : process.env.SHELL || "/bin/bash";
    const shell = payload?.shell || defaultShell;
    const env = {
      ...process.env,
      ...(payload?.env || {}),
      TERM: "xterm-256color",
    };
    const proc = pty.spawn(shell, [], {
      cols: payload?.cols || 80,
      rows: payload?.rows || 24,
      env,
    });
    const session = {
      proc,
      webContentsId: event.sender.id,
    };
    sessions.set(sessionId, session);
    proc.onData((data) => {
      const contents = electronModule.webContents.fromId(session.webContentsId);
      contents?.send("nebula:data", { sessionId, data });
    });
    proc.onExit((evt) => {
      sessions.delete(sessionId);
      const contents = electronModule.webContents.fromId(session.webContentsId);
      contents?.send("nebula:exit", { sessionId, ...evt });
    });
    return { sessionId };
  });
  electronModule.ipcMain.on("nebula:write", write);
  electronModule.ipcMain.on("nebula:resize", resize);
  electronModule.ipcMain.on("nebula:close", close);

  // One-off hidden exec (for probes like distro detection)
  const execOnce = async (_event, payload) => {
    return new Promise((resolve, reject) => {
      const conn = new SSHClient();
      let stdout = "";
      let stderr = "";
      let settled = false;
      const timeoutMs = payload.timeout || 10000;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        conn.end();
        reject(new Error("SSH exec timeout"));
      }, timeoutMs);

      conn
        .on("ready", () => {
          conn.exec(payload.command, (err, stream) => {
            if (err) {
              clearTimeout(timer);
              settled = true;
              conn.end();
              return reject(err);
            }
            stream
              .on("data", (data) => {
                stdout += data.toString();
              })
              .stderr.on("data", (data) => {
                stderr += data.toString();
              })
              .on("close", (code) => {
                if (settled) return;
                clearTimeout(timer);
                settled = true;
                conn.end();
                resolve({ stdout, stderr, code });
              });
          });
        })
        .on("error", (err) => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          reject(err);
        })
        .on("end", () => {
          if (settled) return;
          clearTimeout(timer);
          settled = true;
          resolve({ stdout, stderr, code: null });
        });

      conn.connect({
        host: payload.hostname,
        port: payload.port || 22,
        username: payload.username,
        password: payload.password,
        privateKey: payload.privateKey,
        readyTimeout: timeoutMs,
        keepaliveInterval: 0,
      });
    });
  };

  electronModule.ipcMain.handle("nebula:ssh:exec", execOnce);

  // SFTP handlers
  const openSftp = async (_event, options) => {
    const client = new SftpClient();
    const connId = options.sessionId || `${Date.now()}-sftp-${Math.random().toString(16).slice(2)}`;
    const connectOpts = {
      host: options.hostname,
      port: options.port || 22,
      username: options.username || "root",
    };
    if (options.privateKey) {
      connectOpts.privateKey = options.privateKey;
    } else if (options.password) {
      connectOpts.password = options.password;
    }
    await client.connect(connectOpts);
    sftpClients.set(connId, client);
    return { sftpId: connId };
  };

  const listSftp = async (_event, payload) => {
    const client = sftpClients.get(payload.sftpId);
    if (!client) throw new Error("SFTP session not found");
    const list = await client.list(payload.path || ".");
    return list.map((item) => ({
      name: item.name,
      type: item.type === "d" ? "directory" : "file",
      size: `${item.size} bytes`,
      lastModified: new Date(item.modifyTime || Date.now()).toISOString(),
    }));
  };

  const readSftp = async (_event, payload) => {
    const client = sftpClients.get(payload.sftpId);
    if (!client) throw new Error("SFTP session not found");
    const buffer = await client.get(payload.path);
    return buffer.toString();
  };

  const writeSftp = async (_event, payload) => {
    const client = sftpClients.get(payload.sftpId);
    if (!client) throw new Error("SFTP session not found");
    await client.put(Buffer.from(payload.content, "utf-8"), payload.path);
    return true;
  };

  const closeSftp = async (_event, payload) => {
    const client = sftpClients.get(payload.sftpId);
    if (!client) return;
    try {
      await client.end();
    } catch (err) {
      console.warn("SFTP close failed", err);
    }
    sftpClients.delete(payload.sftpId);
  };

  const mkdirSftp = async (_event, payload) => {
    const client = sftpClients.get(payload.sftpId);
    if (!client) throw new Error("SFTP session not found");
    await client.mkdir(payload.path, true);
    return true;
  };

  electronModule.ipcMain.handle("nebula:sftp:open", openSftp);
  electronModule.ipcMain.handle("nebula:sftp:list", listSftp);
  electronModule.ipcMain.handle("nebula:sftp:read", readSftp);
  electronModule.ipcMain.handle("nebula:sftp:write", writeSftp);
  electronModule.ipcMain.handle("nebula:sftp:close", closeSftp);
  electronModule.ipcMain.handle("nebula:sftp:mkdir", mkdirSftp);
};

async function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    backgroundColor: "#0b1220",
    icon: appIcon,
    titleBarStyle: isMac ? "hiddenInset" : "hidden",
    titleBarOverlay: {
      color: isMac ? "#0b1220" : "#0b1220",
      symbolColor: "#ffffff",
      height: 44,
    },
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  if (isDev) {
    try {
      await win.loadURL(devServerUrl);
      win.webContents.openDevTools({ mode: "detach" });
      registerSSHBridge(win);
      return;
    } catch (e) {
      console.warn("Dev server not reachable, falling back to bundled dist.", e);
    }
  }

  const indexPath = path.join(__dirname, "../dist/index.html");
  await win.loadFile(indexPath);
  registerSSHBridge(win);
}

app.whenReady().then(() => {
  if (isMac && appIcon && app.dock?.setIcon) {
    try {
      app.dock.setIcon(appIcon);
    } catch (err) {
      console.warn("Failed to set dock icon", err);
    }
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
