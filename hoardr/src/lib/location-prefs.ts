// Saved calendar locations — favorites + recents. Shared by the phone
// LocationPickerSheet and the large-screen CalendarPopover.
//
// localStorage is the fast synchronous read path, but it's per browser — the
// iPhone home-screen app, Safari and the desktop each had their own, so a new
// session on another device showed no favorites. The lists are also synced to
// the account (Supabase auth user_metadata.cal_locations — no table/migration
// needed) and merged back in on load by syncLocationPrefs().

import { createClient } from '@/lib/supabase/client'

const HISTORY_KEY   = 'cal-location-history'
const FAVORITES_KEY = 'cal-location-favorites'
const LEGACY_RECENT = 'cal-recent-location'
const MAX_HISTORY   = 10
const MAX_FAVORITES = 40

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

// ── Account sync ──────────────────────────────────────────────────────────────
let pushTimer: ReturnType<typeof setTimeout> | null = null
function pushToAccount() {
  if (pushTimer) clearTimeout(pushTimer)
  // Debounced: starring a few places in a row is one write
  pushTimer = setTimeout(async () => {
    pushTimer = null
    try {
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return
      await supabase.auth.updateUser({ data: { cal_locations: { favorites: getLocFavorites(), recents: getLocRecents() } } })
    } catch { /* offline — the next change or load retries */ }
  }, 800)
}

/** Union keeping `a`'s order first, then anything only in `b`. */
const merge = (a: string[], b: string[]) => [...a, ...b.filter(x => !a.includes(x))]

let synced = false
/** Pull the account's lists into this device (see the merge rules below). */
export async function syncLocationPrefs(): Promise<void> {
  if (synced || typeof window === 'undefined') return
  synced = true
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) { synced = false; return }
    const remote = (session.user.user_metadata?.cal_locations ?? {}) as { favorites?: string[]; recents?: string[] }
    const localFav = getLocFavorites(), localRec = getLocRecents()
    // Favorites: the account's list is the truth once it exists (a union would
    // resurrect anything removed on another device); a device's local list only
    // seeds the account the first time. Recents just merge by recency.
    const fav = (remote.favorites ? remote.favorites : localFav).slice(0, MAX_FAVORITES)
    const rec = merge(localRec, remote.recents ?? []).slice(0, MAX_HISTORY)
    saveArr(FAVORITES_KEY, fav)
    saveArr(HISTORY_KEY, rec)
    // This device had something the account didn't — send the merged lists up
    const same = (x: string[], y: string[] = []) => x.length === y.length && x.every((v, i) => v === y[i])
    if (!same(fav, remote.favorites) || !same(rec, remote.recents)) pushToAccount()
  } catch { synced = false }
}

/** Toggles `text` in favorites and returns the new list. */
export function toggleLocFavorite(text: string): string[] {
  const t = text.trim()
  if (!t) return getLocFavorites()
  const favs = getLocFavorites()
  const next = favs.includes(t) ? favs.filter(f => f !== t) : [t, ...favs].slice(0, MAX_FAVORITES)
  saveArr(FAVORITES_KEY, next)
  pushToAccount()
  return next
}

/** Moves `text` to the top of recents and returns the new list. */
export function pushLocRecent(text: string): string[] {
  const t = text.trim()
  if (!t) return getLocRecents()
  const next = [t, ...getLocRecents().filter(r => r !== t)].slice(0, MAX_HISTORY)
  saveArr(HISTORY_KEY, next)
  try { localStorage.setItem(LEGACY_RECENT, t) } catch {}
  pushToAccount()
  return next
}
