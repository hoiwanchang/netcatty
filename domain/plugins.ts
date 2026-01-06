export type InstalledPluginManifest = {
  id: string;
  name: string;
  version: string;
  description?: string;
  homepage?: string;
};

export const isValidPluginId = (id: string): boolean => {
  // Keep it conservative: ASCII letters/digits, dash and underscore.
  // Must be filesystem-friendly but also allow existing built-in camelCase ids.
  return /^[A-Za-z0-9][A-Za-z0-9_-]{1,63}$/.test(id);
};
