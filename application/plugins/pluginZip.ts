import { unzipSync, strFromU8 } from "fflate";
import type { InstalledPluginManifest } from "../../domain/plugins";
import { isValidPluginId } from "../../domain/plugins";

export class PluginZipError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PluginZipError";
  }
}

const readFileAsUint8Array = async (file: File): Promise<Uint8Array> => {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
};

export const parsePluginZip = async (file: File): Promise<InstalledPluginManifest> => {
  if (!file) throw new PluginZipError("No file provided");
  if (!/\.zip$/i.test(file.name)) {
    throw new PluginZipError("Only .zip files are supported");
  }

  const bytes = await readFileAsUint8Array(file);
  let unzipped: Record<string, Uint8Array>;
  try {
    unzipped = unzipSync(bytes);
  } catch {
    throw new PluginZipError("Invalid zip file");
  }

  const manifestPath = Object.keys(unzipped).find((p) => p === "manifest.json" || p.endsWith("/manifest.json"));
  if (!manifestPath) {
    throw new PluginZipError("manifest.json not found in zip");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(strFromU8(unzipped[manifestPath]));
  } catch {
    throw new PluginZipError("manifest.json is not valid JSON");
  }

  if (!raw || typeof raw !== "object") {
    throw new PluginZipError("manifest.json must be an object");
  }

  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === "string" ? obj.id.trim() : "";
  const name = typeof obj.name === "string" ? obj.name.trim() : "";
  const version = typeof obj.version === "string" ? obj.version.trim() : "";
  const description = typeof obj.description === "string" ? obj.description.trim() : undefined;
  const homepage = typeof obj.homepage === "string" ? obj.homepage.trim() : undefined;

  if (!id || !isValidPluginId(id)) {
    throw new PluginZipError(
      "Invalid plugin id. Expect 2-64 chars: letters/digits and -/_ (e.g. my_plugin-1)",
    );
  }
  if (!name) throw new PluginZipError("Plugin name is required");
  if (!version) throw new PluginZipError("Plugin version is required");

  return { id, name, version, description, homepage };
};
