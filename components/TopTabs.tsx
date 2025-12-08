import React, { useState, useEffect, useRef } from 'react';
import { TerminalSquare, Shield, Folder, LayoutGrid, Plus, Bell, User, Sun, Moon, X, Minus, Square, Copy } from 'lucide-react';
import { TerminalSession, Workspace } from '../types';
import { Button } from './ui/button';
import { cn } from '../lib/utils';
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from './ui/context-menu';

interface TopTabsProps {
  theme: 'dark' | 'light';
  isVaultActive: boolean;
  isSftpActive: boolean;
  activeTabId: string;
  sessions: TerminalSession[];
  orphanSessions: TerminalSession[];
  workspaces: Workspace[];
  orderedTabs: string[];
  draggingSessionId: string | null;
  isMacClient: boolean;
  onSelectTab: (id: string) => void;
  onCloseSession: (sessionId: string, e?: React.MouseEvent) => void;
  onRenameWorkspace: (workspaceId: string) => void;
  onCloseWorkspace: (workspaceId: string) => void;
  onOpenQuickSwitcher: () => void;
  onToggleTheme: () => void;
  onStartSessionDrag: (sessionId: string) => void;
  onEndSessionDrag: () => void;
  onReorderTabs: (draggedId: string, targetId: string, position: 'before' | 'after') => void;
}

const sessionStatusDot = (status: TerminalSession['status']) => {
  const tone = status === 'connected'
    ? "bg-emerald-400"
    : status === 'connecting'
      ? "bg-amber-400"
      : "bg-rose-500";
  return <span className={cn("inline-block h-2 w-2 rounded-full shadow-[0_0_0_2px_rgba(0,0,0,0.35)]", tone)} />;
};

// Custom window controls for Windows/Linux (frameless window)
const WindowControls: React.FC = () => {
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    // Check initial maximized state
    window.nebula?.windowIsMaximized?.().then(setIsMaximized);

    // Listen for window resize to update maximized state
    const handleResize = () => {
      window.nebula?.windowIsMaximized?.().then(setIsMaximized);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleMinimize = () => {
    window.nebula?.windowMinimize?.();
  };

  const handleMaximize = async () => {
    const result = await window.nebula?.windowMaximize?.();
    setIsMaximized(result ?? false);
  };

  const handleClose = () => {
    window.nebula?.windowClose?.();
  };

  return (
    <div className="flex items-center app-no-drag">
      <button
        onClick={handleMinimize}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all duration-150"
        title="Minimize"
      >
        <Minus size={16} />
      </button>
      <button
        onClick={handleMaximize}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-foreground/10 hover:text-foreground transition-all duration-150"
        title={isMaximized ? "Restore" : "Maximize"}
      >
        {isMaximized ? (
          // Restore icon (two overlapping squares)
          <Copy size={14} />
        ) : (
          // Maximize icon (single square)
          <Square size={14} />
        )}
      </button>
      <button
        onClick={handleClose}
        className="h-10 w-12 flex items-center justify-center text-muted-foreground hover:bg-red-500 hover:text-white transition-all duration-150"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
};

export const TopTabs: React.FC<TopTabsProps> = ({
  theme,
  isVaultActive,
  isSftpActive,
  activeTabId,
  sessions,
  orphanSessions,
  workspaces,
  orderedTabs,
  draggingSessionId,
  isMacClient,
  onSelectTab,
  onCloseSession,
  onRenameWorkspace,
  onCloseWorkspace,
  onOpenQuickSwitcher,
  onToggleTheme,
  onStartSessionDrag,
  onEndSessionDrag,
  onReorderTabs,
}) => {
  // Tab reorder drag state
  const [dropIndicator, setDropIndicator] = useState<{ tabId: string; position: 'before' | 'after' } | null>(null);
  const [isDraggingForReorder, setIsDraggingForReorder] = useState(false);
  const draggedTabIdRef = useRef<string | null>(null);

  const handleTabDragStart = (e: React.DragEvent, tabId: string) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('tab-reorder-id', tabId);
    // Also set session-id for backward compatibility with workspace split functionality
    // Only orphan sessions can be dragged to create workspaces
    const isOrphanSession = orphanSessions.some(s => s.id === tabId);
    if (isOrphanSession) {
      e.dataTransfer.setData('session-id', tabId);
    }
    draggedTabIdRef.current = tabId;
    // Use setTimeout to allow the drag image to be captured before we change styles
    setTimeout(() => {
      setIsDraggingForReorder(true);
    }, 0);
    onStartSessionDrag(tabId);
  };

  const handleTabDragEnd = () => {
    draggedTabIdRef.current = null;
    setDropIndicator(null);
    setIsDraggingForReorder(false);
    onEndSessionDrag();
  };

  const handleTabDragOver = (e: React.DragEvent, tabId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';

    if (!draggedTabIdRef.current || draggedTabIdRef.current === tabId) {
      return;
    }

    // Determine if we're on the left or right half of the target tab
    const rect = e.currentTarget.getBoundingClientRect();
    const midpoint = rect.left + rect.width / 2;
    const position: 'before' | 'after' = e.clientX < midpoint ? 'before' : 'after';

    setDropIndicator({ tabId, position });
  };

  const handleTabDragLeave = (e: React.DragEvent) => {
    // Only clear if we're leaving the tab entirely (not moving to a child element)
    const relatedTarget = e.relatedTarget as HTMLElement | null;
    if (!e.currentTarget.contains(relatedTarget)) {
      setDropIndicator(null);
    }
  };

  const handleTabDrop = (e: React.DragEvent, targetTabId: string) => {
    e.preventDefault();
    const draggedId = e.dataTransfer.getData('tab-reorder-id') || draggedTabIdRef.current;

    if (draggedId && draggedId !== targetTabId && dropIndicator) {
      onReorderTabs(draggedId, targetTabId, dropIndicator.position);
    }

    setDropIndicator(null);
    setIsDraggingForReorder(false);
  };

  // Calculate shift direction for each tab based on drop indicator
  const getTabShiftStyle = (tabId: string): React.CSSProperties => {
    if (!dropIndicator || !isDraggingForReorder || !draggedTabIdRef.current) {
      return {};
    }

    const draggedIndex = orderedTabs.indexOf(draggedTabIdRef.current);
    const currentIndex = orderedTabs.indexOf(tabId);
    const targetIndex = orderedTabs.indexOf(dropIndicator.tabId);

    // Don't shift the dragged tab itself
    if (tabId === draggedTabIdRef.current) {
      return {};
    }

    // Calculate the effective drop position
    const dropIndex = dropIndicator.position === 'before' ? targetIndex : targetIndex + 1;

    // Determine if this tab needs to shift
    if (draggedIndex < dropIndex) {
      // Dragging forward: tabs between dragged and drop position shift left
      if (currentIndex > draggedIndex && currentIndex < dropIndex) {
        return { transform: 'translateX(-8px)' };
      }
    } else {
      // Dragging backward: tabs between drop position and dragged shift right
      if (currentIndex >= dropIndex && currentIndex < draggedIndex) {
        return { transform: 'translateX(8px)' };
      }
    }

    return {};
  };

  // Build ordered tab items
  const renderOrderedTabs = () => {
    return orderedTabs.map((tabId) => {
      const session = orphanSessions.find(s => s.id === tabId);
      const workspace = workspaces.find(w => w.id === tabId);

      if (session) {
        const isBeingDragged = draggingSessionId === session.id;
        const shiftStyle = getTabShiftStyle(session.id);
        const showDropIndicatorBefore = dropIndicator?.tabId === session.id && dropIndicator.position === 'before';
        const showDropIndicatorAfter = dropIndicator?.tabId === session.id && dropIndicator.position === 'after';

        return (
          <div
            key={session.id}
            onClick={() => onSelectTab(session.id)}
            draggable
            onDragStart={(e) => handleTabDragStart(e, session.id)}
            onDragEnd={handleTabDragEnd}
            onDragOver={(e) => handleTabDragOver(e, session.id)}
            onDragLeave={handleTabDragLeave}
            onDrop={(e) => handleTabDrop(e, session.id)}
            className={cn(
              "relative h-8 pl-3 pr-2 min-w-[140px] max-w-[240px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
              "transition-all duration-200 ease-out",
              activeTabId === session.id ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
              isBeingDragged && isDraggingForReorder ? "opacity-40 scale-95" : ""
            )}
            style={shiftStyle}
          >
            {/* Drop indicator line - before */}
            {showDropIndicatorBefore && isDraggingForReorder && (
              <div className="absolute -left-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
            )}
            {/* Drop indicator line - after */}
            {showDropIndicatorAfter && isDraggingForReorder && (
              <div className="absolute -right-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
            )}
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <TerminalSquare size={14} className={cn("shrink-0", activeTabId === session.id ? "text-primary" : "text-muted-foreground")} />
              <span className="truncate">{session.hostLabel}</span>
              <div className="flex-shrink-0">{sessionStatusDot(session.status)}</div>
            </div>
            <button
              onClick={(e) => onCloseSession(session.id, e)}
              className="p-1 rounded-full hover:bg-destructive/10 hover:text-destructive transition-colors"
              aria-label="Close session"
            >
              <X size={12} />
            </button>
          </div>
        );
      }

      if (workspace) {
        const paneCount = sessions.filter(s => s.workspaceId === workspace.id).length;
        const isActive = activeTabId === workspace.id;
        const isBeingDragged = draggingSessionId === workspace.id;
        const shiftStyle = getTabShiftStyle(workspace.id);
        const showDropIndicatorBefore = dropIndicator?.tabId === workspace.id && dropIndicator.position === 'before';
        const showDropIndicatorAfter = dropIndicator?.tabId === workspace.id && dropIndicator.position === 'after';

        return (
          <ContextMenu key={workspace.id}>
            <ContextMenuTrigger asChild>
              <div
                onClick={() => onSelectTab(workspace.id)}
                draggable
                onDragStart={(e) => handleTabDragStart(e, workspace.id)}
                onDragEnd={handleTabDragEnd}
                onDragOver={(e) => handleTabDragOver(e, workspace.id)}
                onDragLeave={handleTabDragLeave}
                onDrop={(e) => handleTabDrop(e, workspace.id)}
                className={cn(
                  "relative h-8 pl-3 pr-2 min-w-[150px] max-w-[260px] rounded-md border text-xs font-semibold cursor-pointer flex items-center justify-between gap-2 app-no-drag",
                  "transition-all duration-200 ease-out",
                  isActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground",
                  isBeingDragged && isDraggingForReorder ? "opacity-40 scale-95" : ""
                )}
                style={shiftStyle}
              >
                {/* Drop indicator line - before */}
                {showDropIndicatorBefore && isDraggingForReorder && (
                  <div className="absolute -left-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}
                {/* Drop indicator line - after */}
                {showDropIndicatorAfter && isDraggingForReorder && (
                  <div className="absolute -right-1.5 top-1 bottom-1 w-0.5 bg-primary rounded-full shadow-[0_0_8px_2px] shadow-primary/50 animate-pulse" />
                )}
                <div className="flex items-center gap-2 truncate">
                  <LayoutGrid size={14} className={cn("shrink-0", isActive ? "text-primary" : "text-muted-foreground")} />
                  <span className="truncate">{workspace.title}</span>
                </div>
                <div className="text-[10px] px-2 py-1 rounded-full border border-border/70 bg-background/60 min-w-[28px] text-center">
                  {paneCount}
                </div>
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem onClick={() => onRenameWorkspace(workspace.id)}>
                Rename
              </ContextMenuItem>
              <ContextMenuItem className="text-destructive" onClick={() => onCloseWorkspace(workspace.id)}>
                Close
              </ContextMenuItem>
            </ContextMenuContent>
          </ContextMenu>
        );
      }

      return null;
    });
  };

  return (
    <div className="w-full bg-secondary/90 border-b border-border/60 backdrop-blur app-drag">
      <div
        className="h-10 px-3 flex items-center gap-2"
        style={{ paddingLeft: isMacClient ? 76 : 12 }}
      >
        <div
          onClick={() => onSelectTab('vault')}
          className={cn(
            "h-8 px-3 rounded-md border text-xs font-semibold cursor-pointer flex items-center gap-2 app-no-drag",
            isVaultActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
        >
          <Shield size={14} /> Vaults
        </div>
        <div
          onClick={() => onSelectTab('sftp')}
          className={cn(
            "h-8 px-3 rounded-md border text-xs font-semibold cursor-pointer flex items-center gap-2 app-no-drag",
            isSftpActive ? "bg-primary/20 border-primary/60 text-foreground" : "border-border/60 text-muted-foreground hover:border-primary/40 hover:text-foreground"
          )}
        >
          <Folder size={14} /> SFTP
        </div>
        {renderOrderedTabs()}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 app-no-drag"
          onClick={onOpenQuickSwitcher}
          title="Open quick switcher"
        >
          <Plus size={14} />
        </Button>
        <div className="ml-auto flex items-center gap-2 app-no-drag">
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <Bell size={16} />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground">
            <User size={16} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
            onClick={onToggleTheme}
            title="Toggle theme"
          >
            {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
          </Button>
        </div>
        {/* Custom window controls for Windows/Linux */}
        {!isMacClient && <WindowControls />}
      </div>
    </div>
  );
};

