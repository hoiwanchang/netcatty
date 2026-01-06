import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { SerializeAddon } from "@xterm/addon-serialize";
import { SearchAddon } from "@xterm/addon-search";
import "@xterm/xterm/css/xterm.css";
import { Maximize2, Radio } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "../application/i18n/I18nProvider";
import { logger } from "../lib/logger";
import { cn } from "../lib/utils";
import {
  Host,
  Identity,
  KnownHost,
  SerialConfig,
  SSHKey,
  Snippet,
  TerminalSession,
  TerminalTheme,
  TerminalSettings,
  KeyBinding,
} from "../types";
import { resolveHostAuth } from "../domain/sshAuth";
import { useTerminalBackend } from "../application/state/useTerminalBackend";
import KnownHostConfirmDialog, { HostKeyInfo } from "./KnownHostConfirmDialog";
import SFTPModal from "./SFTPModal";
import { Button } from "./ui/button";
import { toast } from "./ui/toast";
import { TERMINAL_FONTS } from "../infrastructure/config/fonts";
import { TERMINAL_THEMES } from "../infrastructure/config/terminalThemes";

import { TerminalConnectionDialog } from "./terminal/TerminalConnectionDialog";
import { TerminalToolbar } from "./terminal/TerminalToolbar";
import { TerminalContextMenu } from "./terminal/TerminalContextMenu";
import { TerminalSearchBar } from "./terminal/TerminalSearchBar";
import { createHighlightProcessor } from "./terminal/keywordHighlight";
import { createTerminalSessionStarters, type PendingAuth } from "./terminal/runtime/createTerminalSessionStarters";
import { createXTermRuntime, type XTermRuntime } from "./terminal/runtime/createXTermRuntime";
import { XTERM_PERFORMANCE_CONFIG } from "../infrastructure/config/xtermPerformance";
import { useTerminalSearch } from "./terminal/hooks/useTerminalSearch";
import { useTerminalContextActions } from "./terminal/hooks/useTerminalContextActions";
import { useTerminalAuthState } from "./terminal/hooks/useTerminalAuthState";
import { useLLMIntegration } from "./terminal/hooks/useLLMIntegration";
import { DEFAULT_SERVER_STATUS_SETTINGS } from "../domain/models";
import { useCommandCandidatesCache } from "../application/state/useCommandCandidatesCache";

const hexToRgb = (hex: string): { r: number; g: number; b: number } | null => {
  const normalized = hex.trim().replace(/^#/, "");
  if (normalized.length === 3) {
    const r = parseInt(normalized[0] + normalized[0], 16);
    const g = parseInt(normalized[1] + normalized[1], 16);
    const b = parseInt(normalized[2] + normalized[2], 16);
    return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
      ? { r, g, b }
      : null;
  }
  if (normalized.length !== 6) return null;
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  return Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)
    ? { r, g, b }
    : null;
};

const mixRgb = (
  a: { r: number; g: number; b: number },
  b: { r: number; g: number; b: number },
  amountB: number,
) => {
  const t = Math.min(1, Math.max(0, amountB));
  return {
    r: Math.round(a.r * (1 - t) + b.r * t),
    g: Math.round(a.g * (1 - t) + b.g * t),
    b: Math.round(a.b * (1 - t) + b.b * t),
  };
};

interface TerminalProps {
  host: Host;
  keys: SSHKey[];
  identities: Identity[];
  snippets: Snippet[];
  allHosts?: Host[];
  knownHosts?: KnownHost[];
  isVisible: boolean;
  isActiveTab?: boolean;
  serverStatus?: import('../application/state/useActiveSessionServerStatus').ActiveSessionServerStatus | null;
  inWorkspace?: boolean;
  isResizing?: boolean;
  isFocusMode?: boolean;
  isFocused?: boolean;
  fontFamilyId: string;
  fontSize: number;
  terminalTheme: TerminalTheme;
  terminalSettings?: TerminalSettings;
  sessionId: string;
  startupCommand?: string;
  serialConfig?: SerialConfig;
  onUpdateTerminalThemeId?: (themeId: string) => void;
  onUpdateTerminalFontFamilyId?: (fontFamilyId: string) => void;
  onUpdateTerminalFontSize?: (fontSize: number) => void;
  hotkeyScheme?: "disabled" | "mac" | "pc";
  keyBindings?: KeyBinding[];
  onHotkeyAction?: (action: string, event: KeyboardEvent) => void;
  onStatusChange?: (sessionId: string, status: TerminalSession["status"]) => void;
  onSessionExit?: (sessionId: string) => void;
  onTerminalDataCapture?: (sessionId: string, data: string) => void;
  onOsDetected?: (hostId: string, distro: string) => void;
  onCloseSession?: (sessionId: string) => void;
  onUpdateHost?: (host: Host) => void;
  onAddKnownHost?: (knownHost: KnownHost) => void;
  onExpandToFocus?: () => void;
  onCommandExecuted?: (
    command: string,
    hostId: string,
    hostLabel: string,
    sessionId: string,
  ) => void;
  onSplitHorizontal?: () => void;
  onSplitVertical?: () => void;
  isBroadcastEnabled?: boolean;
  onToggleBroadcast?: () => void;
  onBroadcastInput?: (data: string, sourceSessionId: string) => void;
}

const TerminalComponent: React.FC<TerminalProps> = ({
  host,
  keys,
  identities,
  snippets,
  allHosts = [],
  knownHosts: _knownHosts = [],
  isVisible,
  isActiveTab,
  serverStatus,
  inWorkspace,
  isResizing,
  isFocusMode,
  isFocused,
  fontFamilyId,
  fontSize,
  terminalTheme,
  terminalSettings,
  sessionId,
  startupCommand,
  serialConfig,
  onUpdateTerminalThemeId,
  onUpdateTerminalFontFamilyId,
  onUpdateTerminalFontSize,
  hotkeyScheme = "disabled",
  keyBindings = [],
  onHotkeyAction,
  onStatusChange,
  onSessionExit,
  onTerminalDataCapture,
  onOsDetected,
  onCloseSession,
  onUpdateHost,
  onAddKnownHost,
  onExpandToFocus,
  onCommandExecuted,
  onSplitHorizontal,
  onSplitVertical,
  isBroadcastEnabled,
  onToggleBroadcast,
  onBroadcastInput,
}) => {
  const CONNECTION_TIMEOUT = 12000;
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const termRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const serializeAddonRef = useRef<SerializeAddon | null>(null);
  const searchAddonRef = useRef<SearchAddon | null>(null);
  const xtermRuntimeRef = useRef<XTermRuntime | null>(null);
  const disposeDataRef = useRef<(() => void) | null>(null);
  const disposeExitRef = useRef<(() => void) | null>(null);
  const sessionRef = useRef<string | null>(null);
  const hasConnectedRef = useRef(false);
  const hasRunStartupCommandRef = useRef(false);
  const commandBufferRef = useRef<string>("");

  const pathCommandsRef = useRef<string[] | null>(null);
  const pathCommandsFetchedAtRef = useRef<number | null>(null);
  const pathCommandsLoadingRef = useRef(false);
  const inlineCandidatesRenderedRef = useRef<string>("");

  const [candidatesPopup, setCandidatesPopup] = useState<{
    open: boolean;
    items: string[];
    left: number;
    top: number;
    placement: "below" | "above";
  }>({ open: false, items: [], left: 0, top: 0, placement: "below" });
  const serialLineBufferRef = useRef<string>("");

  const terminalSettingsRef = useRef(terminalSettings);
  terminalSettingsRef.current = terminalSettings;

  const highlightProcessorRef = useRef<(text: string) => string>((t) => t);

  const hotkeySchemeRef = useRef(hotkeyScheme);
  const keyBindingsRef = useRef(keyBindings);
  const onHotkeyActionRef = useRef(onHotkeyAction);
  hotkeySchemeRef.current = hotkeyScheme;
  keyBindingsRef.current = keyBindings;
  onHotkeyActionRef.current = onHotkeyAction;

  const isBroadcastEnabledRef = useRef(isBroadcastEnabled);
  const onBroadcastInputRef = useRef(onBroadcastInput);
  isBroadcastEnabledRef.current = isBroadcastEnabled;
  onBroadcastInputRef.current = onBroadcastInput;

  const terminalBackend = useTerminalBackend();
  const commandCandidatesCache = useCommandCandidatesCache();

  const COMMAND_CANDIDATES_CACHE_VERSION = 1;

  const commandCandidatesEnabled = terminalSettings?.commandCandidates?.enabled ?? false;

  const commandCandidatesCacheTtlMs = useMemo(() => {
    const raw = terminalSettings?.commandCandidates?.cacheTtlMs;
    const ms = typeof raw === "number" && Number.isFinite(raw) ? raw : 24 * 60 * 60 * 1000;
    // Clamp: 1h .. 7d
    return Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Math.round(ms)));
  }, [terminalSettings?.commandCandidates?.cacheTtlMs]);

  const effectiveTheme = useMemo(() => {
    if (host.theme) {
      const hostTheme = TERMINAL_THEMES.find((t) => t.id === host.theme);
      if (hostTheme) return hostTheme;
    }
    return terminalTheme;
  }, [host.theme, terminalTheme]);
  const { resizeSession } = terminalBackend;

  const [isScriptsOpen, setIsScriptsOpen] = useState(false);
  const [status, setStatus] = useState<TerminalSession["status"]>("connecting");
  const [error, setError] = useState<string | null>(null);
  const lastToastedErrorRef = useRef<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [progressLogs, setProgressLogs] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(CONNECTION_TIMEOUT / 1000);
  const [isCancelling, setIsCancelling] = useState(false);
  const [showSFTP, setShowSFTP] = useState(false);
  const [progressValue, setProgressValue] = useState(15);
  const [hasSelection, setHasSelection] = useState(false);

  const statusRef = useRef<TerminalSession["status"]>(status);
  statusRef.current = status;

  const [chainProgress, setChainProgress] = useState<{
    currentHop: number;
    totalHops: number;
    currentHostLabel: string;
  } | null>(null);

  const terminalSearch = useTerminalSearch({ searchAddonRef, termRef });
  const {
    isSearchOpen,
    setIsSearchOpen,
    searchMatchCount,
    handleToggleSearch,
    handleSearch,
    handleFindNext,
    handleFindPrevious,
    handleCloseSearch,
  } = terminalSearch;

  // LLM Integration
  const llmIntegration = useLLMIntegration(terminalSettings?.llmConfig);
  const {
    suggestions: _llmSuggestions,
    isProcessing: _isLLMProcessing,
    handleLLMChat,
  } = llmIntegration;

  const llmBannerPrintedRef = useRef(false);
  const aiBlockZebraIndexRef = useRef(0);
  const commandBlockZebraIndexRef = useRef(0);
  const commandBlockBgSeqRef = useRef<string>("");

  const writeAiBlock = useCallback(
    (term: XTerm, opts: { prompt: string; response?: string; error?: string }) => {
      const bgRgb = hexToRgb(effectiveTheme.colors.background) ?? { r: 0, g: 0, b: 0 };
      const fgRgb = hexToRgb(effectiveTheme.colors.foreground) ?? { r: 220, g: 220, b: 220 };

      const zebraEnabled = terminalSettingsRef.current?.llmConfig?.zebraStripingEnabled ?? false;
      const zebraIndex = zebraEnabled ? aiBlockZebraIndexRef.current : 0;

      const customStripeColors = terminalSettingsRef.current?.llmConfig?.zebraStripeColors;
      const stripeList = Array.isArray(customStripeColors)
        ? customStripeColors
            .map((c) => (typeof c === "string" ? (c.startsWith("#") ? c : `#${c}`) : ""))
            .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
        : [];
      const stripeColor = zebraEnabled && stripeList.length > 0
        ? hexToRgb(stripeList[zebraIndex % stripeList.length])
        : null;

      // Derive subtle block backgrounds from the active terminal theme.
      // Keep the delta small but visible.
      const baseMix = zebraIndex % 2 === 0 ? 0.08 : 0.14;
      const blockBg = stripeColor ?? mixRgb(bgRgb, fgRgb, baseMix);
      const headerBg = mixRgb(blockBg, fgRgb, 0.14);

      const cols = Math.max(term.cols || 80, 40);
      const pad = (s: string) => {
        const clean = s.replace(/[\r\n]+/g, " ");
        if (clean.length >= cols - 2) return clean.slice(0, cols - 2);
        return clean + " ".repeat(cols - 2 - clean.length);
      };

      const bg = (rgb: { r: number; g: number; b: number }) => `\x1b[48;2;${rgb.r};${rgb.g};${rgb.b}m`;
      const fg = (rgb: { r: number; g: number; b: number }) => `\x1b[38;2;${rgb.r};${rgb.g};${rgb.b}m`;
      const reset = "\x1b[0m";

      const header = ` AI `;
      const top = "┌" + "─".repeat(cols - 2) + "┐";
      const bottom = "└" + "─".repeat(cols - 2) + "┘";

      term.writeln("\r\n" + bg(headerBg) + fg(fgRgb) + pad(top) + reset);
      term.writeln(
        bg(headerBg) +
          fg(fgRgb) +
          pad(`│${header}${" ".repeat(Math.max(0, cols - 2 - header.length))}│`) +
          reset,
      );
      term.writeln(bg(blockBg) + fg(fgRgb) + pad(`│> # ${opts.prompt}`.padEnd(cols - 2, " ") + "│") + reset);

      const bodyTextRaw = opts.error ? `错误：${opts.error}` : opts.response ?? "";
      // Normalize CRLF so blank lines are preserved and \r never moves the cursor unexpectedly.
      const bodyText = bodyTextRaw.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
      const bodyLines = bodyText.split("\n");
      for (const line of bodyLines) {
        term.writeln(bg(blockBg) + fg(fgRgb) + pad(`│${line}`.padEnd(cols - 2, " ") + "│") + reset);
      }

      term.writeln(bg(blockBg) + fg(fgRgb) + pad(bottom) + reset);
    },
    [effectiveTheme.colors.background, effectiveTheme.colors.foreground],
  );

  const lastUserCommandRef = useRef<string | null>(null);
  const lastCommandOutputRef = useRef<string>("");
  const autoSuggestInFlightRef = useRef(false);
  const autoSuggestedCommandRef = useRef<string | null>(null);
  const isSensitiveInputRef = useRef(false);

  const stripAnsi = useCallback((input: string): string => {
    // Minimal ANSI stripper (avoids regex literals that trigger no-control-regex).
    let out = "";
    for (let i = 0; i < input.length; i++) {
      const code = input.charCodeAt(i);
      // ESC (0x1b) or CSI (0x9b)
      if (code === 0x1b || code === 0x9b) {
        // Consume CSI sequence: ESC [ ... final-byte (0x40-0x7E)
        if (code === 0x1b && input[i + 1] === "[") {
          i += 2;
          while (i < input.length) {
            const c = input.charCodeAt(i);
            if (c >= 0x40 && c <= 0x7e) break;
            i++;
          }
        }
        continue;
      }
      out += input[i];
    }
    return out;
  }, []);

  const shouldAutoSuggestFromText = useCallback((text: string): boolean => {
    const t = text.toLowerCase();
    return (
      t.includes("command not found") ||
      t.includes("no such file or directory") ||
      t.includes("permission denied") ||
      t.includes("cannot ") ||
      t.includes("error:") ||
      t.includes("failed") ||
      t.includes("syntax error") ||
      t.includes("segmentation fault") ||
      t.includes("core dumped") ||
      t.includes("invalid option") ||
      t.includes("unknown option") ||
      t.includes("unrecognized option") ||
      t.includes("is not recognized") ||
      t.includes("parameter cannot be found")
    );
  }, []);

  const maybeTriggerAutoSuggest = useCallback(async () => {
    const config = terminalSettingsRef.current?.llmConfig;
    if (!config?.enabled || !config.autoSuggestOnError) return;
    if (autoSuggestInFlightRef.current) return;
    const cmd = lastUserCommandRef.current;
    if (!cmd) return;
    if (autoSuggestedCommandRef.current === cmd) return;
    const output = lastCommandOutputRef.current;
    if (!output.trim()) return;
    if (!shouldAutoSuggestFromText(output)) return;

    autoSuggestInFlightRef.current = true;
    try {
      const response = await llmIntegration.suggestCommandFix(cmd, output);
      if (!response || !termRef.current) return;
      writeAiBlock(termRef.current, {
        prompt: `修复建议：${cmd}`,
        response: response.text,
        error: response.error,
      });

      // Important: avoid re-triggering for the same command.
      autoSuggestedCommandRef.current = cmd;
      lastUserCommandRef.current = null;
      lastCommandOutputRef.current = "";
    } finally {
      autoSuggestInFlightRef.current = false;
    }
  }, [llmIntegration, shouldAutoSuggestFromText, writeAiBlock]);


  const applyCommandBlockBgToChunk = useCallback((chunk: string) => {
    const bg = commandBlockBgSeqRef.current;
    if (!bg) return chunk;

    const stripAnsiForPrompt = (input: string): string => {
      let out = "";
      for (let i = 0; i < input.length; i++) {
        const code = input.charCodeAt(i);
        if (code === 0x1b || code === 0x9b) {
          if (code === 0x1b && input[i + 1] === "[") {
            i += 2;
            while (i < input.length) {
              const c = input.charCodeAt(i);
              if (c >= 0x40 && c <= 0x7e) break;
              i++;
            }
          }
          continue;
        }
        out += input[i];
      }
      return out;
    };

    const looksLikePromptLine = (visibleLine: string): boolean => {
      // Keep checks conservative to avoid false positives.
      // Common bash/zsh: user@host:path$  / user@host:path#
      // Common Windows: PS ...>  / C:\...>
      const v = visibleLine.replace(/\s+$/, " ");
      if (v.length === 0 || v.length > 260) return false;
      if (/^PS [^\r\n>]{0,240}> $/.test(v)) return true;
      if (/^[A-Za-z]:\\[^\r\n>]{0,240}> $/.test(v)) return true;
      if (/^[^\s\r\n]{1,64}@[\w.-]{1,128}:[^\r\n]{0,180}[$#] $/.test(v)) return true;
      return false;
    };

    const findPromptLineStart = (input: string): number | null => {
      let lineStart = 0;
      for (let i = 0; i <= input.length; i++) {
        const atEnd = i === input.length;
        const ch = atEnd ? "" : input[i];
        if (atEnd || ch === "\n" || ch === "\r") {
          const lineEnd = i;
          const rawLine = input.slice(lineStart, lineEnd);
          const visible = stripAnsiForPrompt(rawLine);
          if (looksLikePromptLine(visible)) return lineStart;

          if (!atEnd) {
            if (ch === "\r" && input[i + 1] === "\n") i += 1;
            lineStart = i + 1;
          }
        }
      }
      return null;
    };

    const promptStart = findPromptLineStart(chunk);
    const chunkBeforePrompt = promptStart == null ? chunk : chunk.slice(0, promptStart);
    const chunkPromptAndAfter = promptStart == null ? "" : chunk.slice(promptStart);

    // Keep background stable even when output resets attributes.
    // Also fill the rest of each line so the stripe looks like a block.
    const stabilized =
      bg +
      chunkBeforePrompt
        .split("\x1b[0m")
        .join(`\x1b[0m${bg}`)
        .split("\x1b[m")
        .join(`\x1b[m${bg}`)
        .split("\x1b[49m")
        .join(`\x1b[49m${bg}`);

    // EL (Erase in Line) clears to end-of-line using current attributes.
    // Insert it before each line break and re-apply bg on the next line.
    // Important: handle CRLF/LF/CR in a single pass to avoid double-processing.
    let out = "";
    for (let i = 0; i < stabilized.length; i++) {
      const ch = stabilized[i];
      if (ch === "\r") {
        if (stabilized[i + 1] === "\n") {
          out += `\x1b[K\r\n${bg}`;
          i += 1;
          continue;
        }
        out += `\x1b[K\r${bg}`;
        continue;
      }
      if (ch === "\n") {
        out += `\x1b[K\n${bg}`;
        continue;
      }
      out += ch;
    }

    if (promptStart != null) {
      // Stop striping before the next prompt so it doesn't bleed.
      commandBlockBgSeqRef.current = "";
      return out + "\x1b[0m" + chunkPromptAndAfter;
    }

    return out;
  }, []);

  const computeCommandBlockBgSeq = useCallback(
    (index: number) => {
      const customStripeColors = terminalSettingsRef.current?.llmConfig?.zebraStripeColors;
      const stripeList = Array.isArray(customStripeColors)
        ? customStripeColors
            .map((c) => (typeof c === "string" ? (c.startsWith("#") ? c : `#${c}`) : ""))
            .filter((c) => /^#[0-9a-fA-F]{6}$/.test(c))
        : [];
      if (stripeList.length > 0) {
        const chosen = hexToRgb(stripeList[index % stripeList.length]);
        if (chosen) return `\x1b[48;2;${chosen.r};${chosen.g};${chosen.b}m`;
      }
      const bgRgb = hexToRgb(effectiveTheme.colors.background);
      const fgRgb = hexToRgb(effectiveTheme.colors.foreground);
      if (!bgRgb || !fgRgb) return "";
      // Make the stripe clearly visible (more contrast than AI block).
      const ratio = index % 2 === 0 ? 0.16 : 0.28;
      const mixed = mixRgb(bgRgb, fgRgb, ratio);
      return `\x1b[48;2;${mixed.r};${mixed.g};${mixed.b}m`;
    },
    [effectiveTheme.colors.background, effectiveTheme.colors.foreground],
  );

  const advanceCommandBlockZebra = useCallback(() => {
    const zebraEnabled = terminalSettingsRef.current?.llmConfig?.zebraStripingEnabled ?? false;
    if (!zebraEnabled) {
      commandBlockBgSeqRef.current = "";
      return;
    }
    const listLen = terminalSettingsRef.current?.llmConfig?.zebraStripeColors?.length ?? 0;
    const cycle = listLen > 0 ? listLen : 2;
    commandBlockZebraIndexRef.current = (commandBlockZebraIndexRef.current + 1) % cycle;
    commandBlockBgSeqRef.current = computeCommandBlockBgSeq(commandBlockZebraIndexRef.current);
  }, [computeCommandBlockBgSeq]);

  useEffect(() => {
    const base = createHighlightProcessor(
      terminalSettings?.keywordHighlightRules ?? [],
      terminalSettings?.keywordHighlightEnabled ?? false,
    );
    highlightProcessorRef.current = (text) => {
      // Detect password/passphrase prompts (sudo, ssh key passphrase, etc.)
      // and enter a sensitive input mode so we never treat hidden input as a command.
      const cleanedForDetection = stripAnsi(text);
      const lowered = cleanedForDetection.toLowerCase();
      if (
        lowered.includes("password:") ||
        lowered.includes("passphrase") ||
        lowered.includes("[sudo] password for") ||
        lowered.includes("enter passphrase")
      ) {
        isSensitiveInputRef.current = true;
        commandBufferRef.current = "";
        lastUserCommandRef.current = null;
        lastCommandOutputRef.current = "";
        autoSuggestedCommandRef.current = null;
      }

      // Capture output for auto-suggest (best effort, based on output patterns).
      if (lastUserCommandRef.current && !autoSuggestInFlightRef.current) {
        if (cleanedForDetection) {
          const next = (lastCommandOutputRef.current + cleanedForDetection).slice(-12000);
          lastCommandOutputRef.current = next;
          // Fire-and-forget; internally guarded.
          void maybeTriggerAutoSuggest();
        }
      }
      const processed = base(text);
      const zebraEnabled = terminalSettingsRef.current?.llmConfig?.zebraStripingEnabled ?? false;
      if (!zebraEnabled) return processed;
      return applyCommandBlockBgToChunk(processed);
    };
  }, [
    terminalSettings?.keywordHighlightEnabled,
    terminalSettings?.keywordHighlightRules,
    applyCommandBlockBgToChunk,
    maybeTriggerAutoSuggest,
    stripAnsi,
  ]);


  // Wrap onCommandExecuted to handle LLM commands
  const handleCommandExecuted = async (
    command: string,
    hostId: string,
    hostLabel: string,
    sessionId: string,
  ) => {
    // Never treat hidden/sensitive input as a command.
    if (isSensitiveInputRef.current) {
      return;
    }
    // Check if it's an LLM command (starts with #)
    if (command.startsWith('#')) {
      const prompt = command.substring(1).trim();
      if (prompt && termRef.current) {
        // Alternate block background per AI call (when enabled)
        if (terminalSettingsRef.current?.llmConfig?.zebraStripingEnabled) {
          aiBlockZebraIndexRef.current += 1;
        }

        // Call LLM
        const response = await handleLLMChat(prompt);

        writeAiBlock(termRef.current, {
          prompt,
          response: response.text,
          error: response.error,
        });
      }
      return; // Don't call the original handler for LLM commands
    }

    // Track last user command for auto-suggest.
    lastUserCommandRef.current = command;
    lastCommandOutputRef.current = "";
    autoSuggestedCommandRef.current = null;
    
    // For non-LLM commands, call the original handler
    onCommandExecuted?.(command, hostId, hostLabel, sessionId);
  };

  useEffect(() => {
    if (!error) {
      lastToastedErrorRef.current = null;
      return;
    }
    if (lastToastedErrorRef.current === error) return;
    lastToastedErrorRef.current = error;
    toast.error(error, t("terminal.connectionErrorTitle"));
  }, [error, t]);

  const pendingAuthRef = useRef<PendingAuth>(null);
  const sessionStartersRef = useRef<ReturnType<typeof createTerminalSessionStarters> | null>(null);
  const auth = useTerminalAuthState({
    host,
    pendingAuthRef,
    termRef,
    onUpdateHost,
    onStartSsh: (term) => {
      sessionStartersRef.current?.startSSH(term);
    },
    setStatus: (next) => setStatus(next),
    setProgressLogs,
  });

  const [needsHostKeyVerification, setNeedsHostKeyVerification] = useState(false);
  const [pendingHostKeyInfo, setPendingHostKeyInfo] = useState<HostKeyInfo | null>(null);
  const pendingConnectionRef = useRef<(() => void) | null>(null);

  const resolvedChainHosts = useMemo(() => {
    return (
      (host.hostChain?.hostIds
        ?.map((id) => allHosts.find((h) => h.id === id))
        .filter(Boolean) as Host[]) || []
    );
  }, [allHosts, host.hostChain?.hostIds]);

  const buildPathCommandsCommand = useCallback((): string => {
    // Outputs one command name per line, prefixed with a marker line.
    // Important: remote user shells may be fish/pwsh; force a compatible shell.

    if (host.os === "windows") {
      // PowerShell: list file names in PATH (strip common executable extensions).
      // Keep output simple: marker + one name per line.
      return [
        "powershell -NoProfile -NonInteractive -Command \"",
        "[Console]::OutputEncoding=[System.Text.Encoding]::UTF8;",
        "'NCCMDSv1';",
        "$env:Path -split ';' | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object {",
        "  Get-ChildItem -File -Force $_ -ErrorAction SilentlyContinue",
        "} | ForEach-Object {",
        "  $n=$_.Name; $e=$_.Extension.ToLower();",
        "  if($e -in '.exe','.cmd','.bat','.ps1'){ [IO.Path]::GetFileNameWithoutExtension($n) } else { $n }",
        "} | Sort-Object -Unique",
        "\"",
      ].join(" ");
    }

    // POSIX via sh -lc (avoids fish syntax differences).
    // Prefer shell-native command discovery (much faster than scanning PATH) when possible.
    // IMPORTANT: join with newlines (not semicolons). Some shells treat `then;` / `do;` as syntax errors.
    const script = [
      'printf "NCCMDSv1\\n"',
      'shell="${SHELL-}"',
      'if echo "$shell" | grep -qi "bash" && command -v bash >/dev/null 2>&1; then',
      '  bash -lc "compgen -c" 2>/dev/null',
      'elif echo "$shell" | grep -qi "zsh" && command -v zsh >/dev/null 2>&1; then',
      // Escape $ so sh does not expand ${(k)commands}.
      '  zsh -lc "print -l \\\u0024{(k)commands}" 2>/dev/null',
      'elif command -v bash >/dev/null 2>&1; then',
      '  bash -lc "compgen -c" 2>/dev/null',
      'elif command -v zsh >/dev/null 2>&1; then',
      '  zsh -lc "print -l \\\u0024{(k)commands}" 2>/dev/null',
      'else',
      '  IFS=":"',
      '  for d in ${PATH-}; do',
      '    [ -d "$d" ] || continue',
      '    for f in "$d"/*; do',
      '      [ -f "$f" ] && [ -x "$f" ] && printf "%s\\n" "${f##*/}"',
      '    done',
      '  done',
      'fi | (',
      '  if command -v sort >/dev/null 2>&1; then',
      '    LC_ALL=C sort -u',
      '  elif command -v awk >/dev/null 2>&1; then',
      '    awk "NF && !seen[$0]++"',
      '  else',
      '    cat',
      '  fi',
      ')',
    ].join("\n");
    const quoted = script.replace(/'/g, "'\\''");
    return `sh -lc '${quoted}'`;
  }, [host.os]);

  const parsePathCommandsOutput = useCallback((combined: string): string[] => {
    const lines = combined.split(/\r?\n/);
    const markerIndex = lines.findIndex((l) => l.trim() === "NCCMDSv1");
    const payload = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;
    const out: string[] = [];
    const seen = new Set<string>();
    for (const raw of payload) {
      const name = raw.trim();
      if (!name) continue;
      // Keep it conservative; we only need executable names.
      if (!/^[A-Za-z0-9._+-]+$/.test(name)) continue;
      if (seen.has(name)) continue;
      seen.add(name);
      out.push(name);
    }
    return out;
  }, []);

  const computePopupPosition = useCallback(
    (term: XTerm, itemsCount: number) => {
      const containerEl = containerRef.current;
      if (!containerEl) return null;

      const getCellDimensions = () => {
        const coreDims = (
          term as unknown as {
            _core?: {
              _renderService?: {
                dimensions?: { actualCellWidth?: number; actualCellHeight?: number };
              };
            };
          }
        )?._core?._renderService?.dimensions;
        const cw = Number(coreDims?.actualCellWidth);
        const ch = Number(coreDims?.actualCellHeight);
        if (Number.isFinite(cw) && cw > 0 && Number.isFinite(ch) && ch > 0) {
          return { cw, ch };
        }

        // Fallback: approximate based on container size.
        const rect = containerEl.getBoundingClientRect();
        const approxCw = rect.width / Math.max(1, term.cols);
        const approxCh = rect.height / Math.max(1, term.rows);
        return { cw: approxCw, ch: approxCh };
      };

      const { cw, ch } = getCellDimensions();

      // Coordinates relative to the nearest positioned ancestor (the wrapping relative div).
      const paddingLeft = parseFloat(getComputedStyle(containerEl).paddingLeft || "0") || 0;
      const baseLeft = containerEl.offsetLeft + paddingLeft;
      const baseTop = containerEl.offsetTop;

      const col = term.buffer.active.cursorX;
      const row = term.buffer.active.cursorY;

      const left = Math.round(baseLeft + col * cw);
      const rowTop = Math.round(baseTop + row * ch);
      const belowTop = Math.round(rowTop + ch);

      // Estimate item height (tight list); keep it consistent visually.
      const itemHeight = 22;
      const popupHeight = Math.min(10, Math.max(1, itemsCount)) * itemHeight + 10;

      const containerRect = containerEl.getBoundingClientRect();
      const containerHeight = containerRect.height;
      const cursorYInContainer = row * ch;

      const wouldOverflowBelow = cursorYInContainer + ch + popupHeight > containerHeight;
      const placement: "below" | "above" = wouldOverflowBelow ? "above" : "below";
      const top = placement === "below" ? belowTop : Math.max(baseTop, Math.round(rowTop - popupHeight));

      return { left, top, placement };
    },
    [containerRef],
  );

  const clearInlineCandidates = useCallback(() => {
    const term = termRef.current;
    if (!term) return;
    if (!inlineCandidatesRenderedRef.current) return;
    // Save cursor, clear to end-of-line, restore cursor.
    term.write("\x1b[s\x1b[0K\x1b[u");
    inlineCandidatesRenderedRef.current = "";
  }, []);

  const renderInlineCandidates = useCallback(
    (buffer: string) => {
      const term = termRef.current;
      if (!term) return;

      // Ensure any previous inline overlay is cleared (older versions used terminal writes).
      clearInlineCandidates();

      if (!commandCandidatesEnabled) {
        setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
        return;
      }

      // Don't render anything while in sensitive mode.
      if (isSensitiveInputRef.current) {
        setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
        return;
      }

      const trimmed = buffer.trimStart();
      // Only for command name (first token) and skip LLM-chat mode.
      if (!trimmed || trimmed.startsWith("#") || /\s/.test(trimmed)) {
        setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
        return;
      }

      const commands = pathCommandsRef.current;
      if (!commands || commands.length === 0) {
        setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
        return;
      }

      const prefix = trimmed;
      // Avoid damaging line edits: only render if there's no non-space content after cursor.
      try {
        const y = term.buffer.active.cursorY;
        const x = term.buffer.active.cursorX;
        const line = (term.buffer.active.getLine(y) as unknown as {
          translateToString?: (trimRight?: boolean, startCol?: number, endCol?: number) => string;
        } | null);
        const after = line?.translateToString?.(false, x, term.cols) ?? "";
        if (after.trim().length > 0) return;
      } catch {
        return;
      }

      const items: string[] = [];
      for (const cmd of commands) {
        if (cmd.startsWith(prefix)) {
          items.push(cmd);
          if (items.length >= 10) break;
        }
      }

      if (items.length === 0) {
        setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
        return;
      }

      const pos = computePopupPosition(term, items.length);
      if (!pos) return;

      setCandidatesPopup({ open: true, items, left: pos.left, top: pos.top, placement: pos.placement });
    },
    [clearInlineCandidates, commandCandidatesEnabled, computePopupPosition],
  );

  const updateStatus = (next: TerminalSession["status"]) => {
    setStatus(next);
    hasConnectedRef.current = next === "connected";
    onStatusChange?.(sessionId, next);
  };

  useEffect(() => {
    // Reset state when host changes.
    pathCommandsRef.current = null;
    pathCommandsFetchedAtRef.current = null;
    pathCommandsLoadingRef.current = false;
    inlineCandidatesRenderedRef.current = "";

    if (!commandCandidatesEnabled) return;

    const cached = commandCandidatesCache.get(host.id);
    if (cached) {
      // Load even empty caches so TTL prevents refetch spam and users can inspect error fields.
      pathCommandsRef.current = cached.commands ?? [];
      pathCommandsFetchedAtRef.current = cached.fetchedAt;
    }
  }, [commandCandidatesCache, commandCandidatesEnabled, host.id]);

  useEffect(() => {
    if (!commandCandidatesEnabled) {
      clearInlineCandidates();
      setCandidatesPopup((s) => (s.open ? { ...s, open: false, items: [] } : s));
    } else {
      // If user toggles it on, try to render immediately.
      renderInlineCandidates(commandBufferRef.current);
    }
  }, [clearInlineCandidates, commandCandidatesEnabled, renderInlineCandidates]);

  useEffect(() => {
    // Fetch PATH commands once per host (best-effort) after connection.
    if (status !== "connected") return;
    const protocol = host.protocol || "ssh";
    if (protocol !== "ssh") return;
    if (!commandCandidatesEnabled) return;
    if (!terminalBackend.execAvailable()) return;

    const fetchedAt = pathCommandsFetchedAtRef.current;
    const isFresh = fetchedAt != null && Date.now() - fetchedAt < commandCandidatesCacheTtlMs;
    const cachedVersion = commandCandidatesCache.get(host.id)?.version ?? 0;
    // If we already attempted a fetch recently (even if empty), don't refetch until TTL,
    // unless the script version changed (e.g. fixing a remote syntax bug).
    if (isFresh && cachedVersion === COMMAND_CANDIDATES_CACHE_VERSION) return;
    if (pathCommandsLoadingRef.current) return;

    pathCommandsLoadingRef.current = true;
    const fetchOnce = async () => {
      try {
        const resolvedAuth = resolveHostAuth({ host, keys, identities });
        const key = resolvedAuth.key;

        const proxy = host.proxyConfig
          ? {
              type: host.proxyConfig.type,
              host: host.proxyConfig.host,
              port: host.proxyConfig.port,
              username: host.proxyConfig.username,
              password: host.proxyConfig.password,
            }
          : undefined;

        const jumpHosts = resolvedChainHosts.map((jumpHost) => {
          const jumpAuth = resolveHostAuth({ host: jumpHost, keys, identities });
          const jumpKey = jumpAuth.key;
          return {
            hostname: jumpHost.hostname,
            port: jumpHost.port || 22,
            username: jumpAuth.username || "root",
            password: jumpAuth.password,
            privateKey: jumpKey?.privateKey,
            certificate: jumpKey?.certificate,
            passphrase: jumpAuth.passphrase,
            publicKey: jumpKey?.publicKey,
            keyId: jumpAuth.keyId,
            keySource: jumpKey?.source,
            label: jumpHost.label,
          };
        });

        const attemptAt = Date.now();
        const res = await terminalBackend.execCommand({
          hostname: host.hostname,
          username: resolvedAuth.username || "root",
          port: host.port || 22,
          password: resolvedAuth.password,
          privateKey: key?.privateKey,
          certificate: key?.certificate,
          passphrase: resolvedAuth.passphrase,
          proxy,
          jumpHosts: jumpHosts.length ? jumpHosts : undefined,
          command: buildPathCommandsCommand(),
          timeout: 25_000,
        });

        const combined = `${res.stdout || ""}\n${res.stderr || ""}`;
        const commands = parsePathCommandsOutput(combined);
        const stderrSnippet = (res.stderr || "").trim().slice(0, 600);
        const fetchedAtNow = Date.now();
        pathCommandsRef.current = commands;
        pathCommandsFetchedAtRef.current = fetchedAtNow;
        commandCandidatesCache.set(host.id, {
          fetchedAt: fetchedAtNow,
          commands,
          lastAttemptAt: attemptAt,
          error:
            commands.length > 0
              ? undefined
              : stderrSnippet
                ? `empty result (stderr: ${stderrSnippet})`
                : "empty result",
          strategy: "auto",
          shell: undefined,
          version: COMMAND_CANDIDATES_CACHE_VERSION,
        });

        if (commands.length > 0) {
          logger.info("[Terminal] PATH commands fetched", { hostId: host.id, count: commands.length });
        } else {
          logger.warn("[Terminal] PATH commands empty", {
            hostId: host.id,
            os: host.os,
            stderr: stderrSnippet || undefined,
          });
        }
        // Re-render immediately for current input.
        renderInlineCandidates(commandBufferRef.current);
      } catch (err) {
        const fetchedAtNow = Date.now();
        pathCommandsRef.current = [];
        pathCommandsFetchedAtRef.current = fetchedAtNow;
        commandCandidatesCache.set(host.id, {
          fetchedAt: fetchedAtNow,
          commands: [],
          lastAttemptAt: fetchedAtNow,
          error: err instanceof Error ? err.message : String(err),
          strategy: "auto",
          shell: undefined,
          version: COMMAND_CANDIDATES_CACHE_VERSION,
        });
        logger.debug("[Terminal] Failed to fetch PATH commands", err);
      } finally {
        pathCommandsLoadingRef.current = false;
      }
    };

    void fetchOnce();
  }, [
    status,
    host,
    commandCandidatesEnabled,
    commandCandidatesCache,
    commandCandidatesCacheTtlMs,
    keys,
    identities,
    resolvedChainHosts,
    terminalBackend,
    buildPathCommandsCommand,
    parsePathCommandsOutput,
    renderInlineCandidates,
  ]);

  const cleanupSession = () => {
    disposeDataRef.current?.();
    disposeDataRef.current = null;
    disposeExitRef.current?.();
    disposeExitRef.current = null;

    if (sessionRef.current) {
      try {
        terminalBackend.closeSession(sessionRef.current);
      } catch (err) {
        logger.warn("Failed to close SSH session", err);
      }
    }
    sessionRef.current = null;
  };

  const teardown = () => {
    cleanupSession();
    xtermRuntimeRef.current?.dispose();
    xtermRuntimeRef.current = null;
    termRef.current = null;
    fitAddonRef.current = null;
    serializeAddonRef.current = null;
    searchAddonRef.current = null;
  };

  const sessionStarters = createTerminalSessionStarters({
    host,
    keys,
    identities,
    resolvedChainHosts,
    sessionId,
    startupCommand,
    terminalSettings,
    terminalBackend,
    serialConfig,
    sessionRef,
    hasConnectedRef,
    hasRunStartupCommandRef,
    disposeDataRef,
    disposeExitRef,
    fitAddonRef,
    serializeAddonRef,
    highlightProcessorRef,
    pendingAuthRef,
    updateStatus,
    setStatus,
    setError,
    setNeedsAuth: auth.setNeedsAuth,
    setAuthRetryMessage: auth.setAuthRetryMessage,
    setAuthPassword: auth.setAuthPassword,
    setProgressLogs,
    setProgressValue,
    setChainProgress,
    onSessionExit,
    onTerminalDataCapture,
    onOsDetected,
    onCommandExecuted: handleCommandExecuted,
  });
  sessionStartersRef.current = sessionStarters;

  useEffect(() => {
    let disposed = false;
    setError(null);
    hasConnectedRef.current = false;
    setProgressLogs([]);
    setShowLogs(false);
    setIsCancelling(false);

    const boot = async () => {
      try {
        if (disposed || !containerRef.current) return;

        const runtime = createXTermRuntime({
          container: containerRef.current,
          host,
          fontFamilyId,
          fontSize,
          terminalTheme: effectiveTheme,
          terminalSettingsRef,
          terminalBackend,
          sessionRef,
          hotkeySchemeRef,
          keyBindingsRef,
          onHotkeyActionRef,
          isBroadcastEnabledRef,
          onBroadcastInputRef,
          sessionId,
          statusRef,
          onCommandStart: advanceCommandBlockZebra,
          onCommandExecuted: handleCommandExecuted,
          commandBufferRef,
          onCommandBufferChange: (buffer) => {
            // Don't draw before connect; xterm cursor can be unstable.
            if (statusRef.current !== "connected") return;
            renderInlineCandidates(buffer);
          },
          isSensitiveInputRef,
          setIsSearchOpen,
          // Serial-specific options
          serialLocalEcho: serialConfig?.localEcho,
          serialLineMode: serialConfig?.lineMode,
          serialLineBufferRef,
        });

        xtermRuntimeRef.current = runtime;
        termRef.current = runtime.term;
        fitAddonRef.current = runtime.fitAddon;
        serializeAddonRef.current = runtime.serializeAddon;
        searchAddonRef.current = runtime.searchAddon;

        const term = runtime.term;

        if (!llmBannerPrintedRef.current) {
          llmBannerPrintedRef.current = true;
          const enabled = terminalSettingsRef.current?.llmConfig?.enabled;
          term.writeln(
            enabled
              ? "\r\n\x1b[36mAI 助手已启用：输入 #你的问题 回车\x1b[0m\r\n"
              : "\r\n\x1b[90m提示：输入 #你的问题 回车 使用 AI（到 设置 → 终端 → AI 助手 启用/配置）\x1b[0m\r\n",
          );
        }

        if (!llmBannerPrintedRef.current) {
          llmBannerPrintedRef.current = true;
          const enabled = terminalSettingsRef.current?.llmConfig?.enabled;
          term.writeln(
            enabled
              ? "\r\n\x1b[36mAI 助手已启用：输入 #你的问题 回车\x1b[0m\r\n"
              : "\r\n\x1b[90m提示：输入 #你的问题 回车 使用 AI（到 设置 → 终端 → AI 助手 启用/配置）\x1b[0m\r\n",
          );
        } else if (host.protocol === "serial") {
          setStatus("connecting");
          setProgressLogs(["Initializing serial connection..."]);
          await sessionStarters.startSerial(term);
        } else if (host.protocol === "local" || host.hostname === "localhost") {
          setStatus("connecting");
          setProgressLogs(["Initializing local shell..."]);
          await sessionStarters.startLocal(term);
        } else if (host.protocol === "telnet") {
          setStatus("connecting");
          setProgressLogs(["Initializing Telnet connection..."]);
          await sessionStarters.startTelnet(term);
        } else if (host.moshEnabled) {
          setStatus("connecting");
          setProgressLogs(["Initializing Mosh connection..."]);
          await sessionStarters.startMosh(term);
        } else {
          const resolvedAuth = resolveHostAuth({ host, keys, identities });
          const hasPassword = !!resolvedAuth.password;
          const hasKey = !!resolvedAuth.keyId;
          const hasPendingAuth = pendingAuthRef.current;

          if (
            !hasPassword &&
            !hasKey &&
            !hasPendingAuth &&
            !resolvedAuth.username
          ) {
            auth.setNeedsAuth(true);
            setStatus("disconnected");
            return;
          }

          setStatus("connecting");
          setProgressLogs(["Initializing secure channel..."]);
          await sessionStarters.startSSH(term);
        }
      } catch (err) {
        logger.error("Failed to initialize terminal", err);
        setError(err instanceof Error ? err.message : String(err));
        updateStatus("disconnected");
      }
    };

    boot();

    return () => {
      disposed = true;
      if (onTerminalDataCapture && serializeAddonRef.current) {
        try {
          const terminalData = serializeAddonRef.current.serialize();
          logger.info("[Terminal] Capturing data on unmount", { sessionId, dataLength: terminalData.length });
          onTerminalDataCapture(sessionId, terminalData);
        } catch (err) {
          logger.warn("Failed to serialize terminal data on unmount:", err);
        }
      }
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- Effect only runs on host.id/sessionId change, internal functions are stable
  }, [host.id, sessionId]);

  // Connection timeline and timeout visuals
  useEffect(() => {
    if (status !== "connecting" || auth.needsAuth) return;

    // Only show SSH-specific scripted logs for SSH connections
    const isSSH = host.protocol !== "serial" && host.protocol !== "local" && host.protocol !== "telnet" && host.hostname !== "localhost";

    let stepTimer: ReturnType<typeof setInterval> | undefined;
    if (isSSH) {
      const scripted = [
        "Resolving host and keys...",
        "Negotiating ciphers...",
        "Exchanging keys...",
        "Authenticating user...",
        "Waiting for server greeting...",
      ];
      let idx = 0;
      stepTimer = setInterval(() => {
        setProgressLogs((prev) => {
          if (idx >= scripted.length) return prev;
          const next = scripted[idx++];
          return prev.includes(next) ? prev : [...prev, next];
        });
      }, 900);
    }

    setTimeLeft(CONNECTION_TIMEOUT / 1000);
    const countdown = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    const timeout = setTimeout(() => {
      setError("Connection timed out. Please try again.");
      updateStatus("disconnected");
      setProgressLogs((prev) => [...prev, "Connection timed out."]);
    }, CONNECTION_TIMEOUT);

    setProgressValue(5);
    const prog = setInterval(() => {
      setProgressValue((prev) => {
        if (prev >= 95) return prev;
        const remaining = 95 - prev;
        const increment = Math.max(1, remaining * 0.15);
        return Math.min(95, prev + increment);
      });
    }, 200);

    return () => {
      if (stepTimer) clearInterval(stepTimer);
      clearInterval(countdown);
      clearTimeout(timeout);
      clearInterval(prog);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- updateStatus is a stable internal helper
  }, [status, auth.needsAuth, host.protocol, host.hostname]);

  const safeFit = () => {
    const fitAddon = fitAddonRef.current;
    if (!fitAddon) return;

    const runFit = () => {
      try {
        fitAddon.fit();
      } catch (err) {
        logger.warn("Fit failed", err);
      }
    };

    if (
      XTERM_PERFORMANCE_CONFIG.resize.useRAF &&
      typeof requestAnimationFrame === "function"
    ) {
      requestAnimationFrame(runFit);
    } else {
      runFit();
    }
  };

  useEffect(() => {
    if (termRef.current) {
      const effectiveFontSize = host.fontSize || fontSize;
      termRef.current.options.fontSize = effectiveFontSize;

      termRef.current.options.theme = {
        ...effectiveTheme.colors,
        selectionBackground: effectiveTheme.colors.selection,
      };

      if (terminalSettings) {
        termRef.current.options.cursorStyle = terminalSettings.cursorShape;
        termRef.current.options.cursorBlink = terminalSettings.cursorBlink;
        termRef.current.options.scrollback = terminalSettings.scrollback;
        termRef.current.options.fontWeight = terminalSettings.fontWeight as
          | 100
          | 200
          | 300
          | 400
          | 500
          | 600
          | 700
          | 800
          | 900;
        termRef.current.options.fontWeightBold = terminalSettings.fontWeightBold as
          | 100
          | 200
          | 300
          | 400
          | 500
          | 600
          | 700
          | 800
          | 900;
        termRef.current.options.lineHeight = 1 + terminalSettings.linePadding / 10;
        termRef.current.options.drawBoldTextInBrightColors =
          terminalSettings.drawBoldInBrightColors;
        termRef.current.options.minimumContrastRatio =
          terminalSettings.minimumContrastRatio;
        termRef.current.options.scrollOnUserInput = terminalSettings.scrollOnInput;
        termRef.current.options.altClickMovesCursor = !terminalSettings.altAsMeta;
        termRef.current.options.wordSeparator = terminalSettings.wordSeparators;
      }

      setTimeout(() => safeFit(), 50);
    }
  }, [fontSize, effectiveTheme, terminalSettings, host.fontSize]);

  useEffect(() => {
    if (termRef.current) {
      const effectiveFontSize = host.fontSize || fontSize;
      termRef.current.options.fontSize = effectiveFontSize;

      const hostFontId = host.fontFamily || fontFamilyId || "menlo";
      const fontObj = TERMINAL_FONTS.find((f) => f.id === hostFontId) || TERMINAL_FONTS[0];
      termRef.current.options.fontFamily = fontObj.family;

      termRef.current.options.theme = {
        ...effectiveTheme.colors,
        selectionBackground: effectiveTheme.colors.selection,
      };

      setTimeout(() => safeFit(), 50);
    }
  }, [host.fontSize, host.fontFamily, host.theme, fontFamilyId, fontSize, effectiveTheme]);

  useEffect(() => {
    if (isVisible && fitAddonRef.current) {
      const timer = setTimeout(() => safeFit(), 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible]);

  useEffect(() => {
    let cancelled = false;
    const waitForFonts = async () => {
      try {
        const fontFaceSet = document.fonts as FontFaceSet | undefined;
        if (!fontFaceSet?.ready) return;
        await fontFaceSet.ready;
        if (cancelled) return;

        const term = termRef.current as {
          cols: number;
          rows: number;
          renderer?: { remeasureFont?: () => void };
        } | null;
        const fitAddon = fitAddonRef.current;
        try {
          term?.renderer?.remeasureFont?.();
        } catch (err) {
          logger.warn("Font remeasure failed", err);
        }

        try {
          fitAddon?.fit();
        } catch (err) {
          logger.warn("Fit after fonts ready failed", err);
        }

        const id = sessionRef.current;
        if (id && term) {
          try {
            resizeSession(id, term.cols, term.rows);
          } catch (err) {
            logger.warn("Resize session after fonts ready failed", err);
          }
        }
      } catch (err) {
        logger.warn("Waiting for fonts failed", err);
      }
    };

    waitForFonts();
    return () => {
      cancelled = true;
    };
  }, [host.id, sessionId, resizeSession]);

  useEffect(() => {
    if (!containerRef.current || !fitAddonRef.current) return;

    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const observer = new ResizeObserver(() => {
      if (isResizing) return;
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        safeFit();
      }, 250);
    });

    observer.observe(containerRef.current);
    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      observer.disconnect();
    };
  }, [isVisible, isResizing]);

  const prevIsResizingRef = useRef(isResizing);
  useEffect(() => {
    if (prevIsResizingRef.current && !isResizing && isVisible) {
      const timer = setTimeout(() => {
        safeFit();
      }, 100);
      return () => clearTimeout(timer);
    }
    prevIsResizingRef.current = isResizing;
  }, [isResizing, isVisible]);

  useEffect(() => {
    if (!isVisible || !fitAddonRef.current) return;
    const timer = setTimeout(() => {
      safeFit();
    }, 100);
    return () => clearTimeout(timer);
  }, [inWorkspace, isVisible]);

  useEffect(() => {
    const shouldAutoFocus = isVisible && termRef.current && (!inWorkspace || isFocusMode);
    if (shouldAutoFocus) {
      const timer = setTimeout(() => {
        termRef.current?.focus();
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isVisible, inWorkspace, isFocusMode]);

  useEffect(() => {
    if (isFocused && termRef.current && isVisible) {
      const timer = setTimeout(() => {
        termRef.current?.focus();
      }, 10);
      return () => clearTimeout(timer);
    }
  }, [isFocused, isVisible, sessionId]);

  useEffect(() => {
    const term = termRef.current;
    if (!term) return;

    const onSelectionChange = () => {
      const selection = term.getSelection();
      const hasText = !!selection && selection.length > 0;
      setHasSelection(hasText);

      if (hasText && terminalSettings?.copyOnSelect) {
        navigator.clipboard.writeText(selection).catch((err) => {
          logger.warn("Copy on select failed:", err);
        });
      }
    };

    term.onSelectionChange(onSelectionChange);
  }, [terminalSettings?.copyOnSelect]);

  useEffect(() => {
    let resizeTimeout: ReturnType<typeof setTimeout> | null = null;

    const handler = () => {
      if (resizeTimeout) {
        clearTimeout(resizeTimeout);
      }
      resizeTimeout = setTimeout(() => {
        safeFit();
      }, 250);
    };

    window.addEventListener("resize", handler);
    return () => {
      if (resizeTimeout) clearTimeout(resizeTimeout);
      window.removeEventListener("resize", handler);
    };
  }, []);

  const terminalContextActions = useTerminalContextActions({
    termRef,
    sessionRef,
    terminalBackend,
    onHasSelectionChange: setHasSelection,
  });

  const handleSnippetClick = (cmd: string) => {
    if (sessionRef.current) {
      terminalBackend.writeToSession(sessionRef.current, `${cmd}\r`);
      setIsScriptsOpen(false);
      termRef.current?.focus();
      return;
    }
    termRef.current?.writeln("\r\n[No active SSH session]");
  };

  const handleCancelConnect = () => {
    setIsCancelling(true);
    auth.setNeedsAuth(false);
    auth.setAuthRetryMessage(null);
    setNeedsHostKeyVerification(false);
    setPendingHostKeyInfo(null);
    setError("Connection cancelled");
    setProgressLogs((prev) => [...prev, "Cancelled by user."]);
    cleanupSession();
    updateStatus("disconnected");
    setChainProgress(null);
    setTimeout(() => setIsCancelling(false), 600);
    onCloseSession?.(sessionId);
  };

  const handleHostKeyClose = () => {
    setNeedsHostKeyVerification(false);
    setPendingHostKeyInfo(null);
    handleCancelConnect();
  };

  const handleHostKeyContinue = () => {
    setNeedsHostKeyVerification(false);
    if (pendingConnectionRef.current) {
      pendingConnectionRef.current();
      pendingConnectionRef.current = null;
    }
    setPendingHostKeyInfo(null);
  };

  const handleHostKeyAddAndContinue = () => {
    if (pendingHostKeyInfo && onAddKnownHost) {
      const newKnownHost: KnownHost = {
        id: `kh-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        hostname: pendingHostKeyInfo.hostname,
        port: pendingHostKeyInfo.port || host.port || 22,
        keyType: pendingHostKeyInfo.keyType,
        publicKey: pendingHostKeyInfo.fingerprint,
        discoveredAt: Date.now(),
      };
      onAddKnownHost(newKnownHost);
    }
    setNeedsHostKeyVerification(false);
    if (pendingConnectionRef.current) {
      pendingConnectionRef.current();
      pendingConnectionRef.current = null;
    }
    setPendingHostKeyInfo(null);
  };

  const handleRetry = () => {
    if (!termRef.current) return;
    cleanupSession();
    auth.resetForRetry();
    setStatus("connecting");
    setError(null);
    setProgressLogs(["Retrying secure channel..."]);
    setShowLogs(true);
    if (host.protocol === "local" || host.hostname === "localhost") {
      sessionStarters.startLocal(termRef.current);
    } else {
      sessionStarters.startSSH(termRef.current);
    }
  };

  const renderControls = (opts?: { showClose?: boolean }) => (
    <TerminalToolbar
      status={status}
      snippets={snippets}
      host={host}
      defaultThemeId={terminalTheme.id}
      defaultFontFamilyId={fontFamilyId}
      defaultFontSize={fontSize}
      onUpdateTerminalThemeId={onUpdateTerminalThemeId}
      onUpdateTerminalFontFamilyId={onUpdateTerminalFontFamilyId}
      onUpdateTerminalFontSize={onUpdateTerminalFontSize}
      isScriptsOpen={isScriptsOpen}
      setIsScriptsOpen={setIsScriptsOpen}
      onOpenSFTP={() => setShowSFTP((v) => !v)}
      onSnippetClick={handleSnippetClick}
      onUpdateHost={onUpdateHost}
      showClose={opts?.showClose}
      onClose={() => onCloseSession?.(sessionId)}
      isSearchOpen={isSearchOpen}
      onToggleSearch={handleToggleSearch}
    />
  );

  const statusDotTone =
    status === "connected"
      ? "bg-emerald-400"
      : status === "connecting"
        ? "bg-amber-400"
        : "bg-rose-500";
  const _isConnecting = status === "connecting";
  const _hasError = Boolean(error);

  const serverStatusSettings = useMemo(() => {
    const cfg = terminalSettings?.serverStatus;
    return {
      ...DEFAULT_SERVER_STATUS_SETTINGS,
      ...(cfg ?? {}),
    };
  }, [terminalSettings?.serverStatus]);

  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const toolbarLeftRef = useRef<HTMLDivElement | null>(null);
  const toolbarRightRef = useRef<HTMLDivElement | null>(null);
  const [perfLevel, setPerfLevel] = useState<0 | 1 | 2 | 3>(0);

  useEffect(() => {
    if (!isVisible || !isActiveTab || !serverStatus) {
      setPerfLevel(0);
      return;
    }

    const bar = toolbarRef.current;
    const left = toolbarLeftRef.current;
    const right = toolbarRightRef.current;
    if (!bar || !left || !right) {
      setPerfLevel(0);
      return;
    }

    const compute = () => {
      const barW = bar.getBoundingClientRect().width;
      const leftW = left.getBoundingClientRect().width;
      const rightW = right.getBoundingClientRect().width;
      const available = Math.max(0, barW - leftW - rightW - 12);

      // Degrade order: disk -> mem -> cpu
      // Levels: 3=cpu+mem+disk, 2=cpu+mem, 1=cpu, 0=hide
      const next: 0 | 1 | 2 | 3 = available >= 420 ? 3 : available >= 260 ? 2 : available >= 140 ? 1 : 0;
      setPerfLevel(next);
    };

    compute();
    const ro = new ResizeObserver(() => compute());
    ro.observe(bar);
    ro.observe(left);
    ro.observe(right);
    return () => ro.disconnect();
  }, [isVisible, isActiveTab, serverStatus]);

  return (
    <TerminalContextMenu
      hasSelection={hasSelection}
      hotkeyScheme={hotkeyScheme}
      rightClickBehavior={terminalSettings?.rightClickBehavior}
      onCopy={terminalContextActions.onCopy}
      onPaste={terminalContextActions.onPaste}
      onSelectAll={terminalContextActions.onSelectAll}
      onClear={terminalContextActions.onClear}
      onSelectWord={terminalContextActions.onSelectWord}
      onSplitHorizontal={onSplitHorizontal}
      onSplitVertical={onSplitVertical}
      onClose={inWorkspace ? () => onCloseSession?.(sessionId) : undefined}
    >
      <div className="relative h-full w-full flex overflow-hidden bg-gradient-to-br from-[#050910] via-[#06101a] to-[#0b1220]">
        <div className="absolute left-0 right-0 top-0 z-20 pointer-events-none">
          <div
            className="flex items-center gap-1 px-2 py-0.5 backdrop-blur-md pointer-events-auto min-w-0 border-b-[0.5px]"
              ref={toolbarRef}
            style={{
              backgroundColor: effectiveTheme.colors.background,
              color: effectiveTheme.colors.foreground,
              borderColor: `color-mix(in srgb, ${effectiveTheme.colors.foreground} 8%, ${effectiveTheme.colors.background} 92%)`,
              ['--terminal-toolbar-fg' as never]: effectiveTheme.colors.foreground,
              ['--terminal-toolbar-bg' as never]: effectiveTheme.colors.background,
              ['--terminal-toolbar-btn' as never]: `color-mix(in srgb, ${effectiveTheme.colors.background} 88%, ${effectiveTheme.colors.foreground} 12%)`,
              ['--terminal-toolbar-btn-hover' as never]: `color-mix(in srgb, ${effectiveTheme.colors.background} 78%, ${effectiveTheme.colors.foreground} 22%)`,
              ['--terminal-toolbar-btn-active' as never]: `color-mix(in srgb, ${effectiveTheme.colors.background} 68%, ${effectiveTheme.colors.foreground} 32%)`,
            }}
          >
            <div ref={toolbarLeftRef} className="flex items-center gap-1 text-[11px] font-semibold flex-shrink-0">
              <span className="whitespace-nowrap">{host.label}</span>
              <span
                className={cn(
                  "inline-block h-2 w-2 rounded-full flex-shrink-0",
                  statusDotTone,
                )}
              />
            </div>

            {isActiveTab && serverStatus && perfLevel > 0 ? (
              <div className="flex-1 min-w-[150px]">
                <span
                  className="ml-2 text-muted-foreground whitespace-nowrap truncate block"
                  style={{ fontSize: serverStatusSettings.fontSize }}
                >
                  {serverStatus.snapshot?.error && <span>STAT ERR</span>}
                  {!serverStatus.snapshot?.error &&
                    !serverStatus.formatted.cpu &&
                    !serverStatus.formatted.mem &&
                    !serverStatus.formatted.disk && <span>STAT …</span>}
                  {perfLevel >= 1 && serverStatus.formatted.cpu && (
                    <span style={{ color: `hsl(${serverStatusSettings.cpuColor})` }}>
                      CPU {serverStatus.formatted.cpu}
                    </span>
                  )}
                  {perfLevel >= 2 && serverStatus.formatted.mem && (
                    <>
                      <span className="mx-1">·</span>
                      <span style={{ color: `hsl(${serverStatusSettings.memColor})` }}>
                        MEM {serverStatus.formatted.mem}
                      </span>
                    </>
                  )}
                  {perfLevel >= 3 && serverStatus.formatted.disk && (
                    <>
                      <span className="mx-1">·</span>
                      <span style={{ color: `hsl(${serverStatusSettings.diskColor})` }}>
                        {serverStatus.formatted.disk}
                      </span>
                    </>
                  )}
                </span>
              </div>
            ) : (
              <div className="flex-1" />
            )}
            <div ref={toolbarRightRef} className="flex items-center gap-0.5 flex-shrink-0">
              {inWorkspace && onToggleBroadcast && (
                <Button
                  variant="secondary"
                  size="icon"
                  className={cn(
                    "h-6 w-6 p-0 shadow-none border-none text-[color:var(--terminal-toolbar-fg)]",
                    "bg-transparent hover:bg-transparent",
                    isBroadcastEnabled && "text-green-500",
                  )}
                  onClick={onToggleBroadcast}
                  title={
                    isBroadcastEnabled
                      ? t("terminal.toolbar.broadcastDisable")
                      : t("terminal.toolbar.broadcastEnable")
                  }
                  aria-label={
                    isBroadcastEnabled
                      ? t("terminal.toolbar.broadcastDisable")
                      : t("terminal.toolbar.broadcastEnable")
                  }
                >
                  <Radio size={12} />
                </Button>
              )}
              {inWorkspace && !isFocusMode && onExpandToFocus && (
                <Button
                  variant="secondary"
                  size="icon"
                  className="h-6 w-6 p-0 shadow-none border-none text-[color:var(--terminal-toolbar-fg)] bg-transparent hover:bg-transparent"
                  onClick={onExpandToFocus}
                  title={t("terminal.toolbar.focusMode")}
                  aria-label={t("terminal.toolbar.focusMode")}
                >
                  <Maximize2 size={12} />
                </Button>
              )}
              {renderControls({ showClose: inWorkspace })}
            </div>
          </div>
          {isSearchOpen && (
            <div className="pointer-events-auto">
              <TerminalSearchBar
                isOpen={isSearchOpen}
                onClose={handleCloseSearch}
                onSearch={handleSearch}
                onFindNext={handleFindNext}
                onFindPrevious={handleFindPrevious}
                matchCount={searchMatchCount}
              />
            </div>
          )}
        </div>

        <div
          className="h-full flex-1 min-w-0 transition-all duration-300 relative overflow-hidden pt-8"
          style={{ backgroundColor: effectiveTheme.colors.background }}
        >
          <div
            ref={containerRef}
            className="absolute inset-x-0 bottom-0"
            style={{
              top: isSearchOpen ? "64px" : "40px",
              paddingLeft: 6,
              backgroundColor: effectiveTheme.colors.background,
            }}
          />

          {commandCandidatesEnabled && candidatesPopup.open && candidatesPopup.items.length > 0 && (
            <div
              className="absolute z-20 pointer-events-none"
              style={{ left: candidatesPopup.left, top: candidatesPopup.top }}
            >
              <div className="w-[320px] max-w-[70vw] border border-border/60 bg-background text-foreground rounded-md overflow-hidden shadow-sm">
                <div className="max-h-[240px] overflow-hidden">
                  {candidatesPopup.items.map((item, idx) => (
                    <div
                      key={item}
                      className={cn(
                        "px-2 py-1 text-xs font-mono truncate",
                        idx === 0 ? "bg-muted text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {needsHostKeyVerification && pendingHostKeyInfo && (
            <div className="absolute inset-0 z-30 bg-background">
              <KnownHostConfirmDialog
                host={host}
                hostKeyInfo={pendingHostKeyInfo}
                onClose={handleHostKeyClose}
                onContinue={handleHostKeyContinue}
                onAddAndContinue={handleHostKeyAddAndContinue}
              />
            </div>
          )}

          {status !== "connected" && !needsHostKeyVerification && (
            <TerminalConnectionDialog
              host={host}
              status={status}
              error={error}
              progressValue={progressValue}
              chainProgress={chainProgress}
              needsAuth={auth.needsAuth}
              showLogs={showLogs}
              _setShowLogs={setShowLogs}
              keys={keys}
              authProps={{
                authMethod: auth.authMethod,
                setAuthMethod: auth.setAuthMethod,
                authUsername: auth.authUsername,
                setAuthUsername: auth.setAuthUsername,
                authPassword: auth.authPassword,
                setAuthPassword: auth.setAuthPassword,
                authKeyId: auth.authKeyId,
                setAuthKeyId: auth.setAuthKeyId,
                authPassphrase: auth.authPassphrase,
                setAuthPassphrase: auth.setAuthPassphrase,
                showAuthPassphrase: auth.showAuthPassphrase,
                setShowAuthPassphrase: auth.setShowAuthPassphrase,
                showAuthPassword: auth.showAuthPassword,
                setShowAuthPassword: auth.setShowAuthPassword,
                authRetryMessage: auth.authRetryMessage,
                onSubmit: () => auth.submit(),
                onSubmitWithoutSave: () => auth.submit({ saveToHost: false }),
                onCancel: handleCancelConnect,
                isValid: auth.isValid,
              }}
              progressProps={{
                timeLeft,
                isCancelling,
                progressLogs,
                onCancel: handleCancelConnect,
                onRetry: handleRetry,
              }}
            />
          )}
        </div>

        <SFTPModal
          host={host}
          credentials={(() => {
            const resolvedAuth = resolveHostAuth({ host, keys, identities });

            // Build proxy config if present
            const proxyConfig = host.proxyConfig
              ? {
                type: host.proxyConfig.type,
                host: host.proxyConfig.host,
                port: host.proxyConfig.port,
                username: host.proxyConfig.username,
                password: host.proxyConfig.password,
              }
              : undefined;

            // Build jump hosts array if host chain is configured
            let jumpHosts: NetcattyJumpHost[] | undefined;
            if (host.hostChain?.hostIds && host.hostChain.hostIds.length > 0) {
              jumpHosts = host.hostChain.hostIds
                .map((hostId) => allHosts.find((h) => h.id === hostId))
                .filter((h): h is Host => !!h)
                .map((jumpHost) => {
                  const jumpAuth = resolveHostAuth({
                    host: jumpHost,
                    keys,
                    identities,
                  });
                  const jumpKey = jumpAuth.key;
                  return {
                    hostname: jumpHost.hostname,
                    port: jumpHost.port || 22,
                    username: jumpAuth.username || "root",
                    password: jumpAuth.password,
                    privateKey: jumpKey?.privateKey,
                    certificate: jumpKey?.certificate,
                    passphrase: jumpAuth.passphrase || jumpKey?.passphrase,
                    publicKey: jumpKey?.publicKey,
                    keyId: jumpAuth.keyId,
                    keySource: jumpKey?.source,
                    label: jumpHost.label,
                  };
                });
            }

            return {
              username: resolvedAuth.username,
              hostname: host.hostname,
              port: host.port,
              password: resolvedAuth.password,
              privateKey: resolvedAuth.key?.privateKey,
              certificate: resolvedAuth.key?.certificate,
              passphrase: resolvedAuth.passphrase,
              publicKey: resolvedAuth.key?.publicKey,
              keyId: resolvedAuth.keyId,
              keySource: resolvedAuth.key?.source,
              proxy: proxyConfig,
              jumpHosts: jumpHosts && jumpHosts.length > 0 ? jumpHosts : undefined,
            };
          })()}
          open={showSFTP && status === "connected"}
          onClose={() => setShowSFTP(false)}
        />
      </div>
    </TerminalContextMenu>
  );
};

const Terminal = memo(TerminalComponent);
Terminal.displayName = "Terminal";

export default Terminal;
