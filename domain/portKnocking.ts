export type PortKnockingSettings = {
  ports: number[];
  timeoutMs: number;
  delayMs: number;
  waitAfterMs: number;
};

export const DEFAULT_PORT_KNOCKING_SETTINGS: PortKnockingSettings = {
  ports: [],
  timeoutMs: 800,
  delayMs: 200,
  waitAfterMs: 300,
};

const clampInt = (value: unknown, def: number, min: number, max: number) => {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return def;
  const v = Math.trunc(n);
  return Math.max(min, Math.min(max, v));
};

const normalizePorts = (value: unknown): number[] => {
  if (!Array.isArray(value)) return [];
  const out: number[] = [];
  for (const p of value) {
    const n = typeof p === "number" ? p : Number(p);
    if (!Number.isFinite(n)) continue;
    const port = Math.trunc(n);
    if (port < 1 || port > 65535) continue;
    out.push(port);
  }
  return out.slice(0, 20);
};

export const normalizePortKnockingSettings = (raw: unknown): PortKnockingSettings => {
  const base = DEFAULT_PORT_KNOCKING_SETTINGS;
  if (!raw || typeof raw !== "object") return base;
  const obj = raw as Record<string, unknown>;
  return {
    ports: normalizePorts(obj.ports),
    timeoutMs: clampInt(obj.timeoutMs, base.timeoutMs, 100, 10_000),
    delayMs: clampInt(obj.delayMs, base.delayMs, 0, 10_000),
    waitAfterMs: clampInt(obj.waitAfterMs, base.waitAfterMs, 0, 30_000),
  };
};

export const parsePortSequenceText = (text: string): number[] => {
  const cleaned = (text ?? "").trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/[\s,]+/).filter(Boolean);
  const ports: number[] = [];
  for (const part of parts) {
    const n = Number(part);
    if (!Number.isFinite(n)) continue;
    const port = Math.trunc(n);
    if (port < 1 || port > 65535) continue;
    ports.push(port);
  }
  return ports.slice(0, 20);
};

export const formatPortSequenceText = (ports: number[]): string => {
  return (ports ?? []).join(",");
};
