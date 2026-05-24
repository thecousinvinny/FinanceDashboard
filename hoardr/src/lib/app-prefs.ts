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

export function getAppPrefs(): AppPrefs { return read() }

export function setAppPrefs(patch: Partial<AppPrefs>): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(KEY, JSON.stringify({ ...read(), ...patch }))
}
