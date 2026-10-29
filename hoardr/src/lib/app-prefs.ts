import { createClient } from '@/lib/supabase/client'

const KEY = 'hoardr-app-prefs'

export interface AppPrefs {
  defaultBankId:   string | null
  defaultBankName: string | null
  defaultExpCat:   string | null
  defaultBilling:  string
}

function base(): AppPrefs {
  return { defaultBankId: null, defaultBankName: null, defaultExpCat: null, defaultBilling: 'Monthly' }
}

function read(): AppPrefs {
  if (typeof window === 'undefined') return base()
  try { return { ...base(), ...JSON.parse(localStorage.getItem(KEY) ?? '{}') } }
  catch { return base() }
}

function write(p: AppPrefs) {
  try { localStorage.setItem(KEY, JSON.stringify(p)) } catch {}
}

export function getAppPrefs(): AppPrefs { return read() }

/**
 * Saves locally and to `profiles.app_prefs` so every device shares the same
 * defaults. localStorage stays the synchronous read path; the profile is the
 * source of truth that `syncAppPrefs()` pulls down on load.
 */
export function setAppPrefs(patch: Partial<AppPrefs>): void {
  if (typeof window === 'undefined') return
  const next = { ...read(), ...patch }
  write(next)
  void (async () => {
    const supabase = createClient()
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return
    // Fails harmlessly until the app_prefs migration is applied
    await supabase.from('profiles').update({ app_prefs: next }).eq('id', session.user.id)
  })()
}

let synced = false
/** Pull the profile's prefs into localStorage once per app load. */
export async function syncAppPrefs(): Promise<void> {
  if (synced || typeof window === 'undefined') return
  synced = true
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) { synced = false; return }
  const { data, error } = await supabase.from('profiles').select('app_prefs').eq('id', session.user.id).maybeSingle()
  if (error || !data) return
  const remote = data.app_prefs as Partial<AppPrefs> | null
  if (remote && Object.keys(remote).length > 0) {
    write({ ...base(), ...remote })
  } else {
    // First device to sync seeds the profile with what it already has
    const local = read()
    if (local.defaultBankId || local.defaultExpCat || local.defaultBilling !== 'Monthly') setAppPrefs(local)
  }
}

/**
 * The bank a new income entry should start on: the saved default if it still
 * exists, else the first bank. A stale id (bank deleted, or set on another
 * device before syncing) must not leave the picker on nothing.
 */
export function resolveDefaultBankId(banks: Array<{ id: string }>): string | null {
  const def = read().defaultBankId
  if (def && banks.some(b => b.id === def)) return def
  return banks[0]?.id ?? null
}
