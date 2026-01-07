import React, { useCallback } from "react";
import type { Host, Identity, KnownHost, Snippet, SSHKey, TerminalCustomFontAsset, TerminalSettings } from "../../../domain/models";
import type { SyncPayload } from "../../../domain/sync";
import { CloudSyncSettings } from "../../CloudSyncSettings";
import { SettingsTabContent } from "../settings-ui";

export default function SettingsSyncTab(props: {
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  snippets: Snippet[];
  customGroups: string[];
  knownHosts: KnownHost[];
  importDataFromString: (data: string) => void;
  clearVaultData: () => void;

  terminalSettings: TerminalSettings;
  updateTerminalSetting: <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => void;

  terminalFontFamilyId: string;
  setTerminalFontFamilyId: (id: string) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalCustomFonts: TerminalCustomFontAsset[];
  setTerminalCustomFonts: (fonts: TerminalCustomFontAsset[]) => void;
}) {
  const { hosts, keys, identities, snippets, customGroups, knownHosts, importDataFromString, clearVaultData, terminalSettings, updateTerminalSetting, terminalFontFamilyId, setTerminalFontFamilyId, terminalFontSize, setTerminalFontSize, terminalCustomFonts, setTerminalCustomFonts } = props;

  const buildSyncPayload = useCallback((): SyncPayload => {
    // Cloud sync should only keep at most one custom font: the currently selected one.
    // This reduces payload size while keeping the active appearance consistent across devices.
    const selectedCustomFont = terminalCustomFonts.find((f) => f.id === terminalFontFamilyId);
    const terminalCustomFontsForSync = selectedCustomFont ? [selectedCustomFont] : undefined;

    return {
      hosts,
      keys,
      identities,
      snippets,
      customGroups,
      knownHosts,
      settings: {
        llmConfig: terminalSettings.llmConfig,
        terminalFontFamily: terminalFontFamilyId,
        terminalFontSize,
        terminalCustomFonts: terminalCustomFontsForSync,
      },
      syncedAt: Date.now(),
    };
  }, [hosts, keys, identities, snippets, customGroups, knownHosts, terminalSettings.llmConfig, terminalFontFamilyId, terminalFontSize, terminalCustomFonts]);

  const applySyncPayload = useCallback(
    (payload: SyncPayload) => {
      importDataFromString(
        JSON.stringify({
          hosts: payload.hosts,
          keys: payload.keys,
          identities: payload.identities,
          snippets: payload.snippets,
          customGroups: payload.customGroups,
          knownHosts: payload.knownHosts,
        }),
      );

      if (payload.settings?.llmConfig) {
        updateTerminalSetting("llmConfig", payload.settings.llmConfig);
      }

      if (Array.isArray(payload.settings?.terminalCustomFonts)) {
        const incoming = payload.settings.terminalCustomFonts;
        if (incoming.length > 0) {
          const incomingIds = new Set(incoming.map((f) => f.id));
          const merged = [
            ...(terminalCustomFonts ?? []).filter((f) => !incomingIds.has(f.id)),
            ...incoming,
          ];
          setTerminalCustomFonts(merged);
        }
      }
      if (typeof payload.settings?.terminalFontFamily === 'string') {
        setTerminalFontFamilyId(payload.settings.terminalFontFamily);
      }
      if (typeof payload.settings?.terminalFontSize === 'number') {
        setTerminalFontSize(payload.settings.terminalFontSize);
      }
    },
    [importDataFromString, updateTerminalSetting, setTerminalFontFamilyId, setTerminalFontSize, setTerminalCustomFonts, terminalCustomFonts],
  );

  return (
    <SettingsTabContent value="sync">
      <CloudSyncSettings
        onBuildPayload={buildSyncPayload}
        onApplyPayload={applySyncPayload}
        onClearLocalData={clearVaultData}
      />
    </SettingsTabContent>
  );
}
