'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddCardSheet, type NewCard } from '@/components/wallet/AddCardSheet'
import { AddBankSheet, type NewBank } from '@/components/wallet/AddBankSheet'
import { AddTransferSheet, type TransferPayload } from '@/components/wallet/AddTransferSheet'
import { RevenueStreamSheet, type RevenueStreamConfig } from '@/components/wallet/RevenueStreamSheet'
import { ManualDepositSheet, type IncomeInitial } from '@/components/wallet/ManualDepositSheet'
import { EditCardSheet, type CardEdits } from '@/components/wallet/EditCardSheet'
import { CardVisual } from '@/components/wallet/CardVisual'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { Card, Bank, IncomeSource } from '@/types'
import { Banknote, X, ArrowUpCircle, ArrowLeftRight, PlusCircle, Search, Landmark } from 'lucide-react'
import { GlobalFAB } from '@/components/ui/GlobalFAB'
import { cn, $f, $fd, $fk, fmtDate, haptic, groupByMonth, localToday, daysUntilLabel } from '@/lib/utils'
import type { Frequency } from '@/components/wallet/RevenueStreamSheet'
import { showToast } from '@/lib/toast'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { usePillSwipe } from '@/hooks/usePillSwipe'
import { getAppPrefs } from '@/lib/app-prefs'
import { pageCache } from '@/lib/page-cache'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface CardExpense {
  id: string; name: string; cost: number; date: string; categories: { name: string } | null
}
interface CardSub {
  id: string; name: string; cost: number; billing: string; monthly_cost: number
  annual_cost: number; next_renewal: string | null; category: string | null
}
interface IncomeRow {
  id: string; name: string; amount: number; date: string; source: string | null; bank_id: string | null
}
interface Transfer {
  id: string; from_bank_id: string | null; to_bank_id: string | null
  amount: number; date: string; note: string | null
}

type Tab = 'History' | 'Streams' | 'Accounts'

const PILL_OPTIONS: Tab[] = ['History', 'Streams', 'Accounts']

// ── date helpers ───────────────────────────────────────────────────────────
function advanceByFreq(date: string, freq: 'Monthly' | 'Quarterly'): string {
  const [y, m, d] = date.split('-').map(Number)
  const months    = freq === 'Quarterly' ? 3 : 1
  const next      = new Date(y, m - 1 + months, d)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}
function projectStreamPayments(stream: RevenueStreamConfig, windowEnd: string): number {
  if (!stream.nextPayDate || stream.nextPayDate > windowEnd) return 0
  let cur   = stream.nextPayDate
  let total = 0
  while (cur <= windowEnd) { total += stream.amount; cur = advanceStream(cur, stream.freq) }
  return total
}
function advanceStream(date: string, freq: Frequency): string {
  const [y, m, d] = date.split('-').map(Number)
  const dt = freq === 'Weekly'       ? new Date(y, m - 1, d + 7)  :
             freq === 'Biweekly'    ? new Date(y, m - 1, d + 14) :
             freq === 'Semimonthly' ? new Date(y, m - 1, d + 15) :
                                      new Date(y, m, d)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapStreamRow(s: any): RevenueStreamConfig {
  return {
    id:          String(s.id),
    name:        String(s.name),
    amount:      Number(s.amount),
    freq:        s.freq as Frequency,
    bankId:      s.bank_id ? String(s.bank_id) : null,
    nextPayDate: String(s.next_pay_date),
  }
}

const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function readCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

function IncomeBarChart({ incomeList }: { incomeList: IncomeRow[] }) {
  const [animated,  setAnimated]  = useState(false)
  const [hoverIdx,  setHoverIdx]  = useState<number | null>(null)
  const [tipPos,    setTipPos]    = useState({ x: 0, y: 0 })
  const [colorRev,  setColorRev]  = useState(0)

  const CHART_H = 100
  const BAR_W   = 28

  useEffect(() => {
    const handler = () => setColorRev(r => r + 1)
    window.addEventListener('sem-colors-changed', handler)
    return () => window.removeEventListener('sem-colors-changed', handler)
  }, [])

  // Read live from CSS vars so Settings > Appearance changes apply instantly
  const incRgb   = readCssVar('--sem-income-rgb', '34,197,94')  // fallback = emerald
  const incColor = readCssVar('--sem-income',     '#22c55e')

  const months = useMemo(() => {
    const today  = new Date()
    const result: { key: string; label: string; total: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(today.getFullYear(), today.getMonth() - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      result.push({ key, label: MONTH_ABBRS[d.getMonth()], total: 0 })
    }
    for (const row of incomeList) {
      const m = result.find(r => r.key === row.date.slice(0, 7))
      if (m) m.total += row.amount
    }
    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [incomeList, colorRev])

  const maxVal = Math.max(...months.map(m => m.total), 1)

  useEffect(() => {
    setAnimated(false)
    const t = setTimeout(() => setAnimated(true), 30)
    return () => clearTimeout(t)
  }, [incomeList])

  const hoveredMonth = hoverIdx !== null ? months[hoverIdx] : null

  return (
    <div
      className="mx-4 mt-4 bg-bg-surface border border-white/[0.06]"
      style={{ borderRadius: 14, padding: 16 }}
    >
      <p style={{ fontSize: 9, fontWeight: 500, letterSpacing: '0.12em', color: 'rgb(var(--rgb-ink-faint))', textTransform: 'uppercase', marginBottom: 12 }}>
        Last 6 Months
      </p>

      {/* Bars */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', height: CHART_H }}>
        {months.map((m, i) => {
          const opacity   = 0.30 + (m.total / maxVal) * 0.65
          const heightPct = m.total > 0 ? (m.total / maxVal) * 100 : 0
          return (
            <div
              key={m.key}
              style={{ width: BAR_W, height: '100%', display: 'flex', alignItems: 'flex-end' }}
              onMouseEnter={e => { setHoverIdx(i); setTipPos({ x: e.clientX, y: e.clientY }) }}
              onMouseMove={e  => setTipPos({ x: e.clientX, y: e.clientY })}
              onMouseLeave={()  => setHoverIdx(null)}
            >
              <div style={{
                width:        BAR_W,
                height:       animated ? `${heightPct}%` : '0%',
                minHeight:    m.total > 0 && animated ? 3 : 0,
                borderRadius: 6,
                background:   `rgba(${incRgb},${hoverIdx === i ? Math.min(opacity + 0.15, 1) : opacity})`,
                transition:   'height 600ms cubic-bezier(0.22, 1, 0.36, 1)',
                flexShrink:   0,
              }} />
            </div>
          )
        })}
      </div>

      {/* X-axis labels */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 6 }}>
        {months.map((m, i) => (
          <div key={m.key} style={{ width: BAR_W, textAlign: 'center' }}>
            <span style={{ fontSize: 10, color: hoverIdx === i ? 'rgb(var(--rgb-ink))' : 'rgb(var(--rgb-ink-faint))', transition: 'color 150ms' }}>
              {m.label}
            </span>
          </div>
        ))}
      </div>

      {/* Tooltip */}
      {hoverIdx !== null && hoveredMonth && (
        <div
          className="pointer-events-none"
          style={{
            position:     'fixed',
            zIndex:       50,
            top:          tipPos.y - 58,
            left:         tipPos.x + 12,
            background:   'var(--color-bg-elevated)',
            border:       '0.5px solid var(--color-grid-border)',
            borderRadius: 8,
            padding:      '6px 10px',
          }}
        >
          <p style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.10em', color: incColor, textTransform: 'uppercase', marginBottom: 2 }}>
            {hoveredMonth.label}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'rgb(var(--rgb-ink))', fontFamily: 'var(--font-big-shoulders)' }}>
            ${Math.round(hoveredMonth.total).toLocaleString('en-US')}
          </p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, sub, loading }: { label: string; value: number; sub?: string; loading: boolean }) {
  return (
    <div className="flex-1 bg-bg-surface border border-white/[0.06] rounded-[22px] p-4">
      <div className="flex items-center justify-between mb-3">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">{label}</p>
      </div>
      {loading
        ? <div className="h-8 w-20 rounded-[6px] skeleton" />
        : <p className="text-[26px] font-bold tracking-tight text-emerald leading-none">
            <SlotNumber value={Math.round(value)} format={$f} />
          </p>
      }
      {sub && !loading && <p className="text-[11px] font-mono text-ink-faint mt-1">{sub}</p>}
    </div>
  )
}

// Module-level: survives tab switches, resets only on hard reload
let sessionAutoGenDone = false

const INCOME_LIMIT        = 100
const INCOME_SEARCH_LIMIT = 300
const INCOME_COLS         = 'id, name, amount, date, source, bank_id'

function toIncomeRow(i: Record<string, unknown>): IncomeRow {
  return {
    id:      String(i.id),
    name:    String(i.name),
    amount:  Number(i.amount),
    date:    String(i.date),
    source:  i.source ? String(i.source) : null,
    bank_id: i.bank_id ? String(i.bank_id) : null,
  }
}

// PostgREST `or=(...)` is comma/paren delimited and ilike treats % and _ as
// wildcards — strip the structural characters rather than trying to quote them.
function sanitizeSearch(s: string): string {
  return s.replace(/[,()"\\%_*]/g, ' ').trim()
}

const INCOME_SOURCES: IncomeSource[] = ['Repayment', 'Refund', 'Projects', 'Freelance', 'Other']

// `income.source` is a Postgres enum, so ilike can't be applied to it (and
// PostgREST rejects a ::text cast inside an or= logic tree). Resolve the term
// to matching enum labels up front and match those with an IN list instead.
function incomeSearchFilter(term: string): string {
  const t       = term.toLowerCase()
  const sources = INCOME_SOURCES.filter(s => s.toLowerCase().includes(t))
  const clauses = [`name.ilike.%${term}%`]
  if (sources.length) clauses.push(`source.in.(${sources.map(s => `"${s}"`).join(',')})`)
  return clauses.join(',')
}

export default function InPage() {
  const [tab,           setTab]          = useState<Tab>('History')
  usePillSwipe(tab, setTab, PILL_OPTIONS)
  type InCache = { cards: Card[]; banks: Bank[]; streams: RevenueStreamConfig[]; transfers: Transfer[] }
  const cached = pageCache.get<InCache>('in')
  const [cards,         setCards]        = useState<Card[]>(cached?.cards ?? [])
  const [banks,         setBanks]        = useState<Bank[]>(cached?.banks ?? [])
  const [revStreams,    setRevStreams]   = useState<RevenueStreamConfig[]>(cached?.streams ?? [])
  const [loading,       setLoading]      = useState(!cached)
  const [cardSheetOpen, setCardSheetOpen] = useState(false)
  const [bankSheetOpen, setBankSheetOpen] = useState(false)
  const [streamOpen,    setStreamOpen]   = useState(false)
  const [incomeOpen,    setIncomeOpen]   = useState(false)
  const [editIncome,    setEditIncome]   = useState<IncomeInitial | null>(null)
  const [editStream,    setEditStream]   = useState<RevenueStreamConfig | null>(null)
  const [incomeList,    setIncomeList]   = useState<IncomeRow[]>([])
  const [incomeLoading, setIncomeLoading] = useState(true)
  const [incomeHasMore, setIncomeHasMore] = useState(false)
  const [incomeMoreLoading, setIncomeMoreLoading] = useState(false)
  // Chart + stat tiles read from their own window of rows so they stay correct
  // no matter how far the paginated list below has been scrolled.
  const [recentIncome,  setRecentIncome] = useState<IncomeRow[]>([])
  const [searchOpen,    setSearchOpen]   = useState(false)
  const [query,         setQuery]        = useState('')
  const [searchRows,    setSearchRows]   = useState<IncomeRow[] | null>(null)
  const [searching,     setSearching]    = useState(false)
  const [interestBank,  setInterestBank] = useState<Bank | null>(null)
  const [intBalance,    setIntBalance]   = useState('')
  const [intApy,        setIntApy]       = useState('')
  const [intDate,       setIntDate]      = useState('')
  const [intFreq,       setIntFreq]      = useState<'Monthly' | 'Quarterly'>('Monthly')
  const [selectedCard,  setSelectedCard] = useState<Card | null>(null)
  const [editCard,      setEditCard]     = useState<Card | null>(null)
  const [editSheetOpen, setEditSheetOpen] = useState(false)
  const [cardExpenses,  setCardExpenses] = useState<CardExpense[]>([])
  const [cardSubs,      setCardSubs]     = useState<CardSub[]>([])
  const [expLoading,    setExpLoading]   = useState(false)
  const [cardStats,     setCardStats]    = useState<Record<string, { expenses: number; subs: number }>>({})
  const [transfers,          setTransfers]          = useState<Transfer[]>(cached?.transfers ?? [])
  const [transferSheetOpen, setTransferSheetOpen]  = useState(false)
  const [draggingId,    setDraggingId]   = useState<string | null>(null)
  const [dragCards,     setDragCards]    = useState<Card[]>([])

  const supabase          = useMemo(() => createClient(), [])
  const loadGen           = useRef(0)
  const abortRef          = useRef<AbortController | null>(null)
  const detailGen         = useRef(0)
  const detailAbortRef    = useRef<AbortController | null>(null)
  const incomeGen         = useRef(0)
  const incomeAbortRef    = useRef<AbortController | null>(null)
  const incomeOffsetRef   = useRef(0)
  const incomeListRef     = useRef<IncomeRow[]>([])
  const incomeHasMoreRef  = useRef(false)
  const isLoadingMoreInc  = useRef(false)
  const incomeSentinelRef = useRef<HTMLDivElement>(null)
  const incomeSearchGen   = useRef(0)
  const searchInputRef    = useRef<HTMLInputElement>(null)
  const pendingDeleteIds  = useRef(new Set<string>())
  const containerRef      = useRef<HTMLDivElement | null>(null)
  const cardsRef          = useRef<Card[]>(cards)
  const banksRef          = useRef<Bank[]>(banks)
  const draggingIdRef     = useRef<string | null>(null)
  const isDraggingRef     = useRef(false)
  const justEndedDragRef  = useRef(false)
  const lpTimerRef        = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workingRef        = useRef<Card[]>([])
  const dragStartYRef     = useRef(0)
  const dragStartXRef     = useRef(0)
  const dragStartIdxRef   = useRef(0)
  const dragCurrentIdxRef = useRef(0)
  const dragCardHRef      = useRef(0)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const [{ data: cardsData }, { data: banksData }, { data: streamsData }, { data: expCardIds }, { data: subCardIds }, { data: transfersData }] = await Promise.all([
        supabase.from('cards').select('*, bank:banks(id, name, type, last4)').order('sort_order', { ascending: true, nullsFirst: false }).order('is_default', { ascending: false }).order('created_at', { ascending: false }).abortSignal(controller.signal),
        supabase.from('banks').select('*').order('created_at', { ascending: false }).abortSignal(controller.signal),
        supabase.from('revenue_streams').select('*').order('created_at', { ascending: true }).abortSignal(controller.signal),
        supabase.from('expenses').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
        supabase.from('subscriptions').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
        supabase.from('transfers').select('id, from_bank_id, to_bank_id, amount, date, note').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(100).abortSignal(controller.signal),
      ])
      const newCards   = (cardsData  ?? []) as Card[]
      const newBanks   = (banksData  ?? []) as Bank[]
      const newStreams  = (streamsData ?? []).map(mapStreamRow)
      const stats: Record<string, { expenses: number; subs: number }> = {}
      for (const row of (expCardIds ?? []) as { card_id: string }[]) {
        if (!stats[row.card_id]) stats[row.card_id] = { expenses: 0, subs: 0 }
        stats[row.card_id].expenses++
      }
      for (const row of (subCardIds ?? []) as { card_id: string }[]) {
        if (!stats[row.card_id]) stats[row.card_id] = { expenses: 0, subs: 0 }
        stats[row.card_id].subs++
      }
      const newTransfers: Transfer[] = (transfersData ?? []).map(t => ({
        id:           String(t.id),
        from_bank_id: t.from_bank_id ? String(t.from_bank_id) : null,
        to_bank_id:   t.to_bank_id   ? String(t.to_bank_id)   : null,
        amount:       Number(t.amount),
        date:         String(t.date),
        note:         t.note ? String(t.note) : null,
      }))
      if (gen !== loadGen.current) return
      setCards(newCards)
      setBanks(newBanks)
      setRevStreams(newStreams)
      setTransfers(newTransfers)
      setCardStats(stats)
      pageCache.set('in', { cards: newCards, banks: newBanks, streams: newStreams, transfers: newTransfers })
      setLoading(false)
      if (!sessionAutoGenDone) {
        sessionAutoGenDone = true
        supabase.auth.getUser().then(async ({ data: { user } }) => {
          if (!user) return
          let streams = newStreams
          let bks     = newBanks
          const didMigrate = await migrateFromLocalStorage(user.id, newBanks)
          if (didMigrate) {
            const [{ data: sd }, { data: bd }] = await Promise.all([
              supabase.from('revenue_streams').select('*').order('created_at', { ascending: true }),
              supabase.from('banks').select('*').order('created_at', { ascending: false }),
            ])
            streams = (sd ?? []).map(mapStreamRow)
            bks     = (bd ?? []) as Bank[]
            setRevStreams(streams)
            setBanks(bks)
            pageCache.set('in', { cards: newCards, banks: bks, streams })
          }
          autoGenerateStreams(user.id, streams)
          autoGenerateInterest(user.id, bks)
        })
      }
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  const loadIncome = useCallback(async () => {
    incomeAbortRef.current?.abort()
    const controller = new AbortController()
    incomeAbortRef.current = controller
    const gen = ++incomeGen.current
    setIncomeLoading(true)
    try {
      const today = localToday()
      // Stats window: far enough back to cover both the 6-month chart and the
      // year-to-date tile, independent of how many list pages are loaded.
      const now        = new Date()
      const sixAgo     = new Date(now.getFullYear(), now.getMonth() - 5, 1)
      const chartStart = `${sixAgo.getFullYear()}-${String(sixAgo.getMonth() + 1).padStart(2, '0')}-01`
      const yearStart  = `${now.getFullYear()}-01-01`
      const statsStart = chartStart < yearStart ? chartStart : yearStart
      const [{ data }, { data: statsData }] = await Promise.all([
        supabase.from('income').select(INCOME_COLS)
          .lte('date', today)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .range(0, INCOME_LIMIT - 1)
          .abortSignal(controller.signal),
        supabase.from('income').select(INCOME_COLS)
          .lte('date', today)
          .gte('date', statsStart)
          .limit(5000)
          .abortSignal(controller.signal),
      ])
      if (gen !== incomeGen.current) return
      const rows = (data ?? []).filter(i => !pendingDeleteIds.current.has(String(i.id))).map(toIncomeRow)
      setIncomeList(rows)
      setRecentIncome((statsData ?? []).filter(i => !pendingDeleteIds.current.has(String(i.id))).map(toIncomeRow))
      incomeOffsetRef.current = data?.length ?? 0
      const more = (data?.length ?? 0) >= INCOME_LIMIT
      setIncomeHasMore(more)
      incomeHasMoreRef.current = more
      setIncomeLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadIncome error:', err)
    }
  }, [supabase])

  const loadMoreIncome = useCallback(async () => {
    if (isLoadingMoreInc.current || !incomeHasMoreRef.current) return
    isLoadingMoreInc.current = true
    setIncomeMoreLoading(true)
    const from = incomeOffsetRef.current
    try {
      const { data } = await supabase
        .from('income')
        .select(INCOME_COLS)
        .lte('date', localToday())
        // id tiebreaker: (date, created_at) is not unique, and tied rows shuffle
        // between queries, so offset pages would overlap and skip entries.
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(from, from + INCOME_LIMIT - 1)
      const fetched = data?.length ?? 0
      incomeOffsetRef.current = from + fetched
      const existing = new Set(incomeListRef.current.map(r => r.id))
      const newRows  = (data ?? [])
        .filter(i => !pendingDeleteIds.current.has(String(i.id)))
        .map(toIncomeRow)
        .filter(r => !existing.has(r.id))
      if (newRows.length) setIncomeList(prev => [...prev, ...newRows])
      const more = fetched === INCOME_LIMIT
      setIncomeHasMore(more)
      incomeHasMoreRef.current = more
    } catch (err) {
      console.error('loadMoreIncome error:', err)
    } finally {
      isLoadingMoreInc.current = false
      setIncomeMoreLoading(false)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  useEffect(() => { cardsRef.current = cards }, [cards])
  useEffect(() => { banksRef.current = banks }, [banks])

  useEffect(() => {
    loadIncome()
    return () => { incomeGen.current++; incomeAbortRef.current?.abort() }
  }, [loadIncome])

  useEffect(() => { incomeListRef.current = incomeList }, [incomeList])
  useEffect(() => { if (searchOpen) searchInputRef.current?.focus() }, [searchOpen])

  const q = searchOpen ? query.trim().toLowerCase() : ''

  // Income search runs against the DB so it spans every income row ever
  // recorded, not just the pages the infinite scroll has pulled in.
  useEffect(() => {
    const term = sanitizeSearch(q)
    const gen  = ++incomeSearchGen.current
    if (!term || tab !== 'History') { setSearchRows(null); setSearching(false); return }
    setSearching(true)
    const t = setTimeout(async () => {
      try {
        const { data } = await supabase.from('income').select(INCOME_COLS)
          .lte('date', localToday())
          .or(incomeSearchFilter(term))
          .order('date', { ascending: false })
          .limit(INCOME_SEARCH_LIMIT)
        if (gen !== incomeSearchGen.current) return
        setSearchRows((data ?? []).filter(i => !pendingDeleteIds.current.has(String(i.id))).map(toIncomeRow))
      } catch (err) {
        console.error('income search error:', err)
      } finally {
        if (gen === incomeSearchGen.current) setSearching(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [q, tab, supabase])

  useEffect(() => {
    const el = incomeSentinelRef.current
    if (!el) return
    const obs = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) loadMoreIncome() },
      { rootMargin: '200px 0px' },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [loadMoreIncome, incomeHasMore, tab, q, loading, incomeLoading])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh(loadData)

  useEffect(() => {
    if (!interestBank) return
    const bank = banks.find(b => b.id === interestBank.id) ?? interestBank
    setIntBalance(bank.balance ? String(bank.balance) : '')
    setIntApy(bank.apy ? String(bank.apy) : '')
    setIntFreq((bank.interest_freq as 'Monthly' | 'Quarterly') ?? 'Monthly')
    setIntDate(bank.next_interest_date ?? localToday())
  }, [interestBank])

  // ── localStorage → Supabase one-time migration ─────────────────────────
  async function migrateFromLocalStorage(userId: string, loadedBanks: Bank[]): Promise<boolean> {
    if (localStorage.getItem('hoardr-ls-migrated')) return false
    let migrated = false

    const lsStreams: RevenueStreamConfig[] = (() => {
      try { return JSON.parse(localStorage.getItem('revenue-streams') ?? '[]') } catch { return [] }
    })()
    if (lsStreams.length > 0) {
      const normalized = lsStreams
        .map(s => !s.nextPayDate && s.lastGenerated ? { ...s, nextPayDate: advanceStream(s.lastGenerated, s.freq) } : s)
        .filter(s => s.nextPayDate)
      for (const s of normalized) {
        await supabase.from('revenue_streams').upsert({
          id: s.id, user_id: userId, name: s.name, amount: s.amount,
          freq: s.freq, bank_id: s.bankId ?? null, next_pay_date: s.nextPayDate,
        }, { onConflict: 'id', ignoreDuplicates: true })
      }
      migrated = true
    }

    const lsCfg: Record<string, { apy?: number; balance?: number; nextInterestDate?: string; interestFreq?: 'Monthly' | 'Quarterly' }> = (() => {
      try { return JSON.parse(localStorage.getItem('bank-cfg') ?? '{}') } catch { return {} }
    })()
    for (const [bankId, conf] of Object.entries(lsCfg)) {
      if (!loadedBanks.find(b => b.id === bankId)) continue
      if (!conf.balance) continue
      const hasInterest = !!(conf.apy && conf.apy > 0)
      await supabase.from('banks').update({
        balance:            conf.balance,
        apy:                hasInterest ? conf.apy : null,
        interest_freq:      hasInterest ? (conf.interestFreq ?? 'Monthly') : null,
        next_interest_date: hasInterest ? (conf.nextInterestDate ?? null) : null,
      }).eq('id', bankId)
      migrated = true
    }

    localStorage.setItem('hoardr-ls-migrated', '1')
    return migrated
  }

  async function autoGenerateStreams(userId: string, streams: RevenueStreamConfig[]) {
    const today = localToday()
    let changed = false
    for (const s of streams) {
      if (!s.nextPayDate || s.nextPayDate > today) continue
      let cur = s.nextPayDate
      while (cur <= today) {
        const { error } = await supabase.from('income').insert({
          user_id: userId, name: s.name, amount: s.amount,
          date: cur, source: 'Projects', bank_id: s.bankId ?? null,
        })
        if (error) break
        cur = advanceStream(cur, s.freq)
        changed = true
      }
      if (cur !== s.nextPayDate) {
        await supabase.from('revenue_streams').update({ next_pay_date: cur }).eq('id', s.id)
        setRevStreams(prev => prev.map(r => r.id === s.id ? { ...r, nextPayDate: cur } : r))
      }
    }
    if (changed) loadIncome()
  }

  async function autoGenerateInterest(userId: string, bks: Bank[]) {
    const today = localToday()
    let changed = false
    for (const bank of bks) {
      if (!bank.apy || !bank.balance || !bank.next_interest_date) continue
      if (bank.next_interest_date > today) continue
      const freq    = (bank.interest_freq as 'Monthly' | 'Quarterly') ?? 'Monthly'
      const divisor = freq === 'Quarterly' ? 4 : 12
      const amount  = parseFloat((bank.balance * bank.apy / 100 / divisor).toFixed(2))
      const { error } = await supabase.from('income').insert({
        user_id: userId, name: `${bank.name} Interest`,
        amount, date: bank.next_interest_date, source: 'Other', bank_id: bank.id,
      })
      if (!error) {
        const nextDate = advanceByFreq(bank.next_interest_date, freq)
        await supabase.from('banks').update({ next_interest_date: nextDate }).eq('id', bank.id)
        setBanks(prev => prev.map(b => b.id === bank.id ? { ...b, next_interest_date: nextDate } : b))
        changed = true
      }
    }
    if (changed) loadIncome()
  }

  async function handleStreamDone(config: RevenueStreamConfig) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const isEdit = revStreams.some(s => s.id === config.id)
    if (isEdit) {
      const { error } = await supabase.from('revenue_streams').update({
        name: config.name, amount: config.amount, freq: config.freq,
        bank_id: config.bankId ?? null, next_pay_date: config.nextPayDate,
      }).eq('id', config.id)
      if (error) { console.error('stream update error:', error); return }
      setRevStreams(prev => prev.map(s => s.id === config.id ? config : s))
    } else {
      const { error } = await supabase.from('revenue_streams').insert({
        id: config.id, user_id: user.id, name: config.name, amount: config.amount,
        freq: config.freq, bank_id: config.bankId ?? null, next_pay_date: config.nextPayDate,
      })
      if (error) { console.error('stream insert error:', error); return }
      setRevStreams(prev => [...prev, config])
    }
    loadIncome()
  }

  function handleDeleteStream(id: string) {
    const snapshot = revStreams.slice()
    setRevStreams(prev => prev.filter(s => s.id !== id))
    showToast('Stream removed', {
      type: 'delete',
      undo: {
        onUndo:   () => setRevStreams(snapshot),
        onCommit: () => { supabase.from('revenue_streams').delete().eq('id', id).then() },
      },
    })
  }

  function handleDeleteIncome(id: string) {
    // Look in displayIncome, not incomeList — while a search is active the
    // visible row may be a server result that was never in the paged feed.
    const row = displayIncome.find(i => i.id === id)
    if (!row) return
    const snapshot       = incomeList.slice()
    const recentSnapshot = recentIncome.slice()
    const searchSnapshot = searchRows?.slice() ?? null
    pendingDeleteIds.current.add(id)
    setIncomeList(prev => prev.filter(i => i.id !== id))
    setRecentIncome(prev => prev.filter(i => i.id !== id))
    setSearchRows(prev => prev ? prev.filter(i => i.id !== id) : prev)
    supabase.from('income').delete().eq('id', id).then()
    showToast(`${row.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo: () => {
          pendingDeleteIds.current.delete(id)
          setIncomeList(snapshot)
          setRecentIncome(recentSnapshot)
          setSearchRows(searchSnapshot)
          supabase.auth.getUser().then(({ data: { user } }) => {
            if (!user) return
            supabase.from('income').insert({
              id, user_id: user.id, name: row.name, amount: row.amount,
              date: row.date, source: row.source, bank_id: row.bank_id,
            })
          })
        },
        onCommit: () => { pendingDeleteIds.current.delete(id) },
      },
    })
  }

  useEffect(() => {
    if (!selectedCard) { setCardExpenses([]); setCardSubs([]); return }
    const gen = ++detailGen.current
    detailAbortRef.current?.abort()
    const detailController = new AbortController()
    detailAbortRef.current = detailController
    setExpLoading(true)
    async function loadDetail() {
      try {
        const [{ data: expData }, { data: subData }] = await Promise.all([
          supabase.from('expenses').select('id, name, cost, date, categories(name)').eq('card_id', selectedCard!.id).order('date', { ascending: false }).order('created_at', { ascending: false }).abortSignal(detailController.signal),
          supabase.from('subscriptions').select('id, name, cost, billing, monthly_cost, annual_cost, next_renewal, category').eq('card_id', selectedCard!.id).order('next_renewal', { ascending: true }).abortSignal(detailController.signal),
        ])
        if (gen !== detailGen.current) return
        setCardExpenses((expData ?? []) as unknown as CardExpense[])
        setCardSubs((subData ?? []).map(s => ({
          id:           String(s.id),
          name:         String(s.name),
          cost:         Number(s.cost),
          billing:      String(s.billing),
          monthly_cost: Number(s.monthly_cost ?? 0),
          annual_cost:  Number(s.annual_cost  ?? 0),
          next_renewal: s.next_renewal ? String(s.next_renewal) : null,
          category:     s.category ? String(s.category) : null,
        })))
        setExpLoading(false)
      } catch (err) {
        if ((err as Error)?.name === 'AbortError') return
        console.error('loadDetail error:', err)
      }
    }
    loadDetail()
    return () => { detailGen.current++; detailAbortRef.current?.abort() }
  }, [selectedCard, supabase])

  function handleDeleteCard(id: string) {
    const card = cards.find(c => c.id === id)
    if (!card) return
    const snapshot = cards.slice()
    setCards(prev => prev.filter(c => c.id !== id))
    showToast(`${card.name} deleted`, {
      type: 'delete',
      undo: { onUndo: () => setCards(snapshot), onCommit: () => { supabase.from('cards').delete().eq('id', id).then() } },
    })
  }

  function handleDeleteBank(id: string) {
    const bank = banks.find(b => b.id === id)
    if (!bank) return
    const snapshot = banks.slice()
    setBanks(prev => prev.filter(b => b.id !== id))
    showToast(`${bank.name} deleted`, {
      type: 'delete',
      undo: { onUndo: () => setBanks(snapshot), onCommit: () => { supabase.from('banks').delete().eq('id', id).then() } },
    })
  }

  async function handleSaveInterestConfig() {
    if (!interestBank) return
    const bal = parseFloat(intBalance)
    const apy = parseFloat(intApy)
    if (isNaN(bal) || bal <= 0) return
    const hasInterest = !isNaN(apy) && apy > 0 && !!intDate
    const { error } = await supabase.from('banks').update({
      balance:            bal,
      apy:                hasInterest ? apy   : null,
      interest_freq:      hasInterest ? intFreq : null,
      next_interest_date: hasInterest ? intDate  : null,
    }).eq('id', interestBank.id)
    if (error) { console.error('bank update error:', error); return }
    setBanks(prev => prev.map(b => b.id === interestBank.id ? {
      ...b,
      balance:            bal,
      apy:                hasInterest ? apy    : null,
      interest_freq:      hasInterest ? intFreq : null,
      next_interest_date: hasInterest ? intDate  : null,
    } : b))
    showToast(hasInterest ? 'Interest scheduled' : 'Balance saved', { type: 'add' })
    setInterestBank(null)
  }

  async function handleAddCard(newCard: NewCard) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const optimistic: Card = {
      id: `tmp-${Date.now()}`, user_id: user.id, bank_id: newCard.bank_id, name: newCard.name,
      alias: newCard.alias, type: newCard.type, last4: newCard.last4, network: newCard.network,
      expires: newCard.expires, cardholder: newCard.cardholder, style: newCard.style,
      texture: newCard.texture, is_default: false, sort_order: 999, created_at: new Date().toISOString(),
    }
    setCards(prev => [optimistic, ...prev])
    showToast(`${newCard.name} added`, { type: 'add' })
    const { error } = await supabase.from('cards').insert({
      user_id: user.id, bank_id: newCard.bank_id, name: newCard.name, alias: newCard.alias,
      type: newCard.type, last4: newCard.last4, network: newCard.network, expires: newCard.expires,
      cardholder: newCard.cardholder, style: newCard.style, texture: newCard.texture, is_default: false,
    })
    if (error) console.error('card insert error:', JSON.stringify(error))
    await loadData()
  }

  async function handleSaveCard(id: string, edits: CardEdits) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...edits } : c))
    const { error } = await supabase.from('cards').update(edits).eq('id', id)
    if (error) { console.error('update card error:', JSON.stringify(error)); await loadData() }
  }

  async function handleMakeDefault(cardId: string) {
    setCards(prev => prev.map(c => ({ ...c, is_default: c.id === cardId })))
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('cards').update({ is_default: false }).eq('user_id', user.id)
    await supabase.from('cards').update({ is_default: true  }).eq('id', cardId)
    await supabase.from('profiles').update({ default_card_id: cardId }).eq('id', user.id)
    await loadData()
  }

  async function handleAddBank(newBank: NewBank) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const optimistic: Bank = {
      id: `tmp-${Date.now()}`, user_id: user.id, name: newBank.name,
      type: newBank.type, last4: newBank.last4, created_at: new Date().toISOString(),
      balance: null, apy: null, next_interest_date: null, interest_freq: null,
    }
    setBanks(prev => [optimistic, ...prev])
    showToast(`${newBank.name} added`, { type: 'add' })
    const { error } = await supabase.from('banks').insert({
      user_id: user.id, name: newBank.name, type: newBank.type, last4: newBank.last4,
    })
    if (error) console.error('bank insert error:', JSON.stringify(error))
    await loadData()
  }

  async function handleAddTransfer(payload: TransferPayload) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const fromBank = banksRef.current.find(b => b.id === payload.from_bank_id)
    const toBank   = banksRef.current.find(b => b.id === payload.to_bank_id)
    // Optimistic state
    setTransfers(prev => [{ id: `tmp-${Date.now()}`, ...payload }, ...prev])
    setBanks(prev => prev.map(b => {
      if (b.id === payload.from_bank_id && b.balance != null) return { ...b, balance: b.balance - payload.amount }
      if (b.id === payload.to_bank_id   && b.balance != null) return { ...b, balance: b.balance + payload.amount }
      return b
    }))
    showToast('Transfer recorded', { type: 'add' })
    await Promise.all([
      supabase.from('transfers').insert({ user_id: user.id, from_bank_id: payload.from_bank_id, to_bank_id: payload.to_bank_id, amount: payload.amount, date: payload.date, note: payload.note }),
      fromBank?.balance != null ? supabase.from('banks').update({ balance: fromBank.balance - payload.amount }).eq('id', fromBank.id) : null,
      toBank?.balance   != null ? supabase.from('banks').update({ balance: (toBank.balance ?? 0) + payload.amount }).eq('id', toBank.id) : null,
    ])
    await loadData()
  }

  function handleDeleteTransfer(id: string) {
    const t = transfers.find(x => x.id === id)
    if (!t) return
    const tSnap = transfers.slice()
    const bSnap = banksRef.current.slice()
    setTransfers(prev => prev.filter(x => x.id !== id))
    setBanks(prev => prev.map(b => {
      if (b.id === t.from_bank_id && b.balance != null) return { ...b, balance: b.balance + t.amount }
      if (b.id === t.to_bank_id   && b.balance != null) return { ...b, balance: b.balance - t.amount }
      return b
    }))
    showToast('Transfer deleted', {
      type: 'delete',
      undo: {
        onUndo:   () => { setTransfers(tSnap); setBanks(bSnap) },
        onCommit: async () => {
          await supabase.from('transfers').delete().eq('id', id)
          const fb = bSnap.find(b => b.id === t.from_bank_id)
          const tb = bSnap.find(b => b.id === t.to_bank_id)
          if (fb?.balance != null) await supabase.from('banks').update({ balance: fb.balance + t.amount }).eq('id', fb.id)
          if (tb?.balance != null) await supabase.from('banks').update({ balance: tb.balance - t.amount }).eq('id', tb.id)
        },
      },
    })
  }

  useEffect(() => {
    const el = containerRef.current!
    if (!el) return

    function getCardId(touch: Touch): string | null {
      let node = document.elementFromPoint(touch.clientX, touch.clientY) as HTMLElement | null
      while (node && node !== el) {
        if (node.dataset.cardId) return node.dataset.cardId
        node = node.parentElement
      }
      return null
    }

    function onTouchStart(e: TouchEvent) {
      const touch  = e.touches[0]
      const cardId = getCardId(touch)
      if (!cardId) return
      dragStartYRef.current = touch.clientY
      dragStartXRef.current = touch.clientX
      lpTimerRef.current = setTimeout(() => {
        const cur      = cardsRef.current
        const startIdx = cur.findIndex(c => c.id === cardId)
        if (startIdx === -1) return
        const cardEl = el.querySelector(`[data-card-id="${cardId}"]`) as HTMLElement | null
        if (!cardEl) return
        workingRef.current        = [...cur]
        dragStartIdxRef.current   = startIdx
        dragCurrentIdxRef.current = startIdx
        dragCardHRef.current      = cardEl.getBoundingClientRect().height + 16
        isDraggingRef.current     = true
        draggingIdRef.current     = cardId
        haptic('tap')
        cardEl.style.transition = 'none'
        flushSync(() => { setDraggingId(cardId); setDragCards([...cur]) })
      }, 450)
    }

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0]
      if (!isDraggingRef.current) {
        if (lpTimerRef.current !== null) {
          const dx = Math.abs(touch.clientX - dragStartXRef.current)
          const dy = Math.abs(touch.clientY - dragStartYRef.current)
          if (dx > 8 || dy > 8) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null }
        }
        return
      }
      e.preventDefault()
      const deltaY = touch.clientY - dragStartYRef.current
      const cardH  = dragCardHRef.current
      const maxIdx = workingRef.current.length - 1
      const newIdx = Math.max(0, Math.min(maxIdx, Math.round(dragStartIdxRef.current + deltaY / cardH)))
      if (newIdx !== dragCurrentIdxRef.current) {
        const oldIdx  = dragCurrentIdxRef.current
        const dragged = workingRef.current[oldIdx]
        workingRef.current.splice(oldIdx, 1)
        workingRef.current.splice(newIdx, 0, dragged)
        dragCurrentIdxRef.current = newIdx
        haptic('tap')
        flushSync(() => setDragCards([...workingRef.current]))
      }
      const cardEl = el.querySelector(`[data-card-id="${draggingIdRef.current}"]`) as HTMLElement | null
      if (cardEl) {
        const adj = deltaY - (dragCurrentIdxRef.current - dragStartIdxRef.current) * cardH
        cardEl.style.transform  = `scale(1.04) translateY(${adj}px)`
        cardEl.style.transition = 'none'
      }
    }

    function onTouchEnd() {
      if (lpTimerRef.current !== null) { clearTimeout(lpTimerRef.current); lpTimerRef.current = null }
      if (!isDraggingRef.current) return
      isDraggingRef.current    = false
      draggingIdRef.current    = null
      justEndedDragRef.current = true
      setTimeout(() => { justEndedDragRef.current = false }, 300)
      const finalOrder = [...workingRef.current]
      el.querySelectorAll('[data-card-id]').forEach(node => {
        const n = node as HTMLElement
        n.style.transform  = ''
        n.style.transition = ''
      })
      setDraggingId(null)
      setCards(finalOrder)
      const c = pageCache.get<InCache>('in')
      if (c) pageCache.set('in', { ...c, cards: finalOrder })
      Promise.all(finalOrder.map((card, i) => supabase.from('cards').update({ sort_order: i }).eq('id', card.id)))
    }

    el.addEventListener('touchstart',  onTouchStart, { passive: true })
    el.addEventListener('touchmove',   onTouchMove,  { passive: false })
    el.addEventListener('touchend',    onTouchEnd)
    el.addEventListener('touchcancel', onTouchEnd)
    return () => {
      el.removeEventListener('touchstart',  onTouchStart)
      el.removeEventListener('touchmove',   onTouchMove)
      el.removeEventListener('touchend',    onTouchEnd)
      el.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [supabase, tab])

  // While searching, show the all-time server results instead of the paged feed.
  // Until they land, filter what's already loaded so typing feels instant.
  const displayIncome = useMemo(() => {
    if (!q) return incomeList
    if (searchRows) return searchRows
    return incomeList.filter(r => r.name.toLowerCase().includes(q) || (r.source ?? '').toLowerCase().includes(q))
  }, [incomeList, q, searchRows])

  const incomeGroups = useMemo(() =>
    groupByMonth(displayIncome).map(g => ({
      ...g,
      total: g.rows.reduce((s, r) => s + (r as IncomeRow).amount, 0),
    })),
  [displayIncome])

  const statThisMonth = useMemo(() => {
    const d          = new Date()
    const monthStart = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
    const lastDay    = new Date(d.getFullYear(), d.getMonth() + 1, 0)
    const monthEnd   = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`
    const actual     = recentIncome.filter(r => r.date >= monthStart).reduce((s, r) => s + r.amount, 0)
    const projected  = revStreams.reduce((s, stream) => s + projectStreamPayments(stream, monthEnd), 0)
    return actual + projected
  }, [recentIncome, revStreams])

  const statThisYear = useMemo(() => {
    const yearStart = `${new Date().getFullYear()}-01-01`
    const yearEnd   = `${new Date().getFullYear()}-12-31`
    const actual    = recentIncome.filter(r => r.date >= yearStart).reduce((s, r) => s + r.amount, 0)
    const projected = revStreams.reduce((s, stream) => s + projectStreamPayments(stream, yearEnd), 0)
    return actual + projected
  }, [recentIncome, revStreams])

  const statNextIn = useMemo(() => {
    const today = localToday()
    return [...revStreams]
      .filter(s => s.nextPayDate >= today)
      .sort((a, b) => a.nextPayDate.localeCompare(b.nextPayDate))[0] ?? null
  }, [revStreams])

  const statMonthly = useMemo(() => {
    const streams  = revStreams.reduce((s, r) => {
      const factor = r.freq === 'Weekly' ? 52/12 : r.freq === 'Biweekly' ? 26/12 : r.freq === 'Semimonthly' ? 24/12 : 1
      return s + r.amount * factor
    }, 0)
    const interest = banks.filter(b => b.apy && b.balance).reduce((s, b) => s + (b.balance ?? 0) * (b.apy ?? 0) / 100 / 12, 0)
    return streams + interest
  }, [revStreams, banks])

  const statAnnual = useMemo(() => {
    const streams  = revStreams.reduce((s, r) => {
      const factor = r.freq === 'Weekly' ? 52 : r.freq === 'Biweekly' ? 26 : r.freq === 'Semimonthly' ? 24 : 12
      return s + r.amount * factor
    }, 0)
    const interest = banks.filter(b => b.apy && b.balance).reduce((s, b) => s + (b.balance ?? 0) * (b.apy ?? 0) / 100, 0)
    return streams + interest
  }, [revStreams, banks])

  const statTotalBalance = useMemo(() =>
    banks.reduce((s, b) => s + (b.balance ?? 0), 0),
  [banks])

  const statIntYear = useMemo(() =>
    banks.filter(b => b.apy && b.balance).reduce((s, b) => s + (b.balance ?? 0) * (b.apy ?? 0) / 100, 0),
  [banks])

  return (
    <>
      <div className="min-h-screen bg-bg-base tab-enter">
        <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />
        <div style={{ height: 'calc(env(safe-area-inset-top, 44px) + 8px)' }} />

        {/* paddingRight reserves the top-right corner for the fixed ProfileDrawer button */}
        <div className="mx-4 mt-4 flex items-center gap-2" style={{ paddingRight: 44 }}>
          <div className="flex-1 min-w-0">
            <PillGroup options={['History', 'Streams', 'Accounts'] as Tab[]} value={tab} onChange={setTab} />
          </div>
          {tab === 'History' && (
            <button
              onClick={() => { if (searchOpen) { setSearchOpen(false); setQuery('') } else setSearchOpen(true) }}
              aria-label="Search"
              className={cn('w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 border transition-colors select-none',
                searchOpen ? 'bg-emerald/15 border-emerald/40 text-emerald' : 'bg-bg-surface border-white/[0.06] text-ink-muted')}
            >
              <Search size={15} strokeWidth={2} />
            </button>
          )}
        </div>

        {tab === 'History' && searchOpen && (
          <div className="mx-4 mt-3">
            <div className="flex items-center gap-2 h-10 px-3 rounded-[14px] bg-bg-surface border border-white/[0.06] focus-within:border-emerald/40 transition-colors">
              <Search size={14} className="text-ink-faint flex-shrink-0" strokeWidth={2} />
              <input
                ref={searchInputRef}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search all income…"
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent text-[14px] text-ink placeholder:text-ink-faint outline-none"
                style={{ caretColor: 'var(--sem-income)' }}
              />
              {query && (
                <button onClick={() => { setQuery(''); searchInputRef.current?.focus() }} aria-label="Clear" className="flex-shrink-0 text-ink-faint select-none">
                  <X size={15} strokeWidth={2} />
                </button>
              )}
            </div>
          </div>
        )}

        {tab === 'History' && (
          <div className="mx-4 mt-4 flex gap-2">
            <StatCard label="This Month" value={statThisMonth} loading={incomeLoading} />
            <StatCard label="This Year"  value={statThisYear}  loading={incomeLoading} />
            {statNextIn && (
              <StatCard label="Next In" value={statNextIn.amount}
                sub={daysUntilLabel(statNextIn.nextPayDate)}
                loading={incomeLoading} />
            )}
          </div>
        )}
        {tab === 'Streams' && (
          <div className="mx-4 mt-4 flex gap-2">
            <StatCard label="Per Month" value={statMonthly} loading={false} />
            <StatCard label="Per Year"  value={statAnnual}  loading={false} />
          </div>
        )}
        {tab === 'Accounts' && (
          <div className="mx-4 mt-4 flex gap-2">
            <StatCard label="Total Saved" value={statTotalBalance} loading={false} />
            <StatCard label="Int / Year"  value={statIntYear}      loading={false} />
          </div>
        )}

        {loading && (
          <div className="px-4 mt-5 space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" style={{ aspectRatio: '1.586/1' }} />
            ))}
          </div>
        )}

        {/* ── History ─────────────────────────────────────────────────────── */}
        {!loading && tab === 'History' && (
          <>
          {!q && <IncomeBarChart incomeList={recentIncome} />}
          <div className="mx-4 mt-4 space-y-5">
            {incomeLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-[62px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
                ))}
              </div>
            ) : incomeGroups.length === 0 ? (
              <div className="py-12 text-center text-ink-faint text-[13px]">
                {searching ? 'Searching all history…' : q ? `No income matches “${query.trim()}”.` : 'No income recorded yet — tap + to add.'}
              </div>
            ) : (
              <>
                {q && (
                  <p className="-mb-2 text-center text-[10px] text-ink-faint">
                    {searching ? 'Searching all history…' : `${displayIncome.length}${displayIncome.length >= INCOME_SEARCH_LIMIT ? '+' : ''} match${displayIncome.length === 1 ? '' : 'es'} across all history`}
                  </p>
                )}
                {incomeGroups.map(group => (
                  <div key={group.key}>
                    <div className="flex items-center justify-between mb-3">
                      <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">{group.label}</p>
                      <p className="text-[11px] font-semibold font-mono text-emerald">+{$fk(group.total)}</p>
                    </div>
                    <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                      {(group.rows as IncomeRow[]).map(row => (
                        <SwipeToDelete key={row.id} onDelete={() => handleDeleteIncome(row.id)} onTap={() => setEditIncome({ id: row.id, name: row.name, amount: row.amount, date: row.date, bank_id: row.bank_id, source: row.source })}>
                          <div className="flex items-center gap-3 px-4 py-3.5">
                            <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                              <CategoryIcon category={row.source ?? 'Other'} type="Income" size={15} className="text-emerald" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-ink truncate">{row.name}</p>
                              <p className="text-[11px] text-ink-muted">{row.source ?? 'Income'} · {fmtDate(row.date)}</p>
                            </div>
                            <p className="text-[15px] font-semibold font-mono text-emerald flex-shrink-0">+{$fd(row.amount)}</p>
                          </div>
                        </SwipeToDelete>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>
          {/* Infinite scroll sentinel — not while searching, since search already
              returns all-time matches in one shot */}
          {!incomeLoading && !q && (
            <>
              <div ref={incomeSentinelRef} className="h-px" />
              {incomeMoreLoading
                ? <p className="py-3 text-center text-[11px] text-ink-faint">Loading…</p>
                : !incomeHasMore && incomeList.length > 0 && <p className="py-3 text-center text-[11px] text-ink-faint">That’s all {incomeList.length} income entries.</p>}
            </>
          )}
          </>
        )}

        {/* ── Streams ─────────────────────────────────────────────────────── */}
        {!loading && tab === 'Streams' && (
          <div className="mx-4 mt-4 space-y-5">
            {revStreams.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Revenue Streams</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {revStreams.map(stream => (
                    <SwipeToDelete key={stream.id} onDelete={() => handleDeleteStream(stream.id)} onTap={() => { setEditStream(stream); setStreamOpen(true) }}>
                      <div className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-10 h-10 rounded-[12px] bg-emerald/10 flex items-center justify-center flex-shrink-0">
                          <Banknote size={15} className="text-emerald" strokeWidth={1.75} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{stream.name}</p>
                          <p className="text-[11px] text-ink-muted">
                            {$fd(stream.amount)} · {stream.freq}
                            {banks.find(b => b.id === stream.bankId) ? ` · ${banks.find(b => b.id === stream.bankId)!.name}` : ''}
                          </p>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <p className="text-[11px] text-ink-muted">{daysUntilLabel(stream.nextPayDate)}</p>
                        </div>
                      </div>
                    </SwipeToDelete>
                  ))}
                </div>
              </div>
            )}

            {banks.filter(b => b.apy && b.balance).length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Interest</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {banks.filter(b => b.apy && b.balance).map(bank => {
                    const freq    = (bank.interest_freq as 'Monthly' | 'Quarterly') ?? 'Monthly'
                    const divisor = freq === 'Quarterly' ? 4 : 12
                    const amount  = parseFloat(((bank.balance ?? 0) * (bank.apy ?? 0) / 100 / divisor).toFixed(2))
                    return (
                      <SwipeToDelete key={bank.id} onDelete={() => {
                        const snapshot = banks.slice()
                        setBanks(prev => prev.map(b => b.id === bank.id ? { ...b, apy: null, next_interest_date: null, interest_freq: null } : b))
                        showToast('Interest removed', {
                          type: 'delete',
                          undo: {
                            onUndo:   () => setBanks(snapshot),
                            onCommit: () => { supabase.from('banks').update({ apy: null, next_interest_date: null, interest_freq: null }).eq('id', bank.id).then() },
                          },
                        })
                      }} onTap={() => setInterestBank(bank)}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="w-10 h-10 rounded-[12px] bg-emerald/10 flex items-center justify-center flex-shrink-0"><Landmark size={18} className="text-emerald" strokeWidth={1.75} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink truncate">{bank.name} Interest</p>
                            <p className="text-[11px] text-ink-muted">{bank.apy}% APY · {freq}</p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[13px] font-semibold font-mono text-emerald">+{$fd(amount)}</p>
                            <p className="text-[10px] text-ink-faint">{bank.next_interest_date ? daysUntilLabel(bank.next_interest_date) : 'not scheduled'}</p>
                          </div>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )}

            {revStreams.length === 0 && !banks.some(b => b.apy) && (
              <div className="py-12 text-center">
                <p className="text-[13px] text-ink-faint">No streams yet — tap + to add one.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Accounts ────────────────────────────────────────────────────── */}
        {!loading && tab === 'Accounts' && (
          <div className="mx-4 mt-4 space-y-5">
            {banks.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Banks</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {banks.map(bank => {
                    const linked = cards.filter(c => c.bank_id === bank.id)
                    return (
                      <SwipeToDelete key={bank.id} onDelete={() => handleDeleteBank(bank.id)} onTap={() => setInterestBank(bank)}>
                        <div className="flex items-center gap-3 px-4 py-4 bg-bg-surface">
                          <div className="w-10 h-10 rounded-[10px] bg-bg-overlay flex items-center justify-center flex-shrink-0"><Landmark size={18} className="text-ink-muted" strokeWidth={1.75} /></div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink">{bank.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {bank.type ?? 'Bank'}{bank.last4 ? ` · ••••${bank.last4}` : ''}
                              {bank.apy ? ` · ${bank.apy}% APY` : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[12px] text-ink-faint">{linked.length} {linked.length === 1 ? 'card' : 'cards'}</p>
                            {bank.balance ? <p className="text-[12px] font-mono text-emerald">{$fd(bank.balance)}</p> : null}
                          </div>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )}

            {transfers.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Recent Transfers</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {transfers.slice(0, 10).map(t => {
                    const from = banks.find(b => b.id === t.from_bank_id)
                    const to   = banks.find(b => b.id === t.to_bank_id)
                    return (
                      <SwipeToDelete key={t.id} onDelete={() => handleDeleteTransfer(t.id)}>
                        <div className="flex items-center gap-3 px-4 py-3.5">
                          <div className="w-10 h-10 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                            <ArrowLeftRight size={15} className="text-ink-muted" strokeWidth={1.75} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink truncate">
                              {from?.name ?? '—'} → {to?.name ?? '—'}
                            </p>
                            <p className="text-[11px] text-ink-muted">
                              {fmtDate(t.date)}{t.note ? ` · ${t.note}` : ''}
                            </p>
                          </div>
                          <p className="text-[15px] font-semibold font-mono text-gold flex-shrink-0">{$fd(t.amount)}</p>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )}

            {cards.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Cards</p>
                <div ref={containerRef} className="flex flex-col gap-4">
                  {(draggingId ? dragCards : cards).map(card => (
                    <div key={card.id} data-card-id={card.id}
                      style={{ position: 'relative', opacity: draggingId && draggingId !== card.id ? 0.6 : 1, transition: draggingId ? 'opacity 200ms ease' : undefined, zIndex: draggingId === card.id ? 10 : undefined }}>
                      <SwipeToDelete onDelete={() => handleDeleteCard(card.id)} onTap={() => { if (justEndedDragRef.current) return; setSelectedCard(card) }} className="rounded-card">
                        <div className={cn('transition-transform duration-75', !draggingId && 'active:scale-[0.98]')}>
                          <CardVisual card={card} expenseCount={cardStats[card.id]?.expenses ?? 0} subCount={cardStats[card.id]?.subs ?? 0} />
                        </div>
                      </SwipeToDelete>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {banks.length === 0 && cards.length === 0 && (
              <div className="py-12 text-center text-ink-faint text-[13px]">No accounts yet — tap + to add a bank or card.</div>
            )}
          </div>
        )}

        <div className="h-10" />
      </div>

      {/* ── FAB ──────────────────────────────────────────────────────────── */}
      <GlobalFAB key={tab} actions={[
        { Icon: ArrowLeftRight, label: 'New Transfer', onTap: () => setTransferSheetOpen(true) },
        { Icon: PlusCircle,     label: 'Add Account',  onTap: () => setBankSheetOpen(true) },
        { Icon: ArrowUpCircle,  label: 'New Income',   onTap: () => setIncomeOpen(true)    },
      ]} />

      <AddTransferSheet
        open={transferSheetOpen}
        onClose={() => setTransferSheetOpen(false)}
        onAdd={handleAddTransfer}
        banks={banks.map(b => ({ id: b.id, name: b.name, balance: b.balance }))}
      />
      <AddCardSheet
        open={cardSheetOpen}
        onClose={() => setCardSheetOpen(false)}
        onAdd={handleAddCard}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
      />
      <AddBankSheet
        open={bankSheetOpen}
        onClose={() => setBankSheetOpen(false)}
        onAdd={handleAddBank}
      />
      <RevenueStreamSheet
        open={streamOpen}
        onClose={() => setStreamOpen(false)}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
        onDone={handleStreamDone}
        initial={editStream ?? undefined}
      />
      <ManualDepositSheet
        open={incomeOpen}
        onClose={() => setIncomeOpen(false)}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
        onDone={loadIncome}
        defaultBankId={getAppPrefs().defaultBankId}
      />
      <ManualDepositSheet
        open={!!editIncome}
        onClose={() => setEditIncome(null)}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
        onDone={loadIncome}
        initial={editIncome}
      />
      <EditCardSheet
        card={editCard}
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        onSave={handleSaveCard}
        onMakeDefault={handleMakeDefault}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
      />

      {/* ── Bank interest sheet ──────────────────────────────────────────── */}
      <div
        onClick={() => setInterestBank(null)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', interestBank ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', interestBank ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 mb-5">
          <div>
            <h2 className="text-[18px] font-bold text-ink">Balance & Interest</h2>
            {interestBank && <p className="text-[12px] text-ink-muted mt-0.5">{interestBank.name}</p>}
          </div>
          <button onClick={() => setInterestBank(null)} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>
        <div className="px-5 space-y-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Current Balance</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={intBalance}
                onChange={e => setIntBalance(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint" />
            </div>
          </div>
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">APY (%) <span className="normal-case tracking-normal text-ink-faint/60">— optional</span></p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <input type="number" inputMode="decimal" placeholder="4.30" value={intApy}
                onChange={e => setIntApy(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint" />
              <span className="text-[22px] font-light text-ink-muted font-mono">%</span>
            </div>
          </div>
          {parseFloat(intApy) > 0 && (
            <>
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Frequency</p>
                <div className="flex gap-2">
                  {(['Monthly', 'Quarterly'] as const).map(f => (
                    <button key={f} onClick={() => setIntFreq(f)}
                      className={cn('flex-1 py-2.5 rounded-full text-[12px] font-semibold transition-all select-none',
                        intFreq === f ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                      {f}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Next payment date</p>
                <div className="rounded-[14px]">
                  <CustomDateInput value={intDate} onChange={setIntDate}
                    className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none focus:border-gold/40" />
                </div>
              </div>
              {parseFloat(intBalance) > 0 && intDate && (() => {
                const divisor = intFreq === 'Quarterly' ? 4 : 12
                const amount  = parseFloat(intBalance) * (parseFloat(intApy) / 100) / divisor
                return (
                  <div className="bg-bg-overlay border border-emerald/20 rounded-[14px] px-4 py-3.5 flex items-center gap-3">
                    <Banknote size={18} className="text-emerald flex-shrink-0" strokeWidth={1.75} />
                    <div>
                      <p className="text-[14px] font-semibold text-ink">+{$fd(amount)} on {intDate}</p>
                      <p className="text-[11px] text-ink-muted">{parseFloat(intApy)}% APY · {intFreq.toLowerCase()}</p>
                    </div>
                  </div>
                )
              })()}
            </>
          )}
          <button
            onClick={handleSaveInterestConfig}
            disabled={!(parseFloat(intBalance) > 0)}
            className="w-full gradient-gold rounded-[14px] py-4 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity"
          >
            {parseFloat(intApy) > 0 ? 'Schedule Interest' : 'Save Balance'}
          </button>
        </div>
      </div>

      {/* ── Card detail sheet ─────────────────────────────────────────────── */}
      <div
        onClick={() => setSelectedCard(null)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', selectedCard ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', selectedCard ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 mb-4">
          <div>
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink-faint">Card</p>
            <h2 className="text-[18px] font-bold tracking-tight text-ink">{selectedCard?.name}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setEditCard(selectedCard); setSelectedCard(null); setEditSheetOpen(true) }}
              className="px-3 h-8 rounded-full bg-bg-overlay text-[11px] font-medium text-ink-muted select-none"
            >Edit</button>
            <button onClick={() => setSelectedCard(null)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
          </div>
        </div>

        {!expLoading && (() => {
          const now        = new Date()
          const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
          const yearStart  = `${now.getFullYear()}-01-01`
          const mo         = cardExpenses.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
          const yr         = cardExpenses.filter(e => e.date >= yearStart ).reduce((s, e) => s + Number(e.cost), 0)
          const all        = cardExpenses.reduce((s, e) => s + Number(e.cost), 0)
          const subNames   = new Set(cardSubs.map(s => s.name.toLowerCase()))
          const subExp     = cardExpenses.filter(e => subNames.has(e.name.toLowerCase()))
          const subMo      = subExp.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
          const subYr      = subExp.filter(e => e.date >= yearStart ).reduce((s, e) => s + Number(e.cost), 0)
          const subAllTime = subExp.reduce((s, e) => s + Number(e.cost), 0)
          const estMo      = cardSubs.reduce((s, sub) => s + sub.monthly_cost, 0)
          const estYr      = cardSubs.reduce((s, sub) => s + sub.annual_cost,  0)
          return (
            <>
              <div className="grid grid-cols-3 gap-2 px-5 mb-2">
                {([['This Month', mo], ['This Year', yr], ['All Time', all]] as [string, number][]).map(([label, val]) => (
                  <div key={label} className="bg-bg-overlay rounded-[14px] px-3 py-3">
                    <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
                    <p className="text-[14px] font-bold font-mono text-gold">{$fk(val)}</p>
                  </div>
                ))}
              </div>
              {subAllTime > 0 && (
                <div className="grid grid-cols-3 gap-2 px-5 mb-3">
                  <div className="bg-bg-overlay rounded-[14px] px-3 py-3">
                    <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">Sub / Mo</p>
                    <p className="text-[14px] font-bold font-mono text-ink">{$fk(subMo)}</p>
                    {estMo > 0 && <p className="text-[10px] font-mono text-ink-faint mt-0.5">/ {$fk(estMo)}</p>}
                  </div>
                  <div className="bg-bg-overlay rounded-[14px] px-3 py-3">
                    <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">Sub / Yr</p>
                    <p className="text-[14px] font-bold font-mono text-ink">{$fk(subYr)}</p>
                    {estYr > 0 && <p className="text-[10px] font-mono text-ink-faint mt-0.5">/ {$fk(estYr)}</p>}
                  </div>
                  <div className="bg-bg-overlay rounded-[14px] px-3 py-3">
                    <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">All Time</p>
                    <p className="text-[14px] font-bold font-mono text-ink">{$fk(subAllTime)}</p>
                  </div>
                </div>
              )}
            </>
          )
        })()}

        <div className="overflow-y-auto" style={{ maxHeight: '50vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
          {expLoading ? (
            <div className="px-4 space-y-2.5 pb-4">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-[18px] skeleton" />)}
            </div>
          ) : cardExpenses.length === 0 ? (
            <div className="py-12 text-center text-ink-faint text-[13px]">No expenses on this card yet.</div>
          ) : (() => {
            const subNameSet = new Set(cardSubs.map(s => s.name.toLowerCase()))
            return (
              <div className="mx-4 mb-4">
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {cardExpenses.map(exp => {
                    const isSub = subNameSet.has(exp.name.toLowerCase())
                    return (
                      <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5">
                        <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                          <CategoryIcon
                            category={exp.categories?.name ?? 'Other'}
                            type="Expense"
                            isSub={isSub}
                            size={15}
                            className={isSub ? 'text-white/60' : 'text-gold'}
                          />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[14px] font-medium text-ink truncate">{exp.name}</p>
                          <p className="text-[11px] text-ink-muted">{fmtDate(exp.date)}</p>
                        </div>
                        <p className="text-[15px] font-semibold font-mono flex-shrink-0 text-ink">−{$fd(exp.cost)}</p>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>
      </div>
    </>
  )
}
