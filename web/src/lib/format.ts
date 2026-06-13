/**
 * Formatting helpers for durations, timestamps, and text.
 */

/**
 * Format a number of seconds into a human-readable duration.
 * e.g. 135 → "2m 15s", 3661 → "1h 1m 1s", 0 → "0s"
 */
export function formatDuration(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;

  if (h > 0) return `${h}h ${m}m ${sec}s`;
  if (m > 0) return `${m}m ${sec}s`;
  return `${sec}s`;
}

/**
 * Format an ISO timestamp to a short time string, e.g. "14:32".
 */
export function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
}

/**
 * Format an ISO timestamp relative to now, e.g. "3 min ago", "just now".
 */
export function formatRelative(iso: string): string {
  const diff = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (diff < 10) return 'just now';
  if (diff < 60) return `${diff}s ago`;
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

/**
 * Format an ISO timestamp to a readable date + time, e.g. "Jun 12, 14:32".
 */
export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const month = d.toLocaleString('en', { month: 'short' });
  const day = d.getDate();
  const time = formatTime(iso);
  return `${month} ${day}, ${time}`;
}

/**
 * Truncate a string to a maximum length, adding "…" if truncated.
 */
export function truncate(str: string, max: number): string {
  if (str.length <= max) return str;
  return str.slice(0, max - 1) + '…';
}

/**
 * Format bytes to a human-readable size, e.g. 1024 → "1.0 KB".
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const val = bytes / Math.pow(k, i);
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${sizes[i]!}`;
}

/**
 * Get initials from a display name, e.g. "Riya Sharma" → "RS".
 */
export function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

/**
 * Compute a live duration from a start ISO string to now (in seconds).
 */
export function liveDurationSeconds(startIso: string): number {
  return Math.max(0, Math.floor((Date.now() - new Date(startIso).getTime()) / 1000));
}
