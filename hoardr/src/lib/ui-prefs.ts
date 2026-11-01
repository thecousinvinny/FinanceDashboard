import { createClient } from '@/lib/supabase/client'

/**
 * Appearance and personal settings that used to live only in one browser's
 * localStorage, mirrored to `profiles.ui_prefs` so every device matches.
 * localStorage stays the synchronous read path (the theme is applied by an
 * inline <head> script before React runs); the profile is the source of truth
 * that `syncUiPrefs()` pulls down once per load.
 *
 * Writers keep writing localStorage as before and then call `pushUiPrefs()`.
 * Screens that read a key at mount listen for `ui-prefs-synced` to re-read it.
 */
const KEYS = [
  'theme',                    // lib/theme.ts
  'sem-colors',               // lib/semantic-colors.ts
  'week-start-monday',        // lib/week-start.ts
  'hoard-goal',               // components/home/HoardChest.tsx
  'cal-hidden-google-cals',   // calendar sidebar visibility
] as const

type UiPrefs = Partial<Record<(typeof KEYS)[number], string>>

export const UI_PREFS_SYNCED = 'ui-prefs-synced'

function readLocal(): UiPrefs {
  const out: UiPrefs = {}
  try {
    for (const k of KEYS) { const v = localStorage.getItem(k); if (v !== null) out[k] = v }
  } catch {}
  return out
}

const same = (a: UiPrefs, b: UiPrefs) =>
  KEYS.every(k => (a[k] ?? null) === (b[k] ?? null))

// What the profile holds, as far as this device knows. Pushes before the
// first pull are dropped: a screen writing its stale local value on mount
// must never overwrite what another device saved.
let remote: UiPrefs | null = null
let pushTimer: ReturnType<typeof setTimeout> | undefined

/** Save this device's settings to the profile (debounced; no-op when unchanged). */
export function pushUiPrefs() {
  if (typeof window === 'undefined' || remote === null) return
  clearTimeout(pushTimer)
  pushTimer = setTimeout(async () => {
    const local = readLocal()
    if (remote && same(local, remote)) return
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { error } = await supabase.from('profiles').update({ ui_prefs: local }).eq('id', session.user.id)
    if (!error) remote = local
  }, 600)
}

let syncing = false
/**
 * Pull the profile's settings into this device once per app load and apply
 * the live ones (theme, accent colors). The first device to sync seeds the
 * profile with what it already has.
 */
export async function syncUiPrefs(apply: (changed: string[]) => void): Promise<void> {
  if (syncing || remote !== null || typeof window === 'undefined') return
  syncing = true
  try {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    const { data, error } = await supabase.from('profiles').select('ui_prefs').eq('id', session.user.id).maybeSingle()
    if (error || !data) return
    const fromProfile = (data.ui_prefs ?? {}) as UiPrefs
    if (Object.keys(fromProfile).length === 0) {
      remote = {}
      pushUiPrefs()
      return
    }
    const local = readLocal()
    const changed = KEYS.filter(k => fromProfile[k] !== undefined && fromProfile[k] !== local[k])
    try { for (const k of changed) localStorage.setItem(k, fromProfile[k]!) } catch {}
    remote = { ...local, ...fromProfile }
    if (changed.length) {
      apply(changed)
      window.dispatchEvent(new CustomEvent(UI_PREFS_SYNCED, { detail: changed }))
    }
  } finally {
    syncing = false
  }
}
