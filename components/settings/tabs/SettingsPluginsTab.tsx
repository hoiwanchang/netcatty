import React, { useCallback, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, Download, Pencil, Trash2, Upload } from "lucide-react";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { usePlugins } from "../../../application/plugins/PluginsProvider";
import {
  DEFAULT_COMMAND_CANDIDATES_SETTINGS,
  DEFAULT_LLM_CONFIG,
  DEFAULT_SERVER_STATUS_SETTINGS,
  type LLMConfig,
  type TerminalSettings,
} from "../../../domain/models";
import { TERMINAL_THEMES } from "../../../infrastructure/config/terminalThemes";
import { cn } from "../../../lib/utils";
import { Button } from "../../ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "../../ui/collapsible";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { toast } from "../../ui/toast";
import { SectionHeader, SettingRow, SettingsTabContent, Toggle } from "../settings-ui";
import {
  normalizePortKnockingSettings,
} from "../../../domain/portKnocking";

const ACCENT_COLORS = [
  { name: "Sky", value: "199 89% 48%" },
  { name: "Blue", value: "221.2 83.2% 53.3%" },
  { name: "Indigo", value: "234 89% 62%" },
  { name: "Violet", value: "262.1 83.3% 57.8%" },
  { name: "Purple", value: "271 81% 56%" },
  { name: "Fuchsia", value: "292 84% 61%" },
  { name: "Pink", value: "330 81% 60%" },
  { name: "Rose", value: "346.8 77.2% 49.8%" },
  { name: "Red", value: "0 84.2% 60.2%" },
  { name: "Orange", value: "24.6 95% 53.1%" },
  { name: "Amber", value: "38 92% 50%" },
  { name: "Yellow", value: "48 96% 53%" },
  { name: "Lime", value: "84 81% 44%" },
  { name: "Green", value: "142.1 76.2% 36.3%" },
  { name: "Emerald", value: "160 84% 39%" },
  { name: "Teal", value: "173 80% 40%" },
  { name: "Cyan", value: "189 94% 43%" },
  { name: "Slate", value: "215 16% 47%" },
];

const getHslStyle = (hsl: string) => ({ backgroundColor: `hsl(${hsl})` });

function isBuiltinPluginId(id: string) {
  return (
    id === "ai" ||
    id === "zebra" ||
    id === "commandCandidates" ||
    id === "serverStatus" ||
    id === "portKnocking"
  );
}

function getPluginDisplay(t: (k: string) => string, p: { id: string; name: string; description?: string }) {
  if (p.id === "ai") return { title: t("settings.plugins.ai.name"), desc: t("settings.plugins.ai.desc") };
  if (p.id === "zebra") return { title: t("settings.plugins.zebra.name"), desc: t("settings.plugins.zebra.desc") };
  if (p.id === "commandCandidates") {
    return { title: t("settings.plugins.commandCandidates.name"), desc: t("settings.plugins.commandCandidates.desc") };
  }
  if (p.id === "serverStatus") {
    return { title: t("settings.plugins.serverStatus.name"), desc: t("settings.plugins.serverStatus.desc") };
  }
  if (p.id === "portKnocking") {
    return { title: t("settings.plugins.portKnocking.name"), desc: t("settings.plugins.portKnocking.desc") };
  }
  return { title: p.name, desc: p.description ?? "" };
}

export default function SettingsPluginsTab(props: {
  terminalThemeId: string;
  terminalSettings: TerminalSettings;
  updateTerminalSetting: <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => void;
}) {
  const { terminalThemeId, terminalSettings, updateTerminalSetting } = props;
  const { t } = useI18n();
  const plugins = usePlugins();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [fileAction, setFileAction] = useState<{ mode: "install" } | { mode: "update"; id: string } | null>(
    null,
  );
  const [openIds, setOpenIds] = useState<Record<string, boolean>>({});

  const ensureServerStatusSettings = useCallback(() => {
    const existing = terminalSettings.serverStatus;
    return {
      ...DEFAULT_SERVER_STATUS_SETTINGS,
      ...(existing ?? {}),
    };
  }, [terminalSettings.serverStatus]);

  const ensureCommandCandidatesSettings = useCallback(() => {
    const existing = terminalSettings.commandCandidates;
    return {
      ...DEFAULT_COMMAND_CANDIDATES_SETTINGS,
      ...(existing ?? {}),
    };
  }, [terminalSettings.commandCandidates]);

  const ensureLlmConfig = useCallback((): LLMConfig => {
    const existing = terminalSettings.llmConfig;
    return {
      ...DEFAULT_LLM_CONFIG,
      ...existing,
      enabled: existing?.enabled ?? DEFAULT_LLM_CONFIG.enabled,
      provider: existing?.provider ?? DEFAULT_LLM_CONFIG.provider,
      apiKey: existing?.apiKey ?? DEFAULT_LLM_CONFIG.apiKey,
      model: existing?.model ?? DEFAULT_LLM_CONFIG.model,
      endpoint: existing?.endpoint,
      autoSuggestOnError: existing?.autoSuggestOnError ?? DEFAULT_LLM_CONFIG.autoSuggestOnError,
      zebraStripingEnabled: existing?.zebraStripingEnabled ?? DEFAULT_LLM_CONFIG.zebraStripingEnabled,
      zebraFrameEnabled: existing?.zebraFrameEnabled ?? DEFAULT_LLM_CONFIG.zebraFrameEnabled,
      zebraStripeColors: existing?.zebraStripeColors,
    };
  }, [terminalSettings.llmConfig]);

  const hexToRgb = useCallback((hex: string) => {
    const h = hex.trim();
    const m = /^#?([0-9a-fA-F]{6})$/.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
  }, []);

  const rgbToHex = useCallback((rgb: { r: number; g: number; b: number }) => {
    const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    const to2 = (v: number) => clamp(v).toString(16).padStart(2, "0");
    return `#${to2(rgb.r)}${to2(rgb.g)}${to2(rgb.b)}`;
  }, []);

  const mixRgb = useCallback(
    (a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, tRatio: number) => {
      const tt = Math.max(0, Math.min(1, tRatio));
      return {
        r: a.r + (b.r - a.r) * tt,
        g: a.g + (b.g - a.g) * tt,
        b: a.b + (b.b - a.b) * tt,
      };
    },
    [],
  );

  const computeDefaultZebraColor = useCallback(
    (index: number): string => {
      const theme = TERMINAL_THEMES.find((th) => th.id === terminalThemeId) ?? TERMINAL_THEMES[0];
      const fallbackTheme = TERMINAL_THEMES[0];
      const bg = hexToRgb(theme?.colors.background ?? "") ?? hexToRgb(fallbackTheme?.colors.background ?? "")!;
      const fg = hexToRgb(theme?.colors.foreground ?? "") ?? hexToRgb(fallbackTheme?.colors.foreground ?? "")!;
      const ratio = Math.min(0.42, 0.16 + (index % 6) * 0.06);
      return rgbToHex(mixRgb(bg, fg, ratio));
    },
    [hexToRgb, mixRgb, rgbToHex, terminalThemeId],
  );

  const zebraColors = useMemo(() => {
    const cfg = ensureLlmConfig();
    const list = (cfg.zebraStripeColors ?? []).filter((c) => /^#?[0-9a-fA-F]{6}$/.test(c));
    if (list.length >= 2) return list.map((c) => (c.startsWith("#") ? c : `#${c}`));
    return [computeDefaultZebraColor(0), computeDefaultZebraColor(1)];
  }, [computeDefaultZebraColor, ensureLlmConfig]);

  const portKnockingCfg = useMemo(
    () => normalizePortKnockingSettings(plugins.getPluginSettings("portKnocking")),
    [plugins],
  );

  const updatePortKnocking = useCallback(
    (next: Partial<typeof portKnockingCfg>) => {
      plugins.setPluginSettings("portKnocking", { ...portKnockingCfg, ...next });
    },
    [plugins, portKnockingCfg],
  );

  const llmCfg = useMemo(() => ensureLlmConfig(), [ensureLlmConfig]);

  const serverStatusCfg = useMemo(() => ensureServerStatusSettings(), [ensureServerStatusSettings]);
  const commandCandidatesCfg = useMemo(() => ensureCommandCandidatesSettings(), [ensureCommandCandidatesSettings]);

  const updateCommandCandidates = useCallback(
    (next: Partial<typeof commandCandidatesCfg>) => {
      updateTerminalSetting("commandCandidates", { ...commandCandidatesCfg, ...next });
    },
    [commandCandidatesCfg, updateTerminalSetting],
  );

  const updateServerStatus = useCallback(
    (next: Partial<typeof serverStatusCfg>) => {
      updateTerminalSetting("serverStatus", { ...serverStatusCfg, ...next });
    },
    [serverStatusCfg, updateTerminalSetting],
  );

  const updateZebraColorAt = useCallback(
    (index: number, nextHex: string) => {
      const cfg = ensureLlmConfig();
      const normalized = nextHex.startsWith("#") ? nextHex : `#${nextHex}`;
      const next = zebraColors.map((c, i) => (i === index ? normalized : c));
      updateTerminalSetting("llmConfig", {
        ...cfg,
        zebraStripeColors: next,
      });
    },
    [ensureLlmConfig, updateTerminalSetting, zebraColors],
  );

  const addZebraColor = useCallback(() => {
    const cfg = ensureLlmConfig();
    const next = [...zebraColors, computeDefaultZebraColor(zebraColors.length)];
    updateTerminalSetting("llmConfig", {
      ...cfg,
      zebraStripeColors: next,
    });
  }, [computeDefaultZebraColor, ensureLlmConfig, updateTerminalSetting, zebraColors]);

  const openFilePicker = useCallback((action: { mode: "install" } | { mode: "update"; id: string }) => {
    setFileAction(action);
    fileInputRef.current?.click();
  }, []);

  const onFileSelected = useCallback(
    async (file: File | null) => {
      if (!file || !fileAction) return;

      try {
        if (fileAction.mode === "install") {
          await plugins.installFromZip(file);
          toast.success(t("settings.plugins.toast.installed"));
        } else {
          await plugins.updateFromZip(fileAction.id, file);
          toast.success(t("settings.plugins.toast.updated"));
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : t("common.unknownError");
        toast.error(message, t("common.error"));
      } finally {
        setFileAction(null);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [fileAction, plugins, t],
  );

  return (
    <SettingsTabContent value="plugins">
      <SectionHeader title={t("settings.plugins.title")} />

      <div className="flex items-center justify-between">
        <div className="text-xs text-muted-foreground">{t("settings.plugins.subtitle")}</div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".zip"
            className="hidden"
            onChange={(e) => void onFileSelected(e.target.files?.[0] ?? null)}
          />
          <Button variant="secondary" className="gap-2" onClick={() => openFilePicker({ mode: "install" })}>
            <Upload size={14} />
            {t("settings.plugins.install")}
          </Button>
        </div>
      </div>

      <div className="space-y-2">
        {plugins.definitions.map((p) => {
          const enabled = plugins.isEnabled(p.id);
          const open = openIds[p.id] ?? false;

          const { title, desc } = getPluginDisplay(t, p);
          const version = p.version;

          return (
            <Collapsible
              key={p.id}
              open={open}
              onOpenChange={(next) => setOpenIds((prev) => ({ ...prev, [p.id]: next }))}
              className="rounded-lg border bg-card"
            >
              <div className="flex items-center gap-3 px-4 py-3">
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      "flex-1 min-w-0 text-left app-no-drag",
                      "hover:opacity-90 transition-opacity",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronDown
                        size={14}
                        className={cn("text-muted-foreground transition-transform", open && "rotate-180")}
                      />
                      <div className="text-sm font-medium truncate">{title}</div>
                      {version && (
                        <div className="text-[10px] px-2 py-0.5 rounded-full border text-muted-foreground">
                          v{version}
                        </div>
                      )}
                      {enabled && <Check size={12} className="text-muted-foreground" />}
                    </div>
                    {desc && <div className="text-xs text-muted-foreground mt-0.5 truncate">{desc}</div>}
                    {!isBuiltinPluginId(p.id) && (
                      <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{p.id}</div>
                    )}
                  </button>
                </CollapsibleTrigger>

                <div className="shrink-0 flex items-center gap-2">
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("settings.plugins.update")}
                      onClick={() => openFilePicker({ mode: "update", id: p.id })}
                    >
                      <Download size={14} />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title={t("settings.plugins.delete")}
                      onClick={async () => {
                        try {
                          await plugins.deletePlugin(p.id);
                          toast.success(t("settings.plugins.toast.deleted"));
                        } catch (err) {
                          const message = err instanceof Error ? err.message : t("common.unknownError");
                          toast.error(message, t("common.error"));
                        }
                      }}
                    >
                      <Trash2 size={14} />
                    </Button>
                  </>

                  <Toggle checked={enabled} onChange={(checked) => plugins.setEnabled(p.id, checked)} />
                </div>
              </div>

              <CollapsibleContent className="border-t bg-muted/10">
                <div className="p-4 space-y-4">
                  {p.id === "ai" && (
                    <div className={cn(!enabled && "opacity-60")}> 
                      <div className="rounded-lg border bg-card p-4 space-y-4">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium">{t("settings.terminal.llm.title")}</span>
                        </div>

                        <div className="space-y-3 pt-2">
                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("settings.terminal.llm.provider")}</Label>
                            <select
                              value={llmCfg.provider}
                              disabled={!enabled}
                              onChange={(e) =>
                                updateTerminalSetting("llmConfig", {
                                  ...llmCfg,
                                  provider: e.target.value as "gemini" | "openai" | "custom" | "claude",
                                })
                              }
                              className="w-full px-3 py-2 text-sm rounded-md border bg-background"
                            >
                              <option value="gemini">Google Gemini</option>
                              <option value="claude">Anthropic Claude</option>
                              <option value="custom">Custom API</option>
                              <option value="openai" disabled>
                                OpenAI (Coming Soon)
                              </option>
                            </select>
                          </div>

                          {(llmCfg.provider === "custom" || llmCfg.provider === "claude") && (
                            <div className="space-y-1.5">
                              <Label className="text-xs">Endpoint</Label>
                              <Input
                                value={llmCfg.endpoint ?? ""}
                                disabled={!enabled}
                                onChange={(e) =>
                                  updateTerminalSetting("llmConfig", {
                                    ...llmCfg,
                                    endpoint: e.target.value,
                                  })
                                }
                                placeholder={
                                  llmCfg.provider === "claude"
                                    ? "https://api.anthropic.com/v1/messages"
                                    : "https://example.com/v1/chat/completions"
                                }
                                className="w-full text-sm"
                              />
                            </div>
                          )}

                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("settings.terminal.llm.model")}</Label>
                            <Input
                              value={llmCfg.model}
                              disabled={!enabled}
                              onChange={(e) =>
                                updateTerminalSetting("llmConfig", {
                                  ...llmCfg,
                                  model: e.target.value,
                                })
                              }
                              placeholder="gemini-2.5-flash"
                              className="w-full text-sm"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <Label className="text-xs">{t("settings.terminal.llm.apiKey")}</Label>
                            <Input
                              type="password"
                              value={llmCfg.apiKey}
                              disabled={!enabled}
                              onChange={(e) =>
                                updateTerminalSetting("llmConfig", {
                                  ...llmCfg,
                                  apiKey: e.target.value,
                                })
                              }
                              placeholder="AIza..."
                              className="w-full font-mono text-xs"
                            />
                          </div>

                          <div className="space-y-3 pt-2 border-t">
                            <div className="flex items-center justify-between">
                              <Label className="text-xs">{t("settings.terminal.llm.autoSuggestOnError")}</Label>
                              <Toggle
                                checked={llmCfg.autoSuggestOnError}
                                disabled={!enabled}
                                onChange={(autoSuggestOnError) =>
                                  updateTerminalSetting("llmConfig", {
                                    ...llmCfg,
                                    autoSuggestOnError,
                                  })
                                }
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {p.id === "zebra" && (
                    <>
                      <SectionHeader title={t("settings.appearance.zebraBlocks")} />
                      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                        <SettingRow
                          label={t("settings.appearance.zebraBlocks.showBackground")}
                          description={t("settings.appearance.zebraBlocks.showBackground.desc")}
                        >
                          <Toggle
                            checked={llmCfg.zebraStripingEnabled}
                            disabled={!enabled}
                            onChange={(zebraStripingEnabled) =>
                              updateTerminalSetting("llmConfig", {
                                ...llmCfg,
                                zebraStripingEnabled,
                              })
                            }
                          />
                        </SettingRow>

                        <SettingRow
                          label={t("settings.appearance.zebraBlocks.showFrame")}
                          description={t("settings.appearance.zebraBlocks.showFrame.desc")}
                        >
                          <Toggle
                            checked={llmCfg.zebraFrameEnabled}
                            disabled={!enabled}
                            onChange={(zebraFrameEnabled) =>
                              updateTerminalSetting("llmConfig", {
                                ...llmCfg,
                                zebraFrameEnabled,
                              })
                            }
                          />
                        </SettingRow>

                        {zebraColors.map((color, idx) => (
                          <SettingRow
                            key={`${idx}-${color}`}
                            label={`${t("settings.appearance.zebraBlocks.background")} ${idx + 1}`}
                          >
                            <label
                              className={cn(
                                "relative block w-10 h-6 rounded-md",
                                enabled ? "cursor-pointer" : "opacity-50 cursor-not-allowed",
                              )}
                            >
                              <input
                                type="color"
                                value={color}
                                disabled={!enabled}
                                onChange={(e) => updateZebraColorAt(idx, e.target.value)}
                                className={cn("absolute inset-0 h-full w-full opacity-0 app-no-drag")}
                              />
                              <span
                                className={cn(
                                  "block w-10 h-6 rounded-md border border-border/50 transition-colors",
                                  enabled ? "hover:border-border" : "",
                                )}
                                style={{ backgroundColor: color }}
                              />
                            </label>
                          </SettingRow>
                        ))}

                        <div className="py-3">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-full text-muted-foreground hover:text-foreground"
                            onClick={addZebraColor}
                            disabled={!enabled}
                          >
                            <Pencil size={14} className="mr-2" />
                            {t("settings.appearance.zebraBlocks.add")}
                          </Button>
                        </div>
                      </div>
                    </>
                  )}

                  {p.id === "serverStatus" && (
                    <>
                      <SectionHeader title={t("settings.appearance.serverStatus")} />
                      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                        <SettingRow
                          label={t("settings.appearance.serverStatus.fontSize")}
                          description={t("settings.appearance.serverStatus.fontSize.desc")}
                        >
                          <input
                            type="number"
                            min={8}
                            max={16}
                            value={serverStatusCfg.fontSize}
                            disabled={!enabled}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              updateServerStatus({ fontSize: Math.max(8, Math.min(16, Math.round(n))) });
                            }}
                            className="h-9 w-20 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>

                        <SettingRow
                          label={t("settings.appearance.serverStatus.refresh")}
                          description={t("settings.appearance.serverStatus.refresh.desc")}
                        >
                          <input
                            type="number"
                            min={5}
                            max={600}
                            value={Math.round(serverStatusCfg.refreshIntervalMs / 1000)}
                            disabled={!enabled}
                            onChange={(e) => {
                              const sec = Number(e.target.value);
                              if (!Number.isFinite(sec)) return;
                              const clamped = Math.max(5, Math.min(600, Math.round(sec)));
                              updateServerStatus({ refreshIntervalMs: clamped * 1000 });
                            }}
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>

                        <SettingRow
                          label={t("settings.appearance.serverStatus.cpuColor")}
                          description={t("settings.appearance.serverStatus.colors.desc")}
                        >
                          <div className="flex flex-wrap gap-2 justify-end">
                            {ACCENT_COLORS.map((c) => (
                              <button
                                key={`cpu-${c.name}`}
                                onClick={() => updateServerStatus({ cpuColor: c.value })}
                                disabled={!enabled}
                                className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                                  serverStatusCfg.cpuColor === c.value
                                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                                    : "hover:scale-105",
                                  !enabled && "opacity-60 cursor-not-allowed",
                                )}
                                style={getHslStyle(c.value)}
                                title={c.name}
                              />
                            ))}
                          </div>
                        </SettingRow>

                        <SettingRow label={t("settings.appearance.serverStatus.memColor")}>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {ACCENT_COLORS.map((c) => (
                              <button
                                key={`mem-${c.name}`}
                                onClick={() => updateServerStatus({ memColor: c.value })}
                                disabled={!enabled}
                                className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                                  serverStatusCfg.memColor === c.value
                                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                                    : "hover:scale-105",
                                  !enabled && "opacity-60 cursor-not-allowed",
                                )}
                                style={getHslStyle(c.value)}
                                title={c.name}
                              />
                            ))}
                          </div>
                        </SettingRow>

                        <SettingRow label={t("settings.appearance.serverStatus.diskColor")}>
                          <div className="flex flex-wrap gap-2 justify-end">
                            {ACCENT_COLORS.map((c) => (
                              <button
                                key={`disk-${c.name}`}
                                onClick={() => updateServerStatus({ diskColor: c.value })}
                                disabled={!enabled}
                                className={cn(
                                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                                  serverStatusCfg.diskColor === c.value
                                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                                    : "hover:scale-105",
                                  !enabled && "opacity-60 cursor-not-allowed",
                                )}
                                style={getHslStyle(c.value)}
                                title={c.name}
                              />
                            ))}
                          </div>
                        </SettingRow>
                      </div>
                    </>
                  )}

                  {p.id === "commandCandidates" && (
                    <>
                      <SectionHeader title={t("settings.appearance.commandCandidates")} />
                      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                        <SettingRow
                          label={t("settings.appearance.commandCandidates.ttl")}
                          description={t("settings.appearance.commandCandidates.ttl.desc")}
                        >
                          <input
                            type="number"
                            min={1}
                            max={168}
                            value={Math.round(commandCandidatesCfg.cacheTtlMs / 1000 / 60 / 60)}
                            disabled={!enabled}
                            onChange={(e) => {
                              const hours = Number(e.target.value);
                              if (!Number.isFinite(hours)) return;
                              const clamped = Math.max(1, Math.min(168, Math.round(hours)));
                              updateCommandCandidates({ cacheTtlMs: clamped * 60 * 60 * 1000 });
                            }}
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>
                      </div>
                    </>
                  )}

                  {p.id === "portKnocking" && (
                    <>
                      <SectionHeader title={t("settings.plugins.portKnocking.section")} />
                      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
                        <SettingRow
                          label={t("settings.plugins.portKnocking.timeoutMs")}
                          description={t("settings.plugins.portKnocking.timeoutMs.desc")}
                        >
                          <input
                            type="number"
                            min={100}
                            max={10000}
                            value={portKnockingCfg.timeoutMs}
                            disabled={!enabled}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              updatePortKnocking({ timeoutMs: Math.max(100, Math.min(10000, Math.round(n))) });
                            }}
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>

                        <SettingRow
                          label={t("settings.plugins.portKnocking.delayMs")}
                          description={t("settings.plugins.portKnocking.delayMs.desc")}
                        >
                          <input
                            type="number"
                            min={0}
                            max={10000}
                            value={portKnockingCfg.delayMs}
                            disabled={!enabled}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              updatePortKnocking({ delayMs: Math.max(0, Math.min(10000, Math.round(n))) });
                            }}
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>

                        <SettingRow
                          label={t("settings.plugins.portKnocking.waitAfterMs")}
                          description={t("settings.plugins.portKnocking.waitAfterMs.desc")}
                        >
                          <input
                            type="number"
                            min={0}
                            max={30000}
                            value={portKnockingCfg.waitAfterMs}
                            disabled={!enabled}
                            onChange={(e) => {
                              const n = Number(e.target.value);
                              if (!Number.isFinite(n)) return;
                              updatePortKnocking({ waitAfterMs: Math.max(0, Math.min(30000, Math.round(n))) });
                            }}
                            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                          />
                        </SettingRow>
                      </div>
                    </>
                  )}

                  {!isBuiltinPluginId(p.id) && (
                    <div className="text-xs text-muted-foreground">{t("settings.plugins.thirdParty.note")}</div>
                  )}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>

      <div className="text-xs text-muted-foreground pt-2">
        <span className="mr-2 inline-flex items-center gap-1">
          <Upload size={12} /> {t("settings.plugins.installHint")}
        </span>
        <span className="inline-flex items-center gap-1">
          <Download size={12} /> {t("settings.plugins.updateHint")}
        </span>
      </div>

      {/* keep types referenced to prevent accidental dead code elimination warnings */}
      {isBuiltinPluginId("ai") ? null : null}
    </SettingsTabContent>
  );
}
