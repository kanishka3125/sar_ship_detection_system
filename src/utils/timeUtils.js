/**
 * ZENITH — Time Utilities
 * All UTC ISO timestamps are converted to local time for display.
 */

/**
 * Format a UTC ISO timestamp string to local date-time.
 * @param {string} ts  ISO 8601 string e.g. "2025-01-15T08:32:00Z"
 * @returns {string}   e.g. "15 Jan 2025 · 14:02 IST"
 */
export function formatLocalTime(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return ts
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}

/**
 * Format a UTC ISO timestamp to HH:MM local.
 * @param {string} ts
 * @returns {string} e.g. "14:02"
 */
export function formatLocalHHMM(ts) {
  if (!ts) return '—'
  const d = new Date(ts)
  if (isNaN(d)) return ts
  return d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false })
}

/**
 * Human-readable "time ago" relative to now, from a UTC ISO timestamp.
 */
export function timeAgo(ts) {
  if (!ts) return '—'
  const diff = Math.round((Date.now() - new Date(ts)) / 1000)
  if (diff < 0) return 'just now'
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return `${Math.floor(diff / 86400)}d ago`
}

/**
 * Format the current Date object as local time string for the Navbar clock.
 */
export function formatNavbarTime(d) {
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  })
}

/**
 * Validate that lat/lng are within legal bounds.
 * Returns { lat, lng } clamped if out of range, plus a boolean `valid`.
 */
export function validateCoords(lat, lng) {
  const validLat = typeof lat === 'number' && lat >= -90 && lat <= 90
  const validLng = typeof lng === 'number' && lng >= -180 && lng <= 180
  return {
    lat: validLat ? lat : Math.max(-90, Math.min(90, lat || 0)),
    lng: validLng ? lng : Math.max(-180, Math.min(180, lng || 0)),
    valid: validLat && validLng,
  }
}
