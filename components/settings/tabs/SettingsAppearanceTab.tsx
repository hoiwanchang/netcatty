import React, { useCallback, useMemo } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { DARK_UI_THEMES, LIGHT_UI_THEMES } from "../../../infrastructure/config/uiThemes";
import { SUPPORTED_UI_LOCALES } from "../../../infrastructure/config/i18n";
import { TERMINAL_THEMES } from "../../../infrastructure/config/terminalThemes";
import { cn } from "../../../lib/utils";
import {
  DEFAULT_COMMAND_CANDIDATES_SETTINGS,
  DEFAULT_LLM_CONFIG,
  DEFAULT_SERVER_STATUS_SETTINGS,
  type LLMConfig,
  type TerminalSettings,
} from "../../../domain/models";
import { SectionHeader, SettingsTabContent, SettingRow, Toggle, Select } from "../settings-ui";
import { Button } from "../../ui/button";

export default function SettingsAppearanceTab(props: {
  theme: "dark" | "light";
  setTheme: (theme: "dark" | "light") => void;
  lightUiThemeId: string;
  setLightUiThemeId: (themeId: string) => void;
  darkUiThemeId: string;
  setDarkUiThemeId: (themeId: string) => void;
  accentMode: "theme" | "custom";
  setAccentMode: (mode: "theme" | "custom") => void;
  customAccent: string;
  setCustomAccent: (color: string) => void;
  uiLanguage: string;
  setUiLanguage: (language: string) => void;
  customCSS: string;
  setCustomCSS: (css: string) => void;

  terminalThemeId: string;
  terminalSettings: TerminalSettings;
  updateTerminalSetting: <K extends keyof TerminalSettings>(key: K, value: TerminalSettings[K]) => void;
}) {
  const { t } = useI18n();
  const {
    theme,
    setTheme,
    lightUiThemeId,
    setLightUiThemeId,
    darkUiThemeId,
    setDarkUiThemeId,
    accentMode,
    setAccentMode,
    customAccent,
    setCustomAccent,
    uiLanguage,
    setUiLanguage,
    customCSS,
    setCustomCSS,
    terminalThemeId,
    terminalSettings,
    updateTerminalSetting,
  } = props;

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

  const mixRgb = useCallback((a: { r: number; g: number; b: number }, b: { r: number; g: number; b: number }, t: number) => {
    const tt = Math.max(0, Math.min(1, t));
    return {
      r: a.r + (b.r - a.r) * tt,
      g: a.g + (b.g - a.g) * tt,
      b: a.b + (b.b - a.b) * tt,
    };
  }, []);

  const computeDefaultZebraColor = useCallback(
    (index: number): string => {
      const theme =
        TERMINAL_THEMES.find((t) => t.id === terminalThemeId) ?? TERMINAL_THEMES[0];
      const fallbackTheme = TERMINAL_THEMES[0];
      const bg =
        hexToRgb(theme?.colors.background ?? "") ??
        hexToRgb(fallbackTheme?.colors.background ?? "")!;
      const fg =
        hexToRgb(theme?.colors.foreground ?? "") ??
        hexToRgb(fallbackTheme?.colors.foreground ?? "")!;
      // Similar contrast to Terminal.tsx defaults, but extendable.
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

  const updateZebraEnabled = useCallback(
    (enabled: boolean) => {
      const cfg = ensureLlmConfig();
      updateTerminalSetting("llmConfig", {
        ...cfg,
        zebraStripingEnabled: enabled,
        zebraStripeColors: zebraColors,
      });
    },
    [ensureLlmConfig, updateTerminalSetting, zebraColors],
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

  const getHslStyle = useCallback((hsl: string) => ({ backgroundColor: `hsl(${hsl})` }), []);

  const hexToHsl = useCallback((hex: string) => {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r:
          h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
          break;
        case g:
          h = ((b - r) / d + 2) / 6;
          break;
        case b:
          h = ((r - g) / d + 4) / 6;
          break;
      }
    }
    return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
  }, []);

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

  const serverStatusCfg = useMemo(() => ensureServerStatusSettings(), [ensureServerStatusSettings]);

  const commandCandidatesCfg = useMemo(
    () => ensureCommandCandidatesSettings(),
    [ensureCommandCandidatesSettings],
  );

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

  const renderThemeSwatches = (
    options: { id: string; name: string; tokens: { background: string } }[],
    value: string,
    onChange: (next: string) => void,
  ) => (
    <div className="flex flex-wrap gap-2 justify-end">
      {options.map((preset) => (
        <button
          key={preset.id}
          onClick={() => onChange(preset.id)}
          className={cn(
            "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
            value === preset.id
              ? "ring-2 ring-offset-2 ring-foreground scale-110"
              : "hover:scale-105",
          )}
          style={getHslStyle(preset.tokens.background)}
          title={preset.name}
        >
          {value === preset.id && <Check className="text-white drop-shadow-md" size={10} />}
        </button>
      ))}
    </div>
  );

  return (
    <SettingsTabContent value="appearance">
      <SectionHeader title={t("settings.appearance.language")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.language")}
          description={t("settings.appearance.language.desc")}
        >
          <Select
            value={uiLanguage}
            options={SUPPORTED_UI_LOCALES.map((l) => ({ value: l.id, label: l.label }))}
            onChange={(v) => setUiLanguage(v)}
            className="w-40"
          />
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.uiTheme")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.darkMode")}
          description={t("settings.appearance.darkMode.desc")}
        >
          <div className="flex items-center gap-2">
            <Sun size={14} className="text-muted-foreground" />
            <Toggle checked={theme === "dark"} onChange={(v) => setTheme(v ? "dark" : "light")} />
            <Moon size={14} className="text-muted-foreground" />
          </div>
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.accentColor")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.accentColor.mode")}
          description={t("settings.appearance.accentColor.mode.desc")}
        >
          <div className="flex items-center gap-2">
            <Toggle
              checked={accentMode === "custom"}
              onChange={(checked) => setAccentMode(checked ? "custom" : "theme")}
            />
          </div>
        </SettingRow>
        {accentMode === "custom" && (
          <div className="py-3 space-y-2">
            <div className="text-sm font-medium">{t("settings.appearance.accentColor.custom")}</div>
            <div className="flex flex-wrap gap-2">
              {ACCENT_COLORS.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCustomAccent(c.value)}
                  className={cn(
                    "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm",
                    customAccent === c.value
                      ? "ring-2 ring-offset-2 ring-foreground scale-110"
                      : "hover:scale-105",
                  )}
                  style={getHslStyle(c.value)}
                  title={c.name}
                >
                  {customAccent === c.value && <Check className="text-white drop-shadow-md" size={10} />}
                </button>
              ))}
              <label
                className={cn(
                  "relative w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm cursor-pointer",
                  "bg-gradient-to-br from-pink-500 via-purple-500 to-blue-500",
                  !ACCENT_COLORS.some((c) => c.value === customAccent)
                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                    : "hover:scale-105",
                )}
                title={t("settings.appearance.customColor")}
              >
                <input
                  type="color"
                  className="absolute inset-0 h-full w-full opacity-0 cursor-pointer app-no-drag"
                  onChange={(e) => setCustomAccent(hexToHsl(e.target.value))}
                />
                {!ACCENT_COLORS.some((c) => c.value === customAccent) ? (
                  <Check className="text-white drop-shadow-md" size={10} />
                ) : (
                  <Palette size={12} className="text-white drop-shadow-md" />
                )}
              </label>
            </div>
          </div>
        )}
      </div>

      <SectionHeader title={t("settings.appearance.themeColor")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.themeColor.light")}
          description={t("settings.appearance.themeColor.desc")}
        >
          {renderThemeSwatches(LIGHT_UI_THEMES, lightUiThemeId, setLightUiThemeId)}
        </SettingRow>
        <SettingRow label={t("settings.appearance.themeColor.dark")}>
          {renderThemeSwatches(DARK_UI_THEMES, darkUiThemeId, setDarkUiThemeId)}
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.zebraBlocks")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.zebraBlocks.enable")}
          description={t("settings.appearance.zebraBlocks.enable.desc")}
        >
          <Toggle
            checked={terminalSettings.llmConfig?.zebraStripingEnabled ?? false}
            onChange={updateZebraEnabled}
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
                (terminalSettings.llmConfig?.zebraStripingEnabled ?? false)
                  ? "cursor-pointer"
                  : "opacity-50 cursor-not-allowed",
              )}
            >
              <input
                type="color"
                value={color}
                disabled={!(terminalSettings.llmConfig?.zebraStripingEnabled ?? false)}
                onChange={(e) => updateZebraColorAt(idx, e.target.value)}
                className={cn(
                  "absolute inset-0 h-full w-full opacity-0 app-no-drag",
                  (terminalSettings.llmConfig?.zebraStripingEnabled ?? false)
                    ? "cursor-pointer"
                    : "cursor-not-allowed",
                )}
              />
              <span
                className={cn(
                  "block w-10 h-6 rounded-md border border-border/50 transition-colors",
                  (terminalSettings.llmConfig?.zebraStripingEnabled ?? false)
                    ? "hover:border-border"
                    : "",
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
          >
            {t("settings.appearance.zebraBlocks.add")}
          </Button>
        </div>
      </div>

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
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                  serverStatusCfg.cpuColor === c.value
                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                    : "hover:scale-105",
                )}
                style={getHslStyle(c.value)}
                title={c.name}
              >
                {serverStatusCfg.cpuColor === c.value && <Check className="text-white drop-shadow-md" size={10} />}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label={t("settings.appearance.serverStatus.memColor")}>
          <div className="flex flex-wrap gap-2 justify-end">
            {ACCENT_COLORS.map((c) => (
              <button
                key={`mem-${c.name}`}
                onClick={() => updateServerStatus({ memColor: c.value })}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                  serverStatusCfg.memColor === c.value
                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                    : "hover:scale-105",
                )}
                style={getHslStyle(c.value)}
                title={c.name}
              >
                {serverStatusCfg.memColor === c.value && <Check className="text-white drop-shadow-md" size={10} />}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow label={t("settings.appearance.serverStatus.diskColor")}>
          <div className="flex flex-wrap gap-2 justify-end">
            {ACCENT_COLORS.map((c) => (
              <button
                key={`disk-${c.name}`}
                onClick={() => updateServerStatus({ diskColor: c.value })}
                className={cn(
                  "w-6 h-6 rounded-full flex items-center justify-center transition-all shadow-sm border border-border/70",
                  serverStatusCfg.diskColor === c.value
                    ? "ring-2 ring-offset-2 ring-foreground scale-110"
                    : "hover:scale-105",
                )}
                style={getHslStyle(c.value)}
                title={c.name}
              >
                {serverStatusCfg.diskColor === c.value && <Check className="text-white drop-shadow-md" size={10} />}
              </button>
            ))}
          </div>
        </SettingRow>
      </div>

      <SectionHeader title={t("settings.appearance.commandCandidates")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.commandCandidates.enable")}
          description={t("settings.appearance.commandCandidates.enable.desc")}
        >
          <Toggle
            checked={commandCandidatesCfg.enabled}
            onChange={(checked) => updateCommandCandidates({ enabled: checked })}
          />
        </SettingRow>

        <SettingRow
          label={t("settings.appearance.commandCandidates.ttl")}
          description={t("settings.appearance.commandCandidates.ttl.desc")}
        >
          <input
            type="number"
            min={1}
            max={168}
            value={Math.round(commandCandidatesCfg.cacheTtlMs / 1000 / 60 / 60)}
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

      <SectionHeader title={t("settings.appearance.customCss")} />
      <div className="space-y-2">
        <p className="text-xs text-muted-foreground">
          {t("settings.appearance.customCss.desc")}
        </p>
        <textarea
          value={customCSS}
          onChange={(e) => setCustomCSS(e.target.value)}
          placeholder={t("settings.appearance.customCss.placeholder")}
          className="w-full h-32 px-3 py-2 text-xs font-mono bg-muted/50 border border-border rounded-lg resize-y focus:outline-none focus:ring-2 focus:ring-primary/50"
          spellCheck={false}
        />
      </div>
    </SettingsTabContent>
  );
}
