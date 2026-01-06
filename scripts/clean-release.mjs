import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryableWindowsFsError(error) {
  const code = /** @type {{ code?: string } | null} */ (error)?.code;
  return code === "EPERM" || code === "EACCES" || code === "EBUSY";
}

async function rmWithRetries(targetPath, { maxAttempts = 10 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await fs.rm(targetPath, { recursive: true, force: true });
      return;
    } catch (error) {
      if (!isRetryableWindowsFsError(error) || attempt === maxAttempts) {
        throw error;
      }
      const backoffMs = Math.min(2000, 200 * attempt);
      await sleep(backoffMs);
    }
  }
}

async function pathExists(targetPath) {
  try {
    await fs.stat(targetPath);
    return true;
  } catch (error) {
    if ((/** @type {{ code?: string } } */ (error)).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

async function quarantineDir(targetPath) {
  if (!(await pathExists(targetPath))) return null;
  const dirName = path.basename(targetPath);
  const parentDir = path.dirname(targetPath);
  const quarantinedPath = path.join(
    parentDir,
    `${dirName}.old-${new Date().toISOString().replace(/[:.]/g, "-")}`
  );

  await fs.rename(targetPath, quarantinedPath);
  return quarantinedPath;
}

async function main() {
  const releaseDir = path.join(repoRoot, "release");

  let entries;
  try {
    entries = await fs.readdir(releaseDir, { withFileTypes: true });
  } catch (error) {
    // No release dir yet.
    if ((/** @type {{ code?: string } } */ (error)).code === "ENOENT") {
      return;
    }
    throw error;
  }

  const unpackedDirs = entries
    .filter((e) => e.isDirectory() && e.name.endsWith("-unpacked"))
    .map((e) => path.join(releaseDir, e.name));

  // Also remove the most common one explicitly, even if readdir is blocked by ACL.
  unpackedDirs.push(path.join(releaseDir, "win-unpacked"));

  const uniqueTargets = Array.from(new Set(unpackedDirs));
  for (const target of uniqueTargets) {
    if (!(await pathExists(target))) continue;
    try {
      await rmWithRetries(target);
    } catch (error) {
      if (!isRetryableWindowsFsError(error)) {
        throw error;
      }

      // If Windows is holding a lock (Defender scan / running app / etc.),
      // try to move the directory out of the way so electron-builder can proceed.
      let quarantinedPath = null;
      try {
        quarantinedPath = await quarantineDir(target);
      } catch (renameError) {
        const messageLines = [
          `Failed to clean '${target}' due to a Windows file lock (e.g. Netcatty still running, antivirus scan, or a process holding a DLL).`,
          "Close any running Netcatty instance, then retry `npm run pack`.",
          "If it still fails, exclude this repo or the `release/` folder from antivirus/Defender real-time scanning.",
        ];
        const combined = new Error(messageLines.join("\n"));
        // @ts-ignore
        combined.cause = renameError;
        throw combined;
      }

      if (quarantinedPath) {
        try {
          await rmWithRetries(quarantinedPath, { maxAttempts: 3 });
        } catch {
          // Best-effort: leave quarantined folder behind.
        }
      }
    }
  }
}

await main();
