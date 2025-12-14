import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebglAddon } from "@xterm/addon-webgl";
import "@xterm/xterm/css/xterm.css";
import { ChevronDown, FileText, Minus, Plus, X } from "lucide-react";
import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "../lib/utils";
import { ConnectionLog, TerminalTheme } from "../types";
import { TERMINAL_THEMES } from "../infrastructure/config/terminalThemes";
import { Button } from "./ui/button";
import { Dropdown, DropdownContent, DropdownTrigger } from "./ui/dropdown";

interface LogViewProps {
    log: ConnectionLog;
    defaultTerminalTheme: TerminalTheme;
    defaultFontSize: number;
    isVisible: boolean;
    onClose: () => void;
    onUpdateLog: (logId: string, updates: Partial<ConnectionLog>) => void;
}

const LogViewComponent: React.FC<LogViewProps> = ({
    log,
    defaultTerminalTheme,
    defaultFontSize,
    isVisible,
    onClose,
    onUpdateLog,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const termRef = useRef<XTerm | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);
    const [isReady, setIsReady] = useState(false);
    const [themeDropdownOpen, setThemeDropdownOpen] = useState(false);

    // Use log's saved theme/fontSize or fall back to defaults
    const currentTheme = useMemo(() => {
        if (log.themeId) {
            return TERMINAL_THEMES.find(t => t.id === log.themeId) || defaultTerminalTheme;
        }
        return defaultTerminalTheme;
    }, [log.themeId, defaultTerminalTheme]);

    const currentFontSize = log.fontSize ?? defaultFontSize;

    // Format date for display
    const formattedDate = useMemo(() => {
        const date = new Date(log.startTime);
        return date.toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
        });
    }, [log.startTime]);

    // Handle theme change
    const handleThemeChange = useCallback((themeId: string) => {
        onUpdateLog(log.id, { themeId });
        setThemeDropdownOpen(false);
    }, [log.id, onUpdateLog]);

    // Handle font size change
    const handleFontSizeChange = useCallback((delta: number) => {
        const newSize = Math.max(8, Math.min(24, currentFontSize + delta));
        onUpdateLog(log.id, { fontSize: newSize });
    }, [log.id, currentFontSize, onUpdateLog]);

    // Initialize terminal
    useEffect(() => {
        if (!containerRef.current || !isVisible) return;

        // Create terminal
        const term = new XTerm({
            fontFamily: '"JetBrains Mono", "SF Mono", Monaco, Menlo, monospace',
            fontSize: currentFontSize,
            cursorBlink: false,
            cursorStyle: "underline",
            allowProposedApi: true,
            disableStdin: true, // Read-only mode
            theme: currentTheme.colors,
            scrollback: 10000,
        });

        termRef.current = term;

        // Create fit addon
        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);
        fitAddonRef.current = fitAddon;

        // Open terminal
        term.open(containerRef.current);

        // Try to load WebGL addon for better performance
        try {
            const webglAddon = new WebglAddon();
            term.loadAddon(webglAddon);
        } catch {
            // WebGL not available, canvas renderer will be used
        }

        // Fit terminal
        setTimeout(() => {
            try {
                fitAddon.fit();
            } catch {
                // Ignore fit errors
            }
        }, 50);

        // Write terminal data if available
        if (log.terminalData) {
            term.write(log.terminalData);
        } else {
            // No terminal data available
            term.writeln("\x1b[2m--- No terminal data captured for this session ---\x1b[0m");
            term.writeln("");
            term.writeln(`\x1b[36mHost:\x1b[0m ${log.hostname}`);
            term.writeln(`\x1b[36mUser:\x1b[0m ${log.username}`);
            term.writeln(`\x1b[36mProtocol:\x1b[0m ${log.protocol}`);
            term.writeln(`\x1b[36mTime:\x1b[0m ${formattedDate}`);
            if (log.endTime) {
                const duration = Math.round((log.endTime - log.startTime) / 1000);
                const minutes = Math.floor(duration / 60);
                const seconds = duration % 60;
                term.writeln(`\x1b[36mDuration:\x1b[0m ${minutes}m ${seconds}s`);
            }
        }

        setIsReady(true);

        // Cleanup
        return () => {
            term.dispose();
            termRef.current = null;
            fitAddonRef.current = null;
            setIsReady(false);
        };
        // Only re-create terminal when visibility or terminalData changes
        // Theme and font size updates are handled separately
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVisible, log.id, log.terminalData]);

    // Update theme instantly without recreating terminal
    useEffect(() => {
        if (termRef.current && isReady) {
            termRef.current.options.theme = currentTheme.colors;
        }
    }, [currentTheme, isReady]);

    // Update font size instantly without recreating terminal
    useEffect(() => {
        if (termRef.current && isReady) {
            termRef.current.options.fontSize = currentFontSize;
            // Refit after font size change
            setTimeout(() => {
                try {
                    fitAddonRef.current?.fit();
                } catch {
                    // Ignore fit errors
                }
            }, 10);
        }
    }, [currentFontSize, isReady]);

    // Handle resize
    useEffect(() => {
        if (!isVisible || !fitAddonRef.current) return;

        const handleResize = () => {
            if (fitAddonRef.current) {
                try {
                    fitAddonRef.current.fit();
                } catch {
                    // Ignore fit errors
                }
            }
        };

        const resizeObserver = new ResizeObserver(handleResize);
        if (containerRef.current?.parentElement) {
            resizeObserver.observe(containerRef.current.parentElement);
        }

        return () => {
            resizeObserver.disconnect();
        };
    }, [isVisible]);

    const isLocal = log.protocol === "local" || log.hostname === "localhost";

    return (
        <div className="h-full w-full flex flex-col bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border/50 bg-secondary/30 shrink-0">
                <div className="flex items-center gap-3">
                    <div
                        className={cn(
                            "h-8 w-8 rounded-lg flex items-center justify-center",
                            isLocal
                                ? "bg-emerald-500/10 text-emerald-500"
                                : "bg-blue-500/10 text-blue-500"
                        )}
                    >
                        <FileText size={16} />
                    </div>
                    <div>
                        <div className="text-sm font-medium">
                            {isLocal ? "Local Terminal" : log.hostname}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            {formattedDate} • {log.localUsername}@{log.localHostname}
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Theme selector */}
                    <Dropdown open={themeDropdownOpen} onOpenChange={setThemeDropdownOpen}>
                        <DropdownTrigger asChild>
                            <Button variant="ghost" size="sm" className="gap-1 h-8 px-2">
                                <div
                                    className="w-4 h-4 rounded border border-border/50"
                                    style={{ backgroundColor: currentTheme.colors.background }}
                                />
                                <span className="text-xs max-w-20 truncate">{currentTheme.name}</span>
                                <ChevronDown size={12} />
                            </Button>
                        </DropdownTrigger>
                        <DropdownContent className="w-48 max-h-64 overflow-y-auto" align="end">
                            {TERMINAL_THEMES.map(theme => (
                                <button
                                    key={theme.id}
                                    className={cn(
                                        "w-full flex items-center gap-2 px-2 py-1.5 text-left text-sm rounded hover:bg-secondary/80 transition-colors",
                                        currentTheme.id === theme.id && "bg-secondary"
                                    )}
                                    onClick={() => handleThemeChange(theme.id)}
                                >
                                    <div
                                        className="w-5 h-5 rounded border border-border/50 flex-shrink-0"
                                        style={{ backgroundColor: theme.colors.background }}
                                    />
                                    <span className="truncate">{theme.name}</span>
                                </button>
                            ))}
                        </DropdownContent>
                    </Dropdown>

                    {/* Font size controls */}
                    <div className="flex items-center gap-0.5 bg-secondary/50 rounded px-1">
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleFontSizeChange(-1)}
                            disabled={currentFontSize <= 8}
                        >
                            <Minus size={12} />
                        </Button>
                        <span className="text-xs w-6 text-center">{currentFontSize}</span>
                        <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => handleFontSizeChange(1)}
                            disabled={currentFontSize >= 24}
                        >
                            <Plus size={12} />
                        </Button>
                    </div>

                    <span className="text-xs text-muted-foreground bg-secondary px-2 py-1 rounded">
                        Read-only
                    </span>
                    <Button variant="ghost" size="sm" onClick={onClose}>
                        <X size={16} />
                    </Button>
                </div>
            </div>

            {/* Terminal container */}
            <div
                className="flex-1 overflow-hidden p-2"
                style={{ backgroundColor: currentTheme?.colors?.background || '#000000' }}
            >
                <div ref={containerRef} className="h-full w-full" />
            </div>
        </div>
    );
};

// Memoization comparison
const logViewAreEqual = (prev: LogViewProps, next: LogViewProps): boolean => {
    return (
        prev.log.id === next.log.id &&
        prev.log.themeId === next.log.themeId &&
        prev.log.fontSize === next.log.fontSize &&
        prev.isVisible === next.isVisible &&
        prev.defaultFontSize === next.defaultFontSize &&
        prev.defaultTerminalTheme.id === next.defaultTerminalTheme.id
    );
};

export default memo(LogViewComponent, logViewAreEqual);
