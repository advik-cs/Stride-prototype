/**
 * STRIDE Offline Date & Freshness Utilities
 *
 * Implements deterministic freshness classification:
 * - Fresh/cached: snapshot age <= 1 hour (3,600,000 ms)
 * - Stale: snapshot age > 1 hour
 *
 * Provides standardized human-readable last-updated indicators.
 */

export const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Deterministically evaluates whether a cached snapshot is stale.
 * A snapshot is fresh if its age is <= 1 hour (or custom TTL), and stale if > 1 hour.
 */
export function isSnapshotStale(timestamp?: string | null, maxAgeMs: number = ONE_HOUR_MS): boolean {
  if (!timestamp) return true;
  const recorded = new Date(timestamp).getTime();
  if (isNaN(recorded)) return true;
  const age = Date.now() - recorded;
  return age > maxAgeMs;
}

/**
 * Formats a timestamp into a standard human-readable time string (e.g. "12:42 PM").
 */
export function formatLocalTime(timestamp?: string | null): string {
  if (!timestamp) return '';
  const d = new Date(timestamp);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });
}

/**
 * Standard last-updated indicator for emergency reference datasets (Shelters, Hospitals, Map).
 *
 * Format examples:
 * - Fresh: "Last updated: 12:42 PM · Cached"
 * - Stale: "Last updated: 12:42 PM · Stale"
 * - Older than today: "Last updated yesterday · Stale" / "Last updated Sep 22 · Stale"
 */
export function formatLastUpdated(
  timestamp?: string | null,
  isStale?: boolean,
  isOfflineOrFallback: boolean | string = true,
  legacyFallbackLabel: string = 'Cached'
): string {
  let isOffline = true;
  let fallbackLabel = legacyFallbackLabel;

  if (typeof isOfflineOrFallback === 'boolean') {
    isOffline = isOfflineOrFallback;
  } else if (typeof isOfflineOrFallback === 'string') {
    isOffline = true;
    fallbackLabel = isOfflineOrFallback;
  }

  if (!timestamp) {
    if (!isOffline) return 'Up to date';
    return isStale ? 'Stale' : fallbackLabel;
  }

  const d = new Date(timestamp);
  if (isNaN(d.getTime())) {
    if (!isOffline) return 'Up to date';
    return isStale ? 'Stale' : fallbackLabel;
  }

  const now = new Date();
  const timeStr = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', hour12: true });

  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();

  // Online representation: "Last updated: 12:42 PM" (or "Last updated: Sep 22, 12:42 PM")
  if (!isOffline) {
    if (isToday) {
      return `Last updated: ${timeStr}`;
    }
    if (isYesterday) {
      return `Last updated yesterday, ${timeStr}`;
    }
    const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    return `Last updated: ${dateStr}, ${timeStr}`;
  }

  // Offline representation: includes · Cached or · Stale
  const statusLabel = isStale ? 'Stale' : 'Cached';

  if (isToday) {
    return `Last updated: ${timeStr} · ${statusLabel}`;
  }
  if (isYesterday) {
    return `Last updated yesterday · ${statusLabel}`;
  }

  const dateStr = d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  return `Last updated: ${dateStr}, ${timeStr} · ${statusLabel}`;
}

/**
 * Formats weather-specific telemetry snapshot banner.
 * Example: "Saved Telemetry · Cached · 12:43 PM" / "Saved Telemetry · Stale · 12:43 PM"
 */
export function formatWeatherTelemetryLabel(
  timestamp?: string | null,
  isStale?: boolean
): string {
  const statusLabel = isStale ? 'Stale' : 'Cached';
  const timeStr = formatLocalTime(timestamp);
  if (timeStr) {
    return `Saved Telemetry · ${statusLabel} · ${timeStr}`;
  }
  return `Saved Telemetry · ${statusLabel}`;
}
