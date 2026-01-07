import React, { useCallback, useMemo, useRef } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useI18n } from "../../../application/i18n/I18nProvider";
import { DARK_UI_THEMES, LIGHT_UI_THEMES } from "../../../infrastructure/config/uiThemes";
import { SUPPORTED_UI_LOCALES } from "../../../infrastructure/config/i18n";
import { TERMINAL_FONTS } from "../../../infrastructure/config/fonts";
import { cn } from "../../../lib/utils";
import type { TerminalCustomFontAsset, TerminalSettings } from "../../../domain/models";
import { arrayBufferToBase64 } from "../../../infrastructure/services/EncryptionService";
import { Button } from "../../ui/button";
import { SectionHeader, SettingsTabContent, SettingRow, Toggle, Select } from "../settings-ui";

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

  terminalFontFamilyId: string;
  setTerminalFontFamilyId: (fontId: string) => void;
  terminalFontSize: number;
  setTerminalFontSize: (size: number) => void;
  terminalCustomFonts: TerminalCustomFontAsset[];
  addTerminalCustomFont: (font: Omit<TerminalCustomFontAsset, 'createdAt'> & { createdAt?: number }) => void;
  removeTerminalCustomFont: (id: string) => void;
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
    terminalFontFamilyId,
    setTerminalFontFamilyId,
    terminalFontSize,
    setTerminalFontSize,
    terminalCustomFonts,
    addTerminalCustomFont,
    removeTerminalCustomFont,
  } = props;

  const fontFileInputRef = useRef<HTMLInputElement | null>(null);

  const terminalFontOptions = useMemo(() => {
    const builtIn = TERMINAL_FONTS.map((f) => ({ value: f.id, label: f.name }));
    const custom = (terminalCustomFonts ?? []).map((f) => ({ value: f.id, label: `${f.name} (${t("settings.appearance.terminalFont.custom")})` }));
    return [...builtIn, ...custom];
  }, [terminalCustomFonts, t]);

  const handleImportFontFile = useCallback(async (file: File | null) => {
    if (!file) return;
    const buffer = await file.arrayBuffer();
    const base64 = arrayBufferToBase64(buffer);
    const id = `custom-${crypto.randomUUID()}`;
    addTerminalCustomFont({
      id,
      name: file.name,
      mime: file.type || "font/ttf",
      dataBase64: base64,
    });
    setTerminalFontFamilyId(id);
  }, [addTerminalCustomFont, setTerminalFontFamilyId]);

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

      <SectionHeader title={t("settings.appearance.terminalFont")} />
      <div className="space-y-0 divide-y divide-border rounded-lg border bg-card px-4">
        <SettingRow
          label={t("settings.appearance.terminalFont.family")}
          description={t("settings.appearance.terminalFont.family.desc")}
        >
          <Select
            value={terminalFontFamilyId}
            options={terminalFontOptions}
            onChange={(v) => setTerminalFontFamilyId(v)}
            className="w-48"
          />
        </SettingRow>
        <SettingRow
          label={t("settings.appearance.terminalFont.size")}
          description={t("settings.appearance.terminalFont.size.desc")}
        >
          <input
            type="number"
            min={6}
            max={48}
            value={terminalFontSize}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (!Number.isFinite(n)) return;
              setTerminalFontSize(Math.max(6, Math.min(48, n)));
            }}
            className="h-9 w-24 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </SettingRow>
        <SettingRow
          label={t("settings.appearance.terminalFont.customFiles")}
          description={t("settings.appearance.terminalFont.customFiles.desc")}
        >
          <div className="flex items-center gap-2 justify-end">
            <input
              ref={fontFileInputRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              className="hidden"
              onChange={(e) => void handleImportFontFile(e.target.files?.[0] ?? null)}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fontFileInputRef.current?.click()}
            >
              {t("settings.appearance.terminalFont.import")}
            </Button>
          </div>
        </SettingRow>
        {terminalCustomFonts.length > 0 && (
          <div className="py-3 space-y-2">
            {terminalCustomFonts.map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground truncate max-w-[240px]" title={f.name}>
                  {f.name}
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => removeTerminalCustomFont(f.id)}
                >
                  {t("action.remove")}
                </Button>
              </div>
            ))}
          </div>
        )}
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
