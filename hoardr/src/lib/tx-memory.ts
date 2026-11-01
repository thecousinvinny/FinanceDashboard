'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import type { SeedTx } from '@/lib/data/transactions'

/** What the add sheet remembers about a merchant (or income source) you've used. */
export interface KnownName {
  name:     string          // casing from the latest use
  count:    number
  category: string | null   // from the latest use
  accountId: string | null  // card (expense) or bank (income), latest use
  amount:   number          // latest amount
}

export interface TxMemory {
  names:     Map<string, KnownName>   // lowercased name → latest use
  catCounts: Record<string, number>   // category → uses in the last 180 days
}

interface Memory { Expense: TxMemory; Income: TxMemory }

const EMPTY = (): TxMemory => ({ names: new Map(), catCounts: {} })
const STALE_MS = 5 * 60_000

let memory: Memory = { Expense: EMPTY(), Income: EMPTY() }
let loadedAt = 0
let inflight: Promise<void> | null = null
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

const key = (s: string) => s.trim().toLowerCase()

function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

type Row = { name: string | null; amount: number; category: string | null; accountId: string | null; date: string }

function build(rows: Row[]): TxMemory {
  // rows arrive newest first, so the first sighting of a name is its latest use
  const m = EMPTY()
  const recent = daysAgo(180)
  for (const r of rows) {
    if (r.category && r.date >= recent) m.catCounts[r.category] = (m.catCounts[r.category] ?? 0) + 1
    if (!r.name?.trim()) continue
    const k = key(r.name)
    const hit = m.names.get(k)
    if (hit) hit.count++
    else m.names.set(k, { name: r.name.trim(), count: 1, category: r.category, accountId: r.accountId, amount: r.amount })
  }
  return m
}

async function load() {
  const supabase = createClient()
  const since = daysAgo(540)
  const [exp, inc] = await Promise.all([
    supabase.from('expenses').select('name, cost, card_id, date, categories(name)')
      .gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(3000),
    supabase.from('income').select('name, amount, bank_id, source, date')
      .gte('date', since).order('date', { ascending: false }).order('created_at', { ascending: false }).limit(2000),
  ])
  if (exp.error || inc.error) return
  memory = {
    Expense: build((exp.data ?? []).map(e => ({
      name: e.name, amount: Number(e.cost) || 0, date: e.date, accountId: e.card_id,
      category: (e.categories as unknown as { name: string } | null)?.name ?? null,
    }))),
    Income: build((inc.data ?? []).map(i => ({
      name: i.name, amount: Number(i.amount) || 0, date: i.date, accountId: i.bank_id, category: i.source,
    }))),
  }
  loadedAt = Date.now()
  emit()
}

function refresh() {
  if (inflight || Date.now() - loadedAt < STALE_MS) return
  inflight = load().catch(() => {}).finally(() => { inflight = null })
}

/** Record a just-added transaction so the next sheet suggests it without a reload. */
export function rememberTx(tx: SeedTx) {
  const m = memory[tx.type]
  const k = key(tx.name)
  const hit = m.names.get(k)
  const accountId = (tx.type === 'Expense' ? tx.card_id : tx.bank_id) ?? null
  m.names.set(k, { name: tx.name.trim(), count: (hit?.count ?? 0) + 1, category: tx.category, accountId, amount: tx.amount })
  m.catCounts[tx.category] = (m.catCounts[tx.category] ?? 0) + 1
  emit()
}

/** Names matching what's typed: prefix matches first, then by how often you use them. */
export function suggestNames(m: TxMemory, typed: string, limit = 4): KnownName[] {
  const q = key(typed)
  if (!q) return []
  const out: { n: KnownName; rank: number }[] = []
  for (const [k, n] of m.names) {
    if (k === q) continue
    const at = k.indexOf(q)
    if (at < 0) continue
    const wordStart = at === 0 || k[at - 1] === ' '
    out.push({ n, rank: (at === 0 ? 2 : wordStart ? 1 : 0) * 1e6 + n.count })
  }
  return out.sort((a, b) => b.rank - a.rank).slice(0, limit).map(o => o.n)
}

export function knownName(m: TxMemory, typed: string): KnownName | undefined {
  return m.names.get(key(typed))
}

/** Most-used first; ties keep the given order. */
export function byUse<T extends { name: string }>(cats: T[], counts: Record<string, number>): T[] {
  return cats.map((c, i) => ({ c, i })).sort((a, b) => (counts[b.c.name] ?? 0) - (counts[a.c.name] ?? 0) || a.i - b.i).map(x => x.c)
}

/** The sheet's memory for one type; refreshes (if stale) whenever the sheet opens. */
export function useTxMemory(type: 'Expense' | 'Income', open: boolean): TxMemory {
  const [, force] = useState(0)
  useEffect(() => {
    const l = () => force(v => v + 1)
    listeners.add(l)
    return () => { listeners.delete(l) }
  }, [])
  useEffect(() => { if (open) refresh() }, [open])
  return memory[type]
}

/** Warm the memory ahead of the first sheet (called from screens on mount). */
export const warmTxMemory = refresh
