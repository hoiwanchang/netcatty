import { useEffect, useMemo, useRef, useState } from "react";
import type { Host, Identity, SSHKey, TerminalSession } from "../../types";
import type { TerminalSettings } from "../../domain/models";
import { resolveHostAuth } from "../../domain/sshAuth";
import { buildServerStatusCommand, parseServerStatusOutput, type ServerStatusSnapshot } from "../../domain/serverStatus";
import { useTerminalBackend } from "./useTerminalBackend";

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const clampPollInterval = (ms: number): number => {
  if (!Number.isFinite(ms)) return DEFAULT_POLL_INTERVAL_MS;
  return Math.max(5_000, Math.min(10 * 60_000, Math.round(ms)));
};

const kbToGb = (kb: number): number => kb / 1024 / 1024;

export type ActiveSessionServerStatus = {
  sessionId: string;
  snapshot: ServerStatusSnapshot;
  formatted: {
    cpu?: string;
    mem?: string;
    disk?: string;
  };
};

export const useActiveSessionServerStatus = (args: {
  activeTabId: string;
  sessions: TerminalSession[];
  hosts: Host[];
  keys: SSHKey[];
  identities: Identity[];
  terminalSettings?: TerminalSettings;
}): ActiveSessionServerStatus | null => {
  const { activeTabId, sessions, hosts, keys, identities, terminalSettings } = args;
  const terminalBackend = useTerminalBackend();

  const pollIntervalMs = useMemo(
    () => clampPollInterval(terminalSettings?.serverStatus?.refreshIntervalMs ?? DEFAULT_POLL_INTERVAL_MS),
    [terminalSettings?.serverStatus?.refreshIntervalMs],
  );

  const activeSession = useMemo(() => {
    if (!activeTabId) return null;
    return sessions.find((s) => s.id === activeTabId) || null;
  }, [activeTabId, sessions]);

  const host = useMemo(() => {
    if (!activeSession) return null;
    return hosts.find((h) => h.id === activeSession.hostId) || null;
  }, [activeSession, hosts]);

  const [state, setState] = useState<ActiveSessionServerStatus | null>(null);
  const runningRef = useRef(false);
  const lastSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    // Reset when switching away from a session tab.
    if (!activeSession || !host) {
      setState(null);
      lastSessionIdRef.current = null;
      return;
    }

    // Only SSH sessions get stats.
    const protocol = activeSession.protocol || host.protocol || "ssh";
    if (protocol !== "ssh") {
      setState(null);
      lastSessionIdRef.current = null;
      return;
    }

    // If session changes, clear immediately.
    if (lastSessionIdRef.current !== activeSession.id) {
      setState(null);
      lastSessionIdRef.current = activeSession.id;
    }

    if (!terminalBackend.execAvailable()) {
      setState({
        sessionId: activeSession.id,
        snapshot: { disks: {}, fetchedAt: Date.now(), error: "execCommand unavailable" },
        formatted: {},
      });
      return;
    }

    const resolvedChainHosts =
      (host.hostChain?.hostIds
        ?.map((id) => hosts.find((h) => h.id === id))
        .filter(Boolean) as Host[]) || [];

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

    const resolvedAuth = resolveHostAuth({ host, keys, identities });
    const key = resolvedAuth.key;

    const buildFormatted = (snapshot: ServerStatusSnapshot): ActiveSessionServerStatus["formatted"] => {
      const cpu =
        snapshot.cpuCores !== undefined && snapshot.load1 !== undefined
          ? `${snapshot.load1.toFixed(1)}/${snapshot.cpuCores}`
          : snapshot.cpuCores !== undefined
            ? `0.0/${snapshot.cpuCores}`
            : undefined;

      const memMain =
        snapshot.memTotalKb !== undefined && snapshot.memUsedKb !== undefined
          ? `${kbToGb(snapshot.memUsedKb).toFixed(1)}/${kbToGb(snapshot.memTotalKb).toFixed(1)}G`
          : undefined;
      const swap =
        snapshot.swapTotalKb !== undefined && snapshot.swapUsedKb !== undefined && snapshot.swapTotalKb > 0
          ? `SWP ${kbToGb(snapshot.swapUsedKb).toFixed(1)}/${kbToGb(snapshot.swapTotalKb).toFixed(1)}G`
          : undefined;
      const mem = memMain ? (swap ? `${memMain} ${swap}` : memMain) : undefined;

      const formatMountLabel = (mount: string): string => {
        if (mount === "/") return "/";
        if (mount === "/home") return "h";
        if (mount === "/var") return "v";
        const parts = mount.split("/").filter(Boolean);
        const last = parts[parts.length - 1] || mount;
        return last.length > 8 ? `${last.slice(0, 7)}…` : last;
      };

      const formatDiskPart = (label: string, sizeBytes: number, usedPercent: number): string => {
        const g = sizeBytes / 1024 / 1024 / 1024;
        return `${label}:${g.toFixed(0)}G ${usedPercent.toFixed(0)}%`;
      };

      const formatDiskPartDetailed = (
        label: string,
        usedPercent: number,
        freeBytes?: number,
        inodeUsedPercent?: number,
      ): string => {
        const used = usedPercent.toFixed(0);
        const freeG = freeBytes !== undefined ? Math.max(0, Math.round(freeBytes / 1024 / 1024 / 1024)) : undefined;
        const inode = inodeUsedPercent !== undefined ? inodeUsedPercent.toFixed(0) : undefined;
        const extras: string[] = [];
        if (freeG !== undefined) extras.push(`${freeG}G free`);
        if (inode !== undefined) extras.push(`iUsed ${inode}%`);
        return extras.length ? `${label}:${used}% (${extras.join(", ")})` : `${label}:${used}%`;
      };

      const diskParts: string[] = [];

      const mounts = snapshot.mounts;
      if (mounts && mounts.length) {
        const byMount = new Map(mounts.map((m) => [m.mount, m] as const));
        const root = byMount.get("/");
        const home = byMount.get("/home");
        const varM = byMount.get("/var");

        const picked: typeof mounts = [];
        const seenDevices = new Set<string>();

        const pick = (m: (typeof mounts)[number] | undefined) => {
          if (!m) return;
          const deviceKey = m.device || "";
          // Dedupe obvious same-device mounts (e.g. /, /home, /var on same partition)
          if (deviceKey && seenDevices.has(deviceKey)) return;
          picked.push(m);
          if (deviceKey) seenDevices.add(deviceKey);
        };

        // Prefer root, then home/var if different device.
        pick(root);
        pick(home);
        pick(varM);

        // Fill remaining with other /dev/* mounts.
        const usedMounts = new Set(picked.map((m) => m.mount));
        const others = mounts
          .filter((m) => !usedMounts.has(m.mount))
          .sort((a, b) => {
            if (b.usedPercent !== a.usedPercent) return b.usedPercent - a.usedPercent;
            return b.sizeBytes - a.sizeBytes;
          });

        for (const m of others) {
          pick(m);
        }

        for (const m of picked) {
          diskParts.push(
            formatDiskPartDetailed(
              formatMountLabel(m.mount),
              m.usedPercent,
              m.availBytes,
              m.inodeUsedPercent,
            ),
          );
        }
      } else {
        // Legacy fallback
        const d = snapshot.disks || {};
        if (d.root) diskParts.push(formatDiskPart("/", d.root.sizeBytes, d.root.usedPercent));
        if (d.home) diskParts.push(formatDiskPart("h", d.home.sizeBytes, d.home.usedPercent));
        if (d.var) diskParts.push(formatDiskPart("v", d.var.sizeBytes, d.var.usedPercent));
      }

      return {
        cpu,
        mem,
        disk: diskParts.length ? diskParts.join(" ") : undefined,
      };
    };

    const fetchOnce = async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const cmd = buildServerStatusCommand();
        const res = await terminalBackend.execCommand({
          hostname: activeSession.hostname || host.hostname,
          username: activeSession.username || resolvedAuth.username || "root",
          port: activeSession.port || host.port || 22,
          password: resolvedAuth.password,
          privateKey: key?.privateKey,
          certificate: key?.certificate,
          passphrase: resolvedAuth.passphrase,
          proxy,
          jumpHosts: jumpHosts.length ? jumpHosts : undefined,
          command: cmd,
          timeout: 12_000,
        });

        const combined = `${res.stdout || ""}\n${res.stderr || ""}`;
        const parsed = parseServerStatusOutput(combined);
        const snapshot: ServerStatusSnapshot = {
          ...parsed,
          disks: parsed.disks || {},
          fetchedAt: Date.now(),
        };

        setState({
          sessionId: activeSession.id,
          snapshot,
          formatted: buildFormatted(snapshot),
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : "Unknown error";
        setState({
          sessionId: activeSession.id,
          snapshot: { disks: {}, fetchedAt: Date.now(), error: message },
          formatted: {},
        });
      } finally {
        runningRef.current = false;
      }
    };

    void fetchOnce();
    const timer = window.setInterval(() => {
      void fetchOnce();
    }, pollIntervalMs);

    return () => {
      window.clearInterval(timer);
      runningRef.current = false;
    };
  }, [activeSession, host, hosts, keys, identities, terminalBackend, pollIntervalMs]);

  return state;
};
