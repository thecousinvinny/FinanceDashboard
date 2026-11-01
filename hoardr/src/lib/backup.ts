import { createClient } from '@/lib/supabase/client'
import { localToday } from '@/lib/utils'

/**
 * Settings → Your data. Everything is read with the signed-in user's own
 * session (RLS scopes every table to them) and saved straight to the device —
 * nothing goes anywhere else.
 */
const TABLES = [
  'expenses', 'income', 'subscriptions', 'wishlist', 'categories',
  'banks', 'cards', 'transfers', 'revenue_streams', 'cal_events', 'commissions',
] as const


const PAGE = 1000   // PostgREST's default row cap per request

async function allRows(supabase: ReturnType<typeof createClient>, table: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from(table).select('*').order('id').range(from, from + PAGE - 1)
    if (error) throw new Error(`${table}: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < PAGE) return out
  }
}

/** Hand a file to the user: the share sheet on iPhone (Save to Files), a download elsewhere. */
async function saveFile(name: string, type: string, text: string) {
  const file = new File([text], name, { type })
  const nav = navigator as Navigator & { canShare?: (d: { files: File[] }) => boolean }
  // A home-screen app on iPhone can't trigger a normal download reliably
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|iPod/.test(navigator.userAgent)) {
    try { await nav.share({ files: [file], title: name }); return } catch (e) {
      if ((e as Error).name === 'AbortError') return   // the user closed the sheet
    }
  }
  const url = URL.createObjectURL(file)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** A complete JSON backup of every table, for safekeeping or moving elsewhere. */
export async function downloadBackup(): Promise<{ rows: number }> {
  const supabase = createClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) throw new Error('Not signed in')
  const tables: Record<string, Record<string, unknown>[]> = {}
  await Promise.all(TABLES.map(async t => { tables[t] = await allRows(supabase, t) }))
  const { data: profileRow } = await supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()
  // Never the Google refresh token: a backup file sitting in Downloads must
  // not grant access to the calendar
  const { google_refresh_token: _secret, ...profile } = (profileRow ?? {}) as Record<string, unknown>
  void _secret
  const rows = Object.values(tables).reduce((n, r) => n + r.length, 0)
  const backup = {
    app: 'hoardr',
    format: 1,
    exportedAt: new Date().toISOString(),
    account: { id: session.user.id, email: session.user.email },
    profile,
    counts: Object.fromEntries(Object.entries(tables).map(([t, r]) => [t, r.length])),
    tables,
  }
  await saveFile(`hoardr-backup-${localToday()}.json`, 'application/json', JSON.stringify(backup, null, 2))
  return { rows }
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v)
  // Quote when needed; a leading = + - @ would run as a formula in a spreadsheet
  const safe = /^[=+\-@]/.test(s) ? `'${s}` : s
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** Every expense and income row as one spreadsheet, newest first. */
export async function downloadTransactionsCsv(): Promise<{ rows: number }> {
  const supabase = createClient()
  const [exp, inc, cats, cards, banks] = await Promise.all([
    allRows(supabase, 'expenses'), allRows(supabase, 'income'),
    allRows(supabase, 'categories'), allRows(supabase, 'cards'), allRows(supabase, 'banks'),
  ])
  const name = (list: Record<string, unknown>[]) => new Map(list.map(r => [r.id as string, r.name as string]))
  const catName = name(cats), cardName = name(cards), bankName = name(banks)
  type Line = { date: string; type: string; name: string; category: string; amount: number; original: unknown; account: string; note: unknown }
  const lines: Line[] = [
    ...exp.map(e => ({
      date: e.date as string, type: 'Expense', name: e.name as string,
      category: catName.get(e.category_id as string) ?? '', amount: -Number(e.cost),
      original: e.original_cost, account: cardName.get(e.card_id as string) ?? '', note: e.description,
    })),
    ...inc.map(i => ({
      date: i.date as string, type: 'Income', name: i.name as string,
      category: (i.source as string) ?? '', amount: Number(i.amount),
      original: null, account: bankName.get(i.bank_id as string) ?? '', note: i.description,
    })),
  ].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  const header = ['Date', 'Type', 'Name', 'Category', 'Amount', 'Original price', 'Card / bank', 'Note']
  const body = lines.map(l => [l.date, l.type, l.name, l.category, l.amount.toFixed(2), l.original ?? '', l.account, l.note ?? ''].map(csvCell).join(','))
  await saveFile(`hoardr-transactions-${localToday()}.csv`, 'text/csv', [header.join(','), ...body].join('\n'))
  return { rows: lines.length }
}
