import React, { useCallback } from "react";
import type { Host, Identity, Snippet, SSHKey, TerminalSettings } from "../../../domain/models";
import type { SyncPayload } from "../../../domain/sync";
import { CloudSyncSettings } from "../../CloudSyncSettings";
import { SettingsTabContent } from "../settings-ui";

export default function SettingsSyncTab(props: {
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  snippets: Snippet[];
  importDataFromString: (data: string) => void;
  clearVaultData: () => void;

  terminalSettings: TerminalSettings;
  updateTerminalSetting: <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => void;
}) {
  const { hosts, keys, identities, snippets, importDataFromString, clearVaultData, terminalSettings, updateTerminalSetting } = props;

  const buildSyncPayload = useCallback((): SyncPayload => {
    return {
      hosts,
      keys,
      identities,
      snippets,
      customGroups: [],
      settings: {
        llmConfig: terminalSettings.llmConfig,
      },
      syncedAt: Date.now(),
    };
  }, [hosts, keys, identities, snippets, terminalSettings.llmConfig]);

  const applySyncPayload = useCallback(
    (payload: SyncPayload) => {
      importDataFromString(
        JSON.stringify({
          hosts: payload.hosts,
          keys: payload.keys,
          identities: payload.identities,
          snippets: payload.snippets,
          customGroups: payload.customGroups,
        }),
      );

      if (payload.settings?.llmConfig) {
        updateTerminalSetting("llmConfig", payload.settings.llmConfig);
      }
    },
    [importDataFromString, updateTerminalSetting],
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
