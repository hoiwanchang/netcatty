import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { localStorageAdapter } from '../../infrastructure/persistence/localStorageAdapter';
import { STORAGE_KEY_PLUGINS } from '../../infrastructure/config/storageKeys';
import { netcattyBridge } from '../../infrastructure/services/netcattyBridge';
import type { InstalledPluginManifest } from '../../domain/plugins';
import { parsePluginZip, PluginZipError } from './pluginZip';

export type PluginsState = {
  schemaVersion: 2;
  enabled: Record<string, boolean>;
  pluginSettings: Record<string, unknown>;
  gitRepositoryUrl: string;
};

export type PluginListItem = InstalledPluginManifest;

const DEFAULT_ENABLED_BY_ID: Record<string, boolean> = {
  ai: false,
  zebra: false,
  commandCandidates: false,
  serverStatus: false,
};

const buildDefaultState = (): PluginsState => ({
  schemaVersion: 2,
  enabled: {},
  pluginSettings: {},
  gitRepositoryUrl: '',
});

const normalizeState = (
  raw: unknown,
): {
  persisted: PluginsState;
  legacyInstalled: Record<string, InstalledPluginManifest>;
} => {
  const base = buildDefaultState();
  if (!raw || typeof raw !== 'object') return { persisted: base, legacyInstalled: {} };

  // legacy v2 shape: { schemaVersion: 2, enabled, installed, pluginSettings }
  const obj = raw as {
    enabled?: unknown;
    installed?: unknown;
    pluginSettings?: unknown;
    gitRepositoryUrl?: unknown;
  };

  const enabled: Record<string, boolean> = { ...base.enabled };
  if (obj.enabled && typeof obj.enabled === 'object') {
    const map = obj.enabled as Record<string, unknown>;
    for (const [k, v] of Object.entries(map)) {
      if (typeof v === 'boolean') enabled[k] = v;
    }
  }

  const legacyInstalled: Record<string, InstalledPluginManifest> = {};
  if (obj.installed && typeof obj.installed === 'object') {
    const map = obj.installed as Record<string, unknown>;
    for (const [k, v] of Object.entries(map)) {
      if (!v || typeof v !== 'object') continue;
      const vv = v as Record<string, unknown>;
      const id = typeof vv.id === 'string' ? vv.id : k;
      const name = typeof vv.name === 'string' ? vv.name : '';
      const version = typeof vv.version === 'string' ? vv.version : '';
      if (!id || !name || !version) continue;
      legacyInstalled[id] = {
        id,
        name,
        version,
        description: typeof vv.description === 'string' ? vv.description : undefined,
        homepage: typeof vv.homepage === 'string' ? vv.homepage : undefined,
      };
    }
  }

  const pluginSettings: Record<string, unknown> =
    obj.pluginSettings && typeof obj.pluginSettings === 'object'
      ? (obj.pluginSettings as Record<string, unknown>)
      : {};

  const gitRepositoryUrl = typeof obj.gitRepositoryUrl === 'string' ? obj.gitRepositoryUrl : '';

  return {
    persisted: { schemaVersion: 2, enabled, pluginSettings, gitRepositoryUrl },
    legacyInstalled,
  };
};

const readPluginsState = () => {
  const stored = localStorageAdapter.read<unknown>(STORAGE_KEY_PLUGINS);
  return normalizeState(stored);
};

type PluginsContextValue = {
  state: PluginsState;
  isEnabled: (id: string) => boolean;
  setEnabled: (id: string, enabled: boolean) => void;
  toggle: (id: string) => void;
  definitions: PluginListItem[];
  installFromZip: (file: File) => Promise<InstalledPluginManifest>;
  updateFromZip: (id: string, file: File) => Promise<InstalledPluginManifest>;
  deletePlugin: (id: string) => Promise<void>;
  setGitRepositoryUrl: (url: string) => void;
};

const PluginsContext = createContext<PluginsContextValue | null>(null);

export const PluginsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const initial = useMemo(() => readPluginsState(), []);
  const legacyInstalledRef = useRef<Record<string, InstalledPluginManifest>>(initial.legacyInstalled);

  const [state, setState] = useState<PluginsState>(() => initial.persisted);
  const [installed, setInstalled] = useState<Record<string, InstalledPluginManifest>>({});

  useEffect(() => {
    localStorageAdapter.write(STORAGE_KEY_PLUGINS, state);
  }, [state]);

  const refreshInstalled = useCallback(async () => {
    const api = netcattyBridge.get();
    if (!api?.pluginsList) {
      setInstalled(legacyInstalledRef.current);
      return;
    }

    let list: InstalledPluginManifest[] = [];
    try {
      list = (await api.pluginsList()) as InstalledPluginManifest[];
    } catch {
      setInstalled(legacyInstalledRef.current);
      return;
    }
    const map: Record<string, InstalledPluginManifest> = {};
    for (const p of list) {
      if (!p || typeof p.id !== 'string') continue;
      map[p.id] = p;
    }
    setInstalled(map);

    // Ensure enabled state exists for any newly discovered plugins.
    setState((prev) => {
      const nextEnabled = { ...prev.enabled };
      let changed = false;
      for (const id of Object.keys(map)) {
        if (typeof nextEnabled[id] === 'boolean') continue;
        nextEnabled[id] = typeof DEFAULT_ENABLED_BY_ID[id] === 'boolean' ? DEFAULT_ENABLED_BY_ID[id] : true;
        changed = true;
      }
      return changed ? { ...prev, schemaVersion: 2, enabled: nextEnabled } : prev;
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const api = netcattyBridge.get();

      // Migrate legacy installed manifests from localStorage into the on-disk plugins folder.
      if (api?.pluginsInstall) {
        const legacy = Object.values(legacyInstalledRef.current) as InstalledPluginManifest[];
        for (const m of legacy) {
          try {
            await api.pluginsInstall(m);
          } catch {
            // ignore
          }
        }
        legacyInstalledRef.current = {};
      }

      if (!cancelled) await refreshInstalled();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [refreshInstalled]);

  const isEnabled = useCallback(
    (id: string) => Boolean(installed[id]) && Boolean(state.enabled[id]),
    [installed, state.enabled],
  );

  const setEnabled = useCallback((id: string, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      schemaVersion: 2,
      enabled: {
        ...prev.enabled,
        [id]: enabled,
      },
    }));
  }, []);

  const toggle = useCallback((id: string) => {
    setState((prev) => ({
      ...prev,
      schemaVersion: 2,
      enabled: {
        ...prev.enabled,
        [id]: !prev.enabled[id],
      },
    }));
  }, []);

  const ensureEnabledEntry = useCallback((id: string) => {
    setState((prev) => {
      if (typeof prev.enabled[id] === 'boolean') return prev;
      return {
        ...prev,
        schemaVersion: 2,
        enabled: {
          ...prev.enabled,
          [id]: typeof DEFAULT_ENABLED_BY_ID[id] === 'boolean' ? DEFAULT_ENABLED_BY_ID[id] : true,
        },
      };
    });
  }, []);

  const installFromZip = useCallback(
    async (file: File): Promise<InstalledPluginManifest> => {
      let manifest: InstalledPluginManifest;
      try {
        manifest = await parsePluginZip(file);
      } catch (e) {
        if (e instanceof PluginZipError) throw e;
        throw new PluginZipError('Failed to parse plugin zip');
      }

      const api = netcattyBridge.get();
      if (api?.pluginsInstall) {
        await api.pluginsInstall(manifest);
        await refreshInstalled();
      } else {
        setInstalled((prev) => ({ ...prev, [manifest.id]: manifest }));
      }

      ensureEnabledEntry(manifest.id);
      return manifest;
    },
    [ensureEnabledEntry, refreshInstalled],
  );

  const updateFromZip = useCallback(
    async (id: string, file: File): Promise<InstalledPluginManifest> => {
      const manifest = await parsePluginZip(file);
      if (manifest.id !== id) {
        throw new PluginZipError('Plugin id mismatch: zip does not match the plugin being updated');
      }

      const api = netcattyBridge.get();
      if (api?.pluginsInstall) {
        await api.pluginsInstall(manifest);
        await refreshInstalled();
      } else {
        setInstalled((prev) => ({ ...prev, [id]: manifest }));
      }

      ensureEnabledEntry(id);
      return manifest;
    },
    [ensureEnabledEntry, refreshInstalled],
  );

  const deletePlugin = useCallback(
    async (id: string) => {
      const api = netcattyBridge.get();
      if (api?.pluginsDelete) {
        await api.pluginsDelete(id);
        await refreshInstalled();
      } else {
        setInstalled((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }

      setState((prev) => {
        const nextEnabled = { ...prev.enabled };
        delete nextEnabled[id];
        const nextSettings = { ...prev.pluginSettings };
        delete nextSettings[id];
        return { ...prev, schemaVersion: 2, enabled: nextEnabled, pluginSettings: nextSettings };
      });
    },
    [refreshInstalled],
  );

  const setGitRepositoryUrl = useCallback((url: string) => {
    setState((prev) => ({
      ...prev,
      schemaVersion: 2,
      gitRepositoryUrl: url,
    }));
  }, []);

  const definitions = useMemo<PluginListItem[]>(() => {
    return (Object.values(installed) as InstalledPluginManifest[])
      .slice()
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [installed]);

  const value = useMemo<PluginsContextValue>(
    () => ({
      state,
      isEnabled,
      setEnabled,
      toggle,
      definitions,
      installFromZip,
      updateFromZip,
      deletePlugin,
      setGitRepositoryUrl,
    }),
    [state, isEnabled, setEnabled, toggle, definitions, installFromZip, updateFromZip, deletePlugin, setGitRepositoryUrl],
  );

  return <PluginsContext.Provider value={value}>{children}</PluginsContext.Provider>;
};

export const usePlugins = (): PluginsContextValue => {
  const ctx = useContext(PluginsContext);
  if (!ctx) {
    const fallback = readPluginsState();
    const definitions = Object.values(fallback.legacyInstalled);
    return {
      state: fallback.persisted,
      isEnabled: (id: string) => Boolean(fallback.persisted.enabled[id]) && Boolean(fallback.legacyInstalled[id]),
      setEnabled: () => {},
      toggle: () => {},
      definitions,
      installFromZip: async () => {
        throw new PluginZipError('PluginsProvider is not available');
      },
      updateFromZip: async () => {
        throw new PluginZipError('PluginsProvider is not available');
      },
      deletePlugin: async () => {
        throw new PluginZipError('PluginsProvider is not available');
      },
      setGitRepositoryUrl: () => {},
    };
  }
  return ctx;
};
