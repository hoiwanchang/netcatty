export type DiskMountKey = "root" | "home" | "var";

export type ServerStatusMount = {
  mount: string;
  sizeBytes: number;
  usedPercent: number;
  availBytes?: number;
  inodeUsedPercent?: number;
  device?: string;
};

export type ServerStatusSnapshot = {
  cpuCores?: number;
  load1?: number;
  memTotalKb?: number;
  memUsedKb?: number;
  swapTotalKb?: number;
  swapUsedKb?: number;
  disks: Partial<Record<DiskMountKey, { sizeBytes: number; usedPercent: number }>>;
  mounts?: ServerStatusMount[];
  fetchedAt: number;
  error?: string;
};

export const buildServerStatusCommand = (): string => {
  // Keep this POSIX-sh compatible and lightweight.
  // Output is line-based key=value for easy parsing.
  // NOTE: Avoid nested quoting (sh -lc '...') so awk programs can safely use $2.
  return [
    "echo NCSTATv1",
    // Cores: getconf/nproc, then /proc/cpuinfo fallback.
    "cores=$(getconf _NPROCESSORS_ONLN 2>/dev/null || nproc 2>/dev/null || awk '/^processor[[:space:]]*:/ {c++} END{print c+0}' /proc/cpuinfo 2>/dev/null || echo \"\")",
    // Load: /proc/loadavg first field.
    "load=$(awk '{print $1}' /proc/loadavg 2>/dev/null || echo \"\")",
    // Memory from /proc/meminfo (kB).
    "mt=$(awk '/MemTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo \"\")",
    "ma=$(awk '/MemAvailable:/ {print $2}' /proc/meminfo 2>/dev/null || echo \"\")",
    "st=$(awk '/SwapTotal:/ {print $2}' /proc/meminfo 2>/dev/null || echo \"\")",
    "sf=$(awk '/SwapFree:/ {print $2}' /proc/meminfo 2>/dev/null || echo \"\")",
    "mu=\"\"; if [ -n \"$mt\" ] && [ -n \"$ma\" ]; then mu=$((mt-ma)); fi",
    "su=\"\"; if [ -n \"$st\" ] && [ -n \"$sf\" ]; then su=$((st-sf)); fi",
    "echo cpu_cores=$cores",
    "echo load1=$load",
    "echo mem_total_kb=$mt",
    "echo mem_used_kb=$mu",
    "echo swap_total_kb=$st",
    "echo swap_used_kb=$su",
    "for k in root home var; do p=/; [ \"$k\" = \"home\" ] && p=/home; [ \"$k\" = \"var\" ] && p=/var; if df -P -B1 \"$p\" >/dev/null 2>&1; then line=$(df -P -B1 \"$p\" 2>/dev/null | tail -1); size=$(echo \"$line\" | awk '{print $2}'); usep=$(echo \"$line\" | awk '{print $5}' | tr -d '%'); echo disk_${k}=${size},${usep}; else echo disk_${k}=,; fi; done",

    // Auto-detect mounted partitions from /dev/*.
    // Output: mnt_<n>=<mount>,<sizeBytes>,<usedPercent>,<availBytes>,<inodeUsedPercent>,<device>
    "i=0; df -P -B1 2>/dev/null | awk -v OFS='|' 'NR>1 {print $1,$2,$4,$5,$6}' | while IFS='|' read fs size avail usep mnt; do case \"$fs\" in /dev/*) ;; *) continue ;; esac; usep=${usep%?}; il=$(df -P -i \"$mnt\" 2>/dev/null | tail -1 | awk '{print $5}' | tr -d '%'); echo mnt_${i}=${mnt},${size},${usep},${avail},${il},${fs}; i=$((i+1)); done",
  ].join("; ");
};

const parseNumber = (value: string | undefined): number | undefined => {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
};

const parseMountLine = (raw: string | undefined): ServerStatusMount | null => {
  if (!raw) return null;
  const parts = raw.split(",");
  if (parts.length < 3) return null;
  const mount = (parts[0] || "").trim();
  const sizeBytes = parseNumber(parts[1]);
  const usedPercent = parseNumber(parts[2]);
  const availBytes = parseNumber(parts[3]);
  const inodeUsedPercent = parseNumber(parts[4]);
  const device = (parts[5] || parts[4] || "").trim() || undefined;
  if (!mount || sizeBytes === undefined || usedPercent === undefined) return null;
  return { mount, sizeBytes, usedPercent, availBytes, inodeUsedPercent, device };
};

export const parseServerStatusOutput = (output: string): Omit<ServerStatusSnapshot, "fetchedAt"> => {
  const lines = output
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const markerIndex = lines.findIndex((l) => l === "NCSTATv1");
  const dataLines = markerIndex >= 0 ? lines.slice(markerIndex + 1) : lines;

  const kv: Record<string, string> = {};
  for (const line of dataLines) {
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    kv[key] = value;
  }

  const disks: ServerStatusSnapshot["disks"] = {};
  (Object.keys(kv) as string[])
    .filter((k) => k.startsWith("disk_"))
    .forEach((k) => {
      const mount = k.slice("disk_".length) as DiskMountKey;
      const raw = kv[k];
      const [sizeStr, usedPctStr] = (raw || "").split(",");
      const sizeBytes = parseNumber(sizeStr);
      const usedPercent = parseNumber(usedPctStr);
      if (sizeBytes !== undefined && usedPercent !== undefined) {
        disks[mount] = { sizeBytes, usedPercent };
      }
    });

  const mounts: ServerStatusMount[] = [];
  (Object.keys(kv) as string[])
    .filter((k) => k.startsWith("mnt_"))
    .sort((a, b) => {
      const ai = Number(a.slice("mnt_".length));
      const bi = Number(b.slice("mnt_".length));
      if (Number.isFinite(ai) && Number.isFinite(bi)) return ai - bi;
      return a.localeCompare(b);
    })
    .forEach((k) => {
      const m = parseMountLine(kv[k]);
      if (m) mounts.push(m);
    });

  return {
    cpuCores: parseNumber(kv.cpu_cores),
    load1: parseNumber(kv.load1),
    memTotalKb: parseNumber(kv.mem_total_kb),
    memUsedKb: parseNumber(kv.mem_used_kb),
    swapTotalKb: parseNumber(kv.swap_total_kb),
    swapUsedKb: parseNumber(kv.swap_used_kb),
    disks,
    mounts: mounts.length ? mounts : undefined,
  };
};
