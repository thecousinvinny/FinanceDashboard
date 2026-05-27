'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddCardSheet, type NewCard } from '@/components/wallet/AddCardSheet'
import { AddBankSheet, type NewBank } from '@/components/wallet/AddBankSheet'
import { RevenueStreamSheet, type RevenueStreamConfig } from '@/components/wallet/RevenueStreamSheet'
import { ManualDepositSheet, type IncomeInitial } from '@/components/wallet/ManualDepositSheet'
import { EditCardSheet, type CardEdits } from '@/components/wallet/EditCardSheet'
import { CardVisual } from '@/components/wallet/CardVisual'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { Card, Bank } from '@/types'
import { Banknote, ChevronRight, X } from 'lucide-react'
import { cn, $fd, $fk, fmtDate, haptic, groupByMonth, localToday, daysUntilLabel } from '@/lib/utils'
import type { Frequency } from '@/components/wallet/RevenueStreamSheet'
import { showToast } from '@/lib/toast'
import { useRouter } from 'next/navigation'
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

type Tab = 'History' | 'Streams' | 'Accounts'
type BankCfgEntry = { apy: number; balance: number; nextInterestDate?: string; interestFreq?: 'Monthly' | 'Quarterly' }

const PILL_OPTIONS: Tab[] = ['History', 'Streams', 'Accounts']

// ── local date helpers (mirrors RevenueStreamSheet logic) ──────────────────
function addDay(s: string): string {
  const [y, m, d] = s.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}
function getPayDates(startDate: string, freq: Frequency): string[] {
  const [y, m, d] = startDate.split('-').map(Number)
  let cur = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(23, 59, 59, 999)
  const dates: string[] = []
  while (cur <= today) {
    dates.push(`${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`)
    switch (freq) {
      case 'Weekly':       cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);  break
      case 'Biweekly':    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 14); break
      case 'Semimonthly': cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 15); break
      case 'Monthly':     cur = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());  break
    }
  }
  return dates
}
function advanceByFreq(date: string, freq: 'Monthly' | 'Quarterly'): string {
  const [y, m, d] = date.split('-').map(Number)
  const months    = freq === 'Quarterly' ? 3 : 1
  const next      = new Date(y, m - 1 + months, d)
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

function nextPayDate(lastGenerated: string, freq: Frequency): string {
  const [y, m, d] = lastGenerated.split('-').map(Number)
  let next: Date
  switch (freq) {
    case 'Weekly':       next = new Date(y, m - 1, d + 7);  break
    case 'Biweekly':    next = new Date(y, m - 1, d + 14); break
    case 'Semimonthly': next = new Date(y, m - 1, d + 15); break
    case 'Monthly':     next = new Date(y, m, d);           break
  }
  return `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
}

// Module-level: survives tab switches (component remounts), resets only on hard reload
let sessionAutoGenDone = false

export default function InPage() {
  const router = useRouter()
  const [tab,           setTab]          = useState<Tab>('History')
  usePillSwipe(tab, setTab, PILL_OPTIONS, '/money', '/calendar', router)
  type InCache = { cards: Card[]; banks: Bank[] }
  const cached = pageCache.get<InCache>('in')
  const [cards,         setCards]        = useState<Card[]>(cached?.cards ?? [])
  const [banks,         setBanks]        = useState<Bank[]>(cached?.banks ?? [])
  const [loading,       setLoading]      = useState(!cached)
  const [cardSheetOpen, setCardSheetOpen] = useState(false)
  const [bankSheetOpen, setBankSheetOpen] = useState(false)
  const [fabOpen,       setFabOpen]      = useState(false)
  const [streamOpen,    setStreamOpen]   = useState(false)
  const [incomeOpen,    setIncomeOpen]   = useState(false)
  const [editIncome,    setEditIncome]   = useState<IncomeInitial | null>(null)
  const [editStream,    setEditStream]   = useState<RevenueStreamConfig | null>(null)
  const [revStreams,    setRevStreams]   = useState<RevenueStreamConfig[]>([])
  const [incomeList,    setIncomeList]   = useState<IncomeRow[]>([])
  const [incomeLoading, setIncomeLoading] = useState(false)
  const [interestBank,  setInterestBank] = useState<Bank | null>(null)
  const [bankCfg,       setBankCfg]      = useState<Record<string, BankCfgEntry>>({})
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
  const [draggingId,    setDraggingId]   = useState<string | null>(null)
  const [dragCards,     setDragCards]    = useState<Card[]>([])

  const supabase          = useMemo(() => createClient(), [])
  const loadGen           = useRef(0)
  const abortRef          = useRef<AbortController | null>(null)
  const detailGen         = useRef(0)
  const detailAbortRef    = useRef<AbortController | null>(null)
  const incomeGen         = useRef(0)
  const incomeAbortRef    = useRef<AbortController | null>(null)
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
      const [{ data: cardsData }, { data: banksData }, { data: expCardIds }, { data: subCardIds }] = await Promise.all([
        supabase.from('cards').select('*, bank:banks(id, name, type, last4)').order('sort_order', { ascending: true, nullsFirst: false }).order('is_default', { ascending: false }).order('created_at', { ascending: false }).abortSignal(controller.signal),
        supabase.from('banks').select('*').order('created_at', { ascending: false }).abortSignal(controller.signal),
        supabase.from('expenses').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
        supabase.from('subscriptions').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
      ])
      const newCards = (cardsData ?? []) as Card[]
      const newBanks = (banksData  ?? []) as Bank[]
      const stats: Record<string, { expenses: number; subs: number }> = {}
      for (const row of (expCardIds ?? []) as { card_id: string }[]) {
        if (!stats[row.card_id]) stats[row.card_id] = { expenses: 0, subs: 0 }
        stats[row.card_id].expenses++
      }
      for (const row of (subCardIds ?? []) as { card_id: string }[]) {
        if (!stats[row.card_id]) stats[row.card_id] = { expenses: 0, subs: 0 }
        stats[row.card_id].subs++
      }
      if (gen !== loadGen.current) return
      setCards(newCards)
      setBanks(newBanks)
      setCardStats(stats)
      pageCache.set('in', { cards: newCards, banks: newBanks })
      setLoading(false)
      if (!sessionAutoGenDone) {
        sessionAutoGenDone = true
        supabase.auth.getUser().then(({ data: { user } }) => {
          if (!user) return
          autoGenerateStreams(user.id)
          autoGenerateInterest(user.id)
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
      const { data } = await supabase
        .from('income')
        .select('id, name, amount, date, source, bank_id')
        .lte('date', localToday())
        .order('date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(200)
        .abortSignal(controller.signal)
      if (gen !== incomeGen.current) return
      setIncomeList((data ?? []).filter(i => !pendingDeleteIds.current.has(String(i.id))).map(i => ({
        id:      String(i.id),
        name:    String(i.name),
        amount:  Number(i.amount),
        date:    String(i.date),
        source:  i.source ? String(i.source) : null,
        bank_id: i.bank_id ? String(i.bank_id) : null,
      })))
      setIncomeLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadIncome error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  useEffect(() => { cardsRef.current = cards }, [cards])
  useEffect(() => { banksRef.current = banks }, [banks])

  useEffect(() => {
    if (tab !== 'History') return
    loadIncome()
    return () => { incomeGen.current++; incomeAbortRef.current?.abort() }
  }, [tab, loadIncome])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } = usePullToRefresh(loadData)

  useEffect(() => { setFabOpen(false) }, [tab])

  useEffect(() => {
    try {
      const v = localStorage.getItem('revenue-streams')
      if (v) setRevStreams(JSON.parse(v))
    } catch {}
    try {
      const v = localStorage.getItem('bank-cfg')
      if (v) setBankCfg(JSON.parse(v))
    } catch {}
  }, [])

  useEffect(() => {
    if (!interestBank) return
    const cfg = bankCfg[interestBank.id]
    setIntBalance(cfg?.balance ? String(cfg.balance) : '')
    setIntApy(cfg?.apy ? String(cfg.apy) : '')
    setIntFreq(cfg?.interestFreq ?? 'Monthly')
    setIntDate(cfg?.nextInterestDate ?? localToday())
  }, [interestBank])

  async function autoGenerateStreams(userId: string) {
    const streams: RevenueStreamConfig[] = (() => {
      try { return JSON.parse(localStorage.getItem('revenue-streams') ?? '[]') } catch { return [] }
    })()
    let updated = [...streams]
    let changed = false
    for (let i = 0; i < updated.length; i++) {
      const s = updated[i]
      if (!s.lastGenerated) continue
      // Anchor to original startDate so the pay schedule never drifts
      const allOnSchedule = getPayDates(s.startDate, s.freq)
      const newDates = allOnSchedule.filter(d => d > s.lastGenerated!)
      if (!newDates.length) continue
      // Dedup: skip dates already in DB for this stream
      const { data: existing } = await supabase
        .from('income').select('date').eq('user_id', userId).eq('name', s.name).in('date', newDates)
      const existingSet = new Set((existing ?? []).map((r: { date: string }) => r.date))
      const toInsert = newDates.filter(d => !existingSet.has(d))
      if (!toInsert.length) { updated[i] = { ...s, lastGenerated: newDates[newDates.length - 1] }; changed = true; continue }
      const { error } = await supabase.from('income').insert(
        toInsert.map(date => ({ user_id: userId, name: s.name, amount: s.amount, date, source: 'Projects', bank_id: s.bankId ?? null }))
      )
      if (!error) { updated[i] = { ...s, lastGenerated: newDates[newDates.length - 1] }; changed = true }
    }
    if (changed) { setRevStreams(updated); try { localStorage.setItem('revenue-streams', JSON.stringify(updated)) } catch {} ; loadIncome() }
  }

  async function autoGenerateInterest(userId: string) {
    const cfg: Record<string, BankCfgEntry> = (() => {
      try { return JSON.parse(localStorage.getItem('bank-cfg') ?? '{}') } catch { return {} }
    })()
    const today = localToday()
    const next  = { ...cfg }
    let changed = false
    for (const [bankId, conf] of Object.entries(cfg)) {
      if (!conf.apy || !conf.balance || !conf.nextInterestDate) continue
      if (conf.nextInterestDate > today) continue
      const freq    = conf.interestFreq ?? 'Monthly'
      const divisor = freq === 'Quarterly' ? 4 : 12
      const amount  = parseFloat((conf.balance * conf.apy / 100 / divisor).toFixed(2))
      const bank    = banksRef.current.find(b => b.id === bankId)
      const { error } = await supabase.from('income').insert({
        user_id: userId, name: `${bank?.name ?? 'Bank'} Interest`,
        amount, date: conf.nextInterestDate, source: 'Other', bank_id: bankId,
      })
      if (!error) { next[bankId] = { ...conf, nextInterestDate: advanceByFreq(conf.nextInterestDate, freq) }; changed = true }
    }
    if (changed) { saveBankCfg(next); loadIncome() }
  }

  function saveStreams(streams: RevenueStreamConfig[]) {
    try { localStorage.setItem('revenue-streams', JSON.stringify(streams)) } catch {}
  }

  function handleStreamDone(config: RevenueStreamConfig) {
    setRevStreams(prev => {
      const updated = prev.some(s => s.id === config.id)
        ? prev.map(s => s.id === config.id ? config : s)
        : [...prev, config]
      saveStreams(updated)
      return updated
    })
    loadIncome()
  }

  function handleDeleteStream(id: string) {
    const snapshot = revStreams.slice()
    const updated  = revStreams.filter(s => s.id !== id)
    setRevStreams(updated)
    saveStreams(updated)
    showToast('Stream removed', {
      type: 'delete',
      undo: { onUndo: () => { setRevStreams(snapshot); saveStreams(snapshot) }, onCommit: () => {} },
    })
  }

  function handleDeleteIncome(id: string) {
    const row = incomeList.find(i => i.id === id)
    if (!row) return
    const snapshot = incomeList.slice()
    pendingDeleteIds.current.add(id)
    setIncomeList(prev => prev.filter(i => i.id !== id))
    // Delete immediately so navigating away doesn't lose the commit
    supabase.from('income').delete().eq('id', id)
    showToast(`${row.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo: () => {
          pendingDeleteIds.current.delete(id)
          setIncomeList(snapshot)
          supabase.from('income').insert({
            id, name: row.name, amount: row.amount, date: row.date,
            source: row.source, bank_id: row.bank_id,
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
      undo: { onUndo: () => setCards(snapshot), onCommit: () => { supabase.from('cards').delete().eq('id', id) } },
    })
  }

  function handleDeleteBank(id: string) {
    const bank = banks.find(b => b.id === id)
    if (!bank) return
    const snapshot = banks.slice()
    setBanks(prev => prev.filter(b => b.id !== id))
    showToast(`${bank.name} deleted`, {
      type: 'delete',
      undo: { onUndo: () => setBanks(snapshot), onCommit: () => { supabase.from('banks').delete().eq('id', id) } },
    })
  }

  function saveBankCfg(next: Record<string, BankCfgEntry>) {
    setBankCfg(next)
    try { localStorage.setItem('bank-cfg', JSON.stringify(next)) } catch {}
  }

  function handleSaveInterestConfig() {
    if (!interestBank) return
    const bal = parseFloat(intBalance)
    const apy = parseFloat(intApy)
    if (isNaN(bal) || bal <= 0) return
    const hasInterest = !isNaN(apy) && apy > 0 && !!intDate
    const entry: BankCfgEntry = {
      ...bankCfg[interestBank.id],
      balance: bal,
      apy:     hasInterest ? apy : 0,
      ...(hasInterest ? { interestFreq: intFreq, nextInterestDate: intDate } : { nextInterestDate: undefined, interestFreq: undefined }),
    }
    saveBankCfg({ ...bankCfg, [interestBank.id]: entry })
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
      texture: newCard.texture, is_default: false, created_at: new Date().toISOString(),
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
    }
    setBanks(prev => [optimistic, ...prev])
    showToast(`${newBank.name} added`, { type: 'add' })
    const { error } = await supabase.from('banks').insert({
      user_id: user.id, name: newBank.name, type: newBank.type, last4: newBank.last4,
    })
    if (error) console.error('bank insert error:', JSON.stringify(error))
    await loadData()
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
      const c = pageCache.get<{ cards: Card[]; banks: Bank[] }>('in')
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

  const incomeGroups = useMemo(() =>
    groupByMonth(incomeList).map(g => ({
      ...g,
      total: g.rows.reduce((s, r) => s + (r as IncomeRow).amount, 0),
    })),
  [incomeList])

  return (
    <>
      <div className="min-h-screen bg-bg-base tab-enter">
        <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />
        <div className="pt-12" />

        <div className="mx-4 mt-4">
          <PillGroup options={['History', 'Streams', 'Accounts'] as Tab[]} value={tab} onChange={setTab} />
        </div>

        {loading && (
          <div className="px-4 mt-5 space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" style={{ aspectRatio: '1.586/1' }} />
            ))}
          </div>
        )}

        {/* ── History ────────────────────────────────────────────────────── */}
        {!loading && tab === 'History' && (
          <div className="mx-4 mt-4 space-y-5">
            {incomeLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-[62px] rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" />
                ))}
              </div>
            ) : incomeGroups.length === 0 ? (
              <div className="py-12 text-center text-ink-faint text-[13px]">No income recorded yet — tap + to add.</div>
            ) : (
              <>
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
        )}

        {/* ── Streams ────────────────────────────────────────────────────── */}
        {!loading && tab === 'Streams' && (
          <div className="mx-4 mt-4 space-y-5">
            {/* Revenue Streams */}
            {revStreams.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Revenue Streams</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {revStreams.map(stream => {
                    const next = stream.lastGenerated ? nextPayDate(stream.lastGenerated, stream.freq) : stream.startDate
                    return (
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
                            <p className="text-[11px] text-ink-muted">{daysUntilLabel(next)}</p>
                          </div>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Interest Streams */}
            {Object.entries(bankCfg).filter(([, c]) => c.apy && c.balance).length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Interest</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {Object.entries(bankCfg)
                    .filter(([, c]) => c.apy && c.balance)
                    .map(([bankId, cfg]) => {
                      const bank    = banks.find(b => b.id === bankId)
                      if (!bank) return null
                      const freq    = cfg.interestFreq ?? 'Monthly'
                      const divisor = freq === 'Quarterly' ? 4 : 12
                      const amount  = parseFloat((cfg.balance * cfg.apy / 100 / divisor).toFixed(2))
                      return (
                        <SwipeToDelete key={bankId} onDelete={() => {
                          const next = { ...bankCfg }; delete next[bankId]; saveBankCfg(next)
                        }} onTap={() => setInterestBank(bank)}>
                          <div className="flex items-center gap-3 px-4 py-3.5">
                            <div className="w-10 h-10 rounded-[12px] bg-emerald/10 flex items-center justify-center text-lg flex-shrink-0">🏦</div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[14px] font-medium text-ink truncate">{bank.name} Interest</p>
                              <p className="text-[11px] text-ink-muted">{cfg.apy}% APY · {freq}</p>
                            </div>
                            <div className="text-right flex-shrink-0">
                              <p className="text-[13px] font-semibold font-mono text-emerald">+{$fd(amount)}</p>
                              <p className="text-[10px] text-ink-faint">{cfg.nextInterestDate ? daysUntilLabel(cfg.nextInterestDate) : 'not scheduled'}</p>
                            </div>
                          </div>
                        </SwipeToDelete>
                      )
                    })}
                </div>
              </div>
            )}

            {revStreams.length === 0 && !Object.values(bankCfg).some(c => c.apy) && (
              <div className="py-12 text-center">
                <p className="text-[13px] text-ink-faint">No streams yet — tap + to add one.</p>
              </div>
            )}
          </div>
        )}

        {/* ── Accounts ───────────────────────────────────────────────────── */}
        {!loading && tab === 'Accounts' && (
          <div className="mx-4 mt-4 space-y-5">
            {/* Banks */}
            {banks.length > 0 && (
              <div>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Banks</p>
                <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                  {banks.map(bank => {
                    const linked = cards.filter(c => c.bank_id === bank.id)
                    const cfg    = bankCfg[bank.id]
                    return (
                      <SwipeToDelete key={bank.id} onDelete={() => handleDeleteBank(bank.id)} onTap={() => setInterestBank(bank)}>
                        <div className="flex items-center gap-3 px-4 py-4 bg-bg-surface">
                          <div className="w-10 h-10 rounded-[10px] bg-bg-overlay flex items-center justify-center text-lg flex-shrink-0">🏦</div>
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-medium text-ink">{bank.name}</p>
                            <p className="text-[11px] text-ink-muted">
                              {bank.type ?? 'Bank'}{bank.last4 ? ` · ••••${bank.last4}` : ''}
                              {cfg?.apy ? ` · ${cfg.apy}% APY` : ''}
                            </p>
                          </div>
                          <div className="text-right flex-shrink-0">
                            <p className="text-[12px] text-ink-faint">{linked.length} {linked.length === 1 ? 'card' : 'cards'}</p>
                            {cfg?.balance ? <p className="text-[12px] font-mono text-emerald">{$fd(cfg.balance)}</p> : null}
                          </div>
                        </div>
                      </SwipeToDelete>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Cards */}
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

      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      {tab === 'Accounts' && fabOpen && (
        <div className="fixed inset-0" style={{ zIndex: 39 }} onClick={() => setFabOpen(false)} />
      )}
      {tab === 'Accounts' && fabOpen && (
        <div className="fixed flex flex-col gap-3" style={{ right: 16, bottom: 148, zIndex: 41, width: 120 }}>
          <button className="w-full" onClick={() => { setFabOpen(false); setBankSheetOpen(true) }}
            style={{ animation: 'fab-item-in 0.32s cubic-bezier(0.34,1.56,0.64,1) 0.06s both' }}>
            <span className="block w-full text-center text-[13px] font-semibold text-white gradient-gold rounded-full py-2 shadow-lg">Bank</span>
          </button>
          <button className="w-full" onClick={() => { setFabOpen(false); setCardSheetOpen(true) }}
            style={{ animation: 'fab-item-in 0.32s cubic-bezier(0.34,1.56,0.64,1) 0s both' }}>
            <span className="block w-full text-center text-[13px] font-semibold text-white gradient-gold rounded-full py-2 shadow-lg">Card</span>
          </button>
        </div>
      )}
      <button
        onClick={() => {
          if (tab === 'History')  { setIncomeOpen(true); return }
          if (tab === 'Streams')  { setEditStream(null); setStreamOpen(true); return }
          setFabOpen(f => !f)
        }}
        className="fixed gradient-gold rounded-full flex items-center justify-center text-white font-light select-none"
        style={{ right: 16, bottom: 80, width: 56, height: 56, fontSize: 28, zIndex: 40,
                 boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)',
                 transform: tab === 'Accounts' && fabOpen ? 'rotate(45deg)' : undefined, transition: 'transform 0.2s ease' }}
        aria-label="Add"
      >+</button>

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

      {/* ── Bank interest sheet ─────────────────────────────────────────── */}
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
          {/* Balance */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Current Balance</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={intBalance}
                onChange={e => setIntBalance(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint" />
            </div>
          </div>
          {/* APY — optional */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">APY (%) <span className="normal-case tracking-normal text-ink-faint/60">— optional</span></p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <input type="number" inputMode="decimal" placeholder="4.30" value={intApy}
                onChange={e => setIntApy(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint" />
              <span className="text-[22px] font-light text-ink-muted font-mono">%</span>
            </div>
          </div>
          {/* Frequency + date — only when APY is set */}
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
                <div className="overflow-hidden rounded-[14px]">
                  <input type="date" value={intDate} onChange={e => setIntDate(e.target.value)}
                    className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none focus:border-gold/40"
                    style={{ colorScheme: 'dark' }} />
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

      {/* ── Card detail sheet ────────────────────────────────────────────── */}
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
            >
              Edit
            </button>
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
