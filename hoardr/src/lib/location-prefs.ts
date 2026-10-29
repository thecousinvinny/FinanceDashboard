// Saved calendar locations — favorites + recents in localStorage. Shared by the
// phone LocationPickerSheet and the large-screen CalendarPopover so a location
// starred on one surface shows up on the other.

const HISTORY_KEY   = 'cal-location-history'
const FAVORITES_KEY = 'cal-location-favorites'
const LEGACY_RECENT = 'cal-recent-location'
const MAX_HISTORY   = 10

function loadArr(key: string): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === 'string') : []
  } catch { return [] }
}
function saveArr(key: string, arr: string[]) {
  try { localStorage.setItem(key, JSON.stringify(arr)) } catch {}
}

export function getLocFavorites(): string[] { return loadArr(FAVORITES_KEY) }

export function getLocRecents(): string[] {
  const list = loadArr(HISTORY_KEY)
  // Older builds only kept a single most-recent entry
  if (list.length === 0) {
    try { const legacy = localStorage.getItem(LEGACY_RECENT); if (legacy) return [legacy] } catch {}
  }
  return list
}

/** Toggles `text` in favorites and returns the new list. */
export function toggleLocFavorite(text: string): string[] {
  const t = text.trim()
  if (!t) return getLocFavorites()
  const favs = getLocFavorites()
  const next = favs.includes(t) ? favs.filter(f => f !== t) : [t, ...favs]
  saveArr(FAVORITES_KEY, next)
  return next
}

/** Moves `text` to the top of recents and returns the new list. */
export function pushLocRecent(text: string): string[] {
  const t = text.trim()
  if (!t) return getLocRecents()
  const next = [t, ...getLocRecents().filter(r => r !== t)].slice(0, MAX_HISTORY)
  saveArr(HISTORY_KEY, next)
  try { localStorage.setItem(LEGACY_RECENT, t) } catch {}
  return next
}
