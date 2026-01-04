import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { useLLMBackend } from "../application/state/useLLMBackend";
import { useSettingsState } from "../application/state/useSettingsState";
import { DEFAULT_LLM_CONFIG, type LLMConfig } from "../domain/models";
import { cn } from "../lib/utils";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Toggle } from "./ui/toggle";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";

const AiSettingsManager: React.FC = () => {
  const { t } = useI18n();
  const settings = useSettingsState();
  const llm = useLLMBackend();

  const savedConfig = useMemo<LLMConfig>(() => {
    const current = settings.terminalSettings.llmConfig;
    return current ? { ...DEFAULT_LLM_CONFIG, ...current } : { ...DEFAULT_LLM_CONFIG };
  }, [settings.terminalSettings.llmConfig]);

  const [draft, setDraft] = useState<LLMConfig>(savedConfig);
  const [isDirty, setIsDirty] = useState(false);
  const [isTesting, setIsTesting] = useState(false);

  useEffect(() => {
    if (!isDirty) {
      setDraft(savedConfig);
    }
  }, [savedConfig, isDirty]);

  const updateDraft = useCallback((patch: Partial<LLMConfig>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
    setIsDirty(true);
  }, []);

  const canTest = useMemo(() => {
    if (!draft.enabled) return false;
    if (draft.provider === "gemini") return Boolean(draft.apiKey?.trim()) && Boolean(draft.model?.trim());
    if (draft.provider === "claude") {
      return Boolean(draft.apiKey?.trim()) && Boolean(draft.model?.trim()) && Boolean(draft.endpoint?.trim());
    }
    if (draft.provider === "custom") {
      return Boolean(draft.model?.trim()) && Boolean(draft.endpoint?.trim());
    }
    return false;
  }, [draft]);

  const handleSave = useCallback(() => {
    settings.updateTerminalSetting("llmConfig", draft);
    setIsDirty(false);
    toast.success(t("common.saved"));
  }, [draft, settings, t]);

  const handleTest = useCallback(async () => {
    if (!canTest) {
      toast.info(t("ai.test.missingConfig"));
      return;
    }

    setIsTesting(true);
    try {
      const prompt = "请回复：OK";
      const result = await llm.testChat(draft, prompt);
      if (result.error) {
        toast.error(result.error, t("ai.test.failedTitle"));
        return;
      }
      toast.success(t("ai.test.success"));
      if (isDirty) {
        toast.info(t("ai.test.rememberSave"));
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      toast.error(message, t("ai.test.failedTitle"));
    } finally {
      setIsTesting(false);
    }
  }, [canTest, draft, isDirty, llm, t]);

  return (
    <div className="relative h-full min-h-0 flex flex-col">
      <header className="border-b border-border/50 bg-secondary/80 backdrop-blur app-drag">
        <div className="h-14 px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="app-no-drag">
              <p className="text-sm font-semibold text-foreground">{t("vault.nav.ai")}</p>
              <p className="text-xs text-muted-foreground">{t("settings.tab.terminal")}</p>
            </div>
          </div>
        </div>
      </header>

      <div className="flex-1 min-h-0 p-4 overflow-auto flex flex-col">
        <div className="rounded-lg border bg-card p-4 space-y-4 flex flex-col flex-1 min-h-0">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">{t("settings.terminal.llm.title")}</span>
            <Toggle
              checked={draft.enabled}
              onChange={(enabled) =>
                updateDraft({
                  enabled,
                  provider: draft.provider ?? "gemini",
                  apiKey: draft.apiKey ?? "",
                  model: draft.model ?? "gemini-2.5-flash",
                  endpoint: draft.endpoint,
                  autoSuggestOnError: draft.autoSuggestOnError ?? true,
                })
              }
            />
          </div>

          {draft.enabled && (
            <div className="space-y-3 pt-2">
              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.terminal.llm.provider")}</Label>
                <select
                  value={draft.provider}
                  onChange={(e) => updateDraft({ provider: e.target.value as LLMConfig["provider"] })}
                  className={cn("w-full px-3 py-2 text-sm rounded-md border bg-background")}
                >
                  <option value="gemini">Google Gemini</option>
                  <option value="claude">Anthropic Claude</option>
                  <option value="custom">Custom API</option>
                  <option value="openai" disabled>
                    OpenAI (Coming Soon)
                  </option>
                </select>
              </div>

              {(draft.provider === "custom" || draft.provider === "claude") && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Endpoint</Label>
                  <Input
                    value={draft.endpoint ?? ""}
                    onChange={(e) => updateDraft({ endpoint: e.target.value })}
                    placeholder={
                      draft.provider === "claude"
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
                  value={draft.model}
                  onChange={(e) => updateDraft({ model: e.target.value })}
                  placeholder={
                    draft.provider === "claude"
                      ? "claude-3-sonnet"
                      : draft.provider === "custom"
                        ? "your-model"
                        : "gemini-2.5-flash"
                  }
                  className="w-full text-sm"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t("settings.terminal.llm.apiKey")}</Label>
                <Input
                  type="password"
                  value={draft.apiKey}
                  onChange={(e) => updateDraft({ apiKey: e.target.value })}
                  placeholder={
                    draft.provider === "claude"
                      ? "sk-ant-..."
                      : draft.provider === "custom"
                        ? "Bearer ... (or token)"
                        : "AIza..."
                  }
                  className="w-full font-mono text-xs"
                />
              </div>

              <div className="space-y-3 pt-2 border-t">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t("settings.terminal.llm.autoSuggestOnError")}</Label>
                  <Toggle
                    checked={draft.autoSuggestOnError}
                    onChange={(autoSuggestOnError) => updateDraft({ autoSuggestOnError })}
                  />
                </div>
              </div>
            </div>
          )}

          <div className="pt-2 border-t flex items-center justify-end gap-2 mt-auto">
            <Button
              variant="outline"
              onClick={handleTest}
              disabled={isTesting || !draft.enabled}
              title={!canTest ? t("ai.test.missingConfig") : undefined}
            >
              {isTesting ? t("common.testing") : t("common.test")}
            </Button>
            <Button variant="default" onClick={handleSave} disabled={!isDirty}>
              {t("common.saveChanges")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AiSettingsManager;
