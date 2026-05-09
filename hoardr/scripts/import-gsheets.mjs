#!/usr/bin/env node
/**
 * Import Google Sheets CSV exports into Supabase.
 *
 * Before running, add to hoardr/.env.local:
 *   SUPABASE_SERVICE_ROLE_KEY=<service_role key from Supabase → Settings → API>
 *   IMPORT_USER_ID=<your UUID from Supabase → Authentication → Users>
 *
 * Then run from inside hoardr/:
 *   node scripts/import-gsheets.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dir = dirname(fileURLToPath(import.meta.url))

// ── Load .env.local ──────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env }
  try {
    for (const line of readFileSync(join(__dir, '..', '.env.local'), 'utf-8').split('\n')) {
      const eq = line.indexOf('=')
      if (eq > 0) env[line.slice(0, eq).trim()] = line.slice(eq + 1).trim()
    }
  } catch { /* no .env.local */ }
  return env
}

const env = loadEnv()
const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_KEY  = env.SUPABASE_SERVICE_ROLE_KEY
const USER_ID      = env.IMPORT_USER_ID

if (!SUPABASE_URL || !SERVICE_KEY || !USER_ID) {
  console.error(`
Missing required env vars. Add to hoardr/.env.local:

  SUPABASE_SERVICE_ROLE_KEY=<service_role key>   ← Supabase dashboard → Settings → API
  IMPORT_USER_ID=<your user UUID>                ← Supabase dashboard → Authentication → Users

Then re-run: node scripts/import-gsheets.mjs
`)
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const CSV_DIR = join(__dir, '..', '..', 'GoogleSheets')

// ── CSV parser ───────────────────────────────────────────────────────────────
function parseCsv(filename) {
  const raw = readFileSync(join(CSV_DIR, `FINANCE DATA - ${filename}.csv`), 'utf-8')
  const lines = raw.trim().split('\n')
  const headers = splitLine(lines[0])
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitLine(line)
    return Object.fromEntries(headers.map((h, i) => [h.trim(), (vals[i] ?? '').trim()]))
  })
}

function splitLine(line) {
  const out = []; let cur = '', inQ = false
  for (const ch of line) {
    if (ch === '"') inQ = !inQ
    else if (ch === ',' && !inQ) { out.push(cur); cur = '' }
    else cur += ch
  }
  out.push(cur)
  return out
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDate(s) {
  if (!s?.trim()) return null
  const [m, d, y] = s.trim().split('/')
  if (!m || !d || !y) return null
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

function toNum(s) {
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}

async function wipe(table) {
  const { error } = await supabase.from(table).delete().eq('user_id', USER_ID)
  if (error) console.warn(`  ⚠ wipe ${table}: ${error.message}`)
}

async function insert(table, rows, label) {
  if (!rows.length) { console.log(`  – 0 ${label}`); return }
  const CHUNK = 200
  let n = 0
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase.from(table).insert(rows.slice(i, i + CHUNK))
    if (error) {
      console.error(`  ✗ ${label} (batch ${i}–${i + CHUNK}): ${error.message}`)
      throw error
    }
    n += Math.min(CHUNK, rows.length - i)
  }
  console.log(`  ✓ ${n} ${label}`)
}

// ── Import ────────────────────────────────────────────────────────────────────
const VALID_BILLING = new Set(['Monthly', 'Annual', 'Weekly', 'BiWeekly', 'Quarterly'])

async function main() {
  console.log(`\n── Hoardr Import ─────────────────────────────`)
  console.log(`   User: ${USER_ID}\n`)

  // 1. Categories
  console.log('1/7  Categories')
  await wipe('categories')
  const cats = parseCsv('Categories')
  await insert('categories', cats.map(c => ({ user_id: USER_ID, name: c.Name })), 'categories')
  const { data: catRows } = await supabase.from('categories').select('id, name').eq('user_id', USER_ID)
  const catMap = Object.fromEntries((catRows ?? []).map(c => [c.name, c.id]))

  // 2. Banks
  console.log('2/7  Banks')
  await wipe('banks')
  const banks = parseCsv('Banks')
  await insert('banks', banks.map(b => ({
    user_id: USER_ID, name: b.Name, type: b.Type || null, last4: b.Last4 || null,
  })), 'banks')
  const { data: bankRows } = await supabase.from('banks').select('id, name').eq('user_id', USER_ID)
  const bankMap = Object.fromEntries((bankRows ?? []).map(b => [b.name, b.id]))

  // 3. Cards  (expenses reference cards by alias, e.g. "A.S 1008")
  console.log('3/7  Cards')
  await wipe('cards')
  const cards = parseCsv('Cards')
  await insert('cards', cards.map(c => ({
    user_id:    USER_ID,
    name:       c.Name,
    alias:      c.Alias    || null,
    type:       c.Type     || null,   // Credit / Debit
    last4:      c.Last4    || null,
    bank_id:    bankMap[c.Bank] ?? null,
    is_default: c.Default?.toLowerCase() === 'yes',
    // network / expires / cardholder / style → fill via Wallet UI after import
  })), 'cards')
  const { data: cardRows } = await supabase.from('cards').select('id, name, alias').eq('user_id', USER_ID)
  const byAlias = Object.fromEntries((cardRows ?? []).filter(c => c.alias).map(c => [c.alias, c.id]))
  const byName  = Object.fromEntries((cardRows ?? []).map(c => [c.name, c.id]))
  const card    = v => v ? (byAlias[v] ?? byName[v] ?? null) : null

  // 4. Expenses
  console.log('4/7  Expenses')
  await wipe('expenses')
  const expenses = parseCsv('Expenses')
  await insert('expenses', expenses.map(e => ({
    user_id:       USER_ID,
    name:          e.Name,
    cost:          toNum(e.Cost)  ?? 0,
    original_cost: toNum(e.OCost),          // maps to savings generated column
    date:          toDate(e.Date),
    category_id:   catMap[e.Category] ?? null,
    card_id:       card(e.Card),
    status:        e.Status || 'Procured',
  })), 'expenses')

  // 5. Income  (Master sheet rows where Type = Income)
  console.log('5/7  Income')
  await wipe('income')
  const master  = parseCsv('Master')
  const incRows = master.filter(r => r.Type === 'Income')
  await insert('income', incRows.map(r => ({
    user_id: USER_ID,
    name:    r.Name,
    amount:  toNum(r.Cost) ?? 0,
    date:    toDate(r.Date),
    source:  r.Category || 'Other',   // Master.Source is always "Income" for income rows; Category has the real value
    bank_id: bankMap[r.Bank] ?? null,
  })), 'income rows')

  // 6. Subscriptions
  console.log('6/7  Subscriptions')
  await wipe('subscriptions')
  const subs = parseCsv('Subscriptions')
  await insert('subscriptions', subs.map(s => ({
    user_id:      USER_ID,
    name:         s.Name,
    billing:      VALID_BILLING.has(s.Billing) ? s.Billing : 'Monthly',  // Cancelled → Monthly fallback
    cost:         toNum(s.Cost)        ?? 0,
    monthly_cost: toNum(s.MonthlyCost) ?? 0,
    annual_cost:  toNum(s.AnnualCost)  ?? 0,
    next_renewal: toDate(s.NextRenewal) || null,
    status:       s.Status || 'Active',
    card_id:      card(s.Card),
  })), 'subscriptions')

  // 7. Wishlist
  console.log('7/7  Wishlist')
  await wipe('wishlist')
  const wish = parseCsv('Wishlist')
  await insert('wishlist', wish.map(w => ({
    user_id:       USER_ID,
    name:          w.Name,
    original_cost: toNum(w.OCost),
    bought_cost:   toNum(w.BCost),
    category:      w.Category || null,
    url:           w.Link     || null,
    status:        w.Status === 'Bought' ? 'Purchased' : (w.Status || 'Interested'),
  })), 'wishlist items')

  console.log('\n✅  Import complete!\n')
  console.log('Next steps:')
  console.log('  • Open Wallet → add network/expires/cardholder/style to each card')
  console.log('  • Check Plans → confirm subscription statuses look right')
  console.log('  • Home page will now show your real data\n')
}

main().catch(e => {
  console.error('\n✗ Import failed:', e.message)
  process.exit(1)
})
