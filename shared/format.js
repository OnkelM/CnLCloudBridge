const KB = 1024;
const MB = KB * 1024;
const GB = MB * 1024;
const TB = GB * 1024;

export function formatBytes(n) {
  if (n == null || isNaN(n)) return "—";
  const v = Number(n);
  if (v < 0) return "—";
  if (v < KB) return `${v} B`;
  if (v < MB) return `${(v / KB).toFixed(1)} KB`;
  if (v < GB) return `${(v / MB).toFixed(1)} MB`;
  if (v < TB) return `${(v / GB).toFixed(2)} GB`;
  return `${(v / TB).toFixed(2)} TB`;
}

export function formatSpeed(bps) {
  if (bps == null || isNaN(bps)) return "—";
  const v = Number(bps);
  if (v <= 0) return "0 B/s";
  if (v < KB) return `${v} B/s`;
  if (v < MB) return `${(v / KB).toFixed(1)} KB/s`;
  if (v < GB) return `${(v / MB).toFixed(2)} MB/s`;
  return `${(v / GB).toFixed(2)} GB/s`;
}
