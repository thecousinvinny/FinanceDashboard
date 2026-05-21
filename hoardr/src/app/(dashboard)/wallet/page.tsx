'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { flushSync } from 'react-dom'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddCardSheet, type NewCard } from '@/components/wallet/AddCardSheet'
import { AddBankSheet, type NewBank } from '@/components/wallet/AddBankSheet'
import { EditCardSheet, type CardEdits } from '@/components/wallet/EditCardSheet'
import { CardVisual } from '@/components/wallet/CardVisual'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

import type { Card, Bank } from '@/types'
import { cn, $fd, $fk, fmtDate, haptic } from '@/lib/utils'
import { showToast } from '@/lib/toast'
import { pageCache } from '@/lib/page-cache'
import { PullIndicator } from '@/components/ui/PullIndicator'
import { usePullToRefresh } from '@/hooks/usePullToRefresh'

interface CardExpense {
  id:         string
  name:       string
  cost:       number
  date:       string
  categories: { name: string } | null
}

interface CardSub {
  id:           string
  name:         string
  cost:         number
  billing:      string
  monthly_cost: number
  annual_cost:  number
  next_renewal: string | null
  category:     string | null
}

type Tab = 'Cards' | 'Banks'

export default function WalletPage() {
  const [tab,             setTab]           = useState<Tab>('Cards')
  type WalletCache = { cards: Card[]; banks: Bank[] }
  const cached = pageCache.get<WalletCache>('wallet')
  const [cards,           setCards]         = useState<Card[]>(cached?.cards ?? [])
  const [banks,           setBanks]         = useState<Bank[]>(cached?.banks ?? [])
  const [loading,         setLoading]       = useState(!cached)
  const [sheetOpen,       setSheetOpen]     = useState(false)
  const [selectedCard,    setSelectedCard]  = useState<Card | null>(null)
  const [editCard,        setEditCard]      = useState<Card | null>(null)
  const [editSheetOpen,   setEditSheetOpen] = useState(false)
  const [cardExpenses,    setCardExpenses]  = useState<CardExpense[]>([])
  const [cardSubs,        setCardSubs]      = useState<CardSub[]>([])
  const [expLoading,      setExpLoading]    = useState(false)
  const [cardStats,       setCardStats]     = useState<Record<string, { expenses: number; subs: number }>>({})
  const [draggingId,      setDraggingId]    = useState<string | null>(null)
  const [dragCards,       setDragCards]     = useState<Card[]>([])

  const supabase        = useMemo(() => createClient(), [])
  const loadGen         = useRef(0)
  const abortRef        = useRef<AbortController | null>(null)
  const detailGen       = useRef(0)
  const detailAbortRef  = useRef<AbortController | null>(null)

  const containerRef        = useRef<HTMLDivElement | null>(null)
  const cardsRef            = useRef<Card[]>(cards)
  const draggingIdRef       = useRef<string | null>(null)
  const isDraggingRef       = useRef(false)
  const justEndedDragRef    = useRef(false)
  const lpTimerRef          = useRef<ReturnType<typeof setTimeout> | null>(null)
  const workingRef          = useRef<Card[]>([])
  const dragStartYRef       = useRef(0)
  const dragStartXRef       = useRef(0)
  const dragStartIdxRef     = useRef(0)
  const dragCurrentIdxRef   = useRef(0)
  const dragCardHRef        = useRef(0)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const gen = ++loadGen.current
    try {
      const [{ data: cardsData }, { data: banksData }, { data: expCardIds }, { data: subCardIds }] = await Promise.all([
        supabase
          .from('cards')
          .select('*, bank:banks(id, name, type, last4)')
          .order('sort_order',  { ascending: true,  nullsFirst: false })
          .order('is_default',  { ascending: false })
          .order('created_at',  { ascending: false })
          .abortSignal(controller.signal),
        supabase
          .from('banks')
          .select('*')
          .order('created_at', { ascending: false })
          .abortSignal(controller.signal),
        supabase.from('expenses').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
        supabase.from('subscriptions').select('card_id').not('card_id', 'is', null).abortSignal(controller.signal),
      ])
      const newCards = (cardsData ?? []) as Card[]
      const newBanks = (banksData  ?? []) as Bank[]
      // Build per-card counts
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
      pageCache.set('wallet', { cards: newCards, banks: newBanks })
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('loadData error:', err)
    }
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++; abortRef.current?.abort() } }, [loadData])
  useEffect(() => { cardsRef.current = cards }, [cards])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

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
          supabase
            .from('expenses')
            .select('id, name, cost, date, categories(name)')
            .eq('card_id', selectedCard!.id)
            .order('date', { ascending: false })
            .order('created_at', { ascending: false })
            .abortSignal(detailController.signal),
          supabase
            .from('subscriptions')
            .select('id, name, cost, billing, monthly_cost, annual_cost, next_renewal, category')
            .eq('card_id', selectedCard!.id)
            .order('next_renewal', { ascending: true })
            .abortSignal(detailController.signal),
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
      undo: {
        onUndo:   () => setCards(snapshot),
        onCommit: () => { supabase.from('cards').delete().eq('id', id) },
      },
    })
  }

  function handleDeleteBank(id: string) {
    const bank = banks.find(b => b.id === id)
    if (!bank) return
    const snapshot = banks.slice()
    setBanks(prev => prev.filter(b => b.id !== id))
    showToast(`${bank.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo:   () => setBanks(snapshot),
        onCommit: () => { supabase.from('banks').delete().eq('id', id) },
      },
    })
  }

  async function handleAddCard(newCard: NewCard) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const optimistic: Card = {
      id: `tmp-${Date.now()}`, user_id: user.id,
      bank_id: newCard.bank_id, name: newCard.name, alias: newCard.alias,
      type: newCard.type, last4: newCard.last4, network: newCard.network,
      expires: newCard.expires, cardholder: newCard.cardholder,
      style: newCard.style, texture: newCard.texture,
      is_default: false, created_at: new Date().toISOString(),
    }
    setCards(prev => [optimistic, ...prev])
    showToast(`${newCard.name} added`, { type: 'add' })

    const { error } = await supabase.from('cards').insert({
      user_id: user.id, bank_id: newCard.bank_id, name: newCard.name,
      alias: newCard.alias, type: newCard.type, last4: newCard.last4,
      network: newCard.network, expires: newCard.expires,
      cardholder: newCard.cardholder, style: newCard.style,
      texture: newCard.texture, is_default: false,
    })
    if (error) console.error('card insert error:', JSON.stringify(error))
    await loadData()
  }

  async function handleSaveCard(id: string, edits: CardEdits) {
    setCards(prev => prev.map(c => c.id === id ? { ...c, ...edits } : c))
    const { error } = await supabase.from('cards').update(edits).eq('id', id)
    if (error) { console.error('update card error:', JSON.stringify(error)); await loadData() }
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
      const touch = e.touches[0]
      const cardId = getCardId(touch)
      if (!cardId) return

      dragStartYRef.current = touch.clientY
      dragStartXRef.current = touch.clientX

      lpTimerRef.current = setTimeout(() => {
        const cur = cardsRef.current
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

        flushSync(() => {
          setDraggingId(cardId)
          setDragCards([...cur])
        })
      }, 450)
    }

    function onTouchMove(e: TouchEvent) {
      const touch = e.touches[0]

      if (!isDraggingRef.current) {
        if (lpTimerRef.current !== null) {
          const dx = Math.abs(touch.clientX - dragStartXRef.current)
          const dy = Math.abs(touch.clientY - dragStartYRef.current)
          if (dx > 8 || dy > 8) {
            clearTimeout(lpTimerRef.current)
            lpTimerRef.current = null
          }
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

      const cached = pageCache.get<{ cards: Card[]; banks: Bank[] }>('wallet')
      if (cached) pageCache.set('wallet', { ...cached, cards: finalOrder })

      Promise.all(finalOrder.map((c, i) =>
        supabase.from('cards').update({ sort_order: i }).eq('id', c.id)
      ))
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
      id: `tmp-${Date.now()}`, user_id: user.id,
      name: newBank.name, type: newBank.type, last4: newBank.last4,
      created_at: new Date().toISOString(),
    }
    setBanks(prev => [optimistic, ...prev])
    showToast(`${newBank.name} added`, { type: 'add' })

    const { error } = await supabase.from('banks').insert({
      user_id: user.id, name: newBank.name, type: newBank.type, last4: newBank.last4,
    })
    if (error) console.error('bank insert error:', JSON.stringify(error))
    await loadData()
  }

  return (
    <>
      <div className="min-h-screen bg-bg-base tab-enter">

        <PullIndicator distance={pullDist} threshold={pullThreshold} refreshing={pullRefreshing} />

        <div className="pt-12" />

        {/* ── Tab toggle ─────────────────────────────────────────────────── */}
        <div className="mx-4 mt-4">
          <PillGroup options={['Cards', 'Banks'] as Tab[]} value={tab} onChange={setTab} />
        </div>

        {/* ── Loading ────────────────────────────────────────────────────── */}
        {loading && (
          <div className="px-4 mt-5 space-y-4">
            {[1, 2].map(i => (
              <div key={i} className="rounded-card bg-bg-surface border border-white/[0.06] animate-pulse" style={{ aspectRatio: '1.586/1' }} />
            ))}
          </div>
        )}

        {/* ── Cards ──────────────────────────────────────────────────────── */}
        {!loading && tab === 'Cards' && (
          <div ref={containerRef} className="px-4 mt-5 flex flex-col gap-4">
            {cards.length === 0 && (
              <div className="py-12 text-center text-ink-faint text-[13px]">
                No cards yet — add your first one above.
              </div>
            )}
            {(draggingId ? dragCards : cards).map(card => (
              <div
                key={card.id}
                data-card-id={card.id}
                style={{
                  position:   'relative',
                  opacity:    draggingId && draggingId !== card.id ? 0.6 : 1,
                  transition: draggingId ? 'opacity 200ms ease' : undefined,
                  zIndex:     draggingId === card.id ? 10 : undefined,
                }}
              >
                <SwipeToDelete
                  onDelete={() => handleDeleteCard(card.id)}
                  onTap={() => { if (justEndedDragRef.current) return; setSelectedCard(card) }}
                  className="rounded-card"
                >
                  <div className={cn('transition-transform duration-75', !draggingId && 'active:scale-[0.98]')}>
                    <CardVisual card={card} expenseCount={cardStats[card.id]?.expenses ?? 0} subCount={cardStats[card.id]?.subs ?? 0} />
                  </div>
                </SwipeToDelete>
              </div>
            ))}
          </div>
        )}

        {/* ── Banks ──────────────────────────────────────────────────────── */}
        {!loading && tab === 'Banks' && (
          <div className="mx-4 mt-4">
            {banks.length === 0 ? (
              <div className="py-12 text-center text-ink-faint text-[13px]">
                No banks yet — add your first one above.
              </div>
            ) : (
              <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
                {banks.map(bank => {
                  const linked = cards.filter(c => c.bank_id === bank.id)
                  return (
                    <SwipeToDelete key={bank.id} onDelete={() => handleDeleteBank(bank.id)}>
                    <div className="flex items-center gap-3 px-4 py-4 bg-bg-surface">
                      <div className="w-10 h-10 rounded-[10px] bg-bg-overlay flex items-center justify-center text-lg flex-shrink-0">🏦</div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink">{bank.name}</p>
                        <p className="text-[11px] text-ink-muted">
                          {bank.type ?? 'Bank'}{bank.last4 ? ` · ••••${bank.last4}` : ''}
                        </p>
                      </div>
                      <p className="text-[12px] text-ink-faint flex-shrink-0">
                        {linked.length} {linked.length === 1 ? 'card' : 'cards'}
                      </p>
                    </div>
                    </SwipeToDelete>
                  )
                })}
              </div>
            )}
          </div>
        )}

        <div className="h-10" />
      </div>

      {/* ── FAB ─────────────────────────────────────────────────────── */}
      <button
        onClick={() => setSheetOpen(true)}
        className="fixed gradient-gold rounded-full flex items-center justify-center text-white font-light select-none"
        style={{ right: 16, bottom: 80, width: 56, height: 56, fontSize: 28, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)' }}
        aria-label="Add"
      >
        +
      </button>

      {tab === 'Cards' && (
        <AddCardSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAdd={handleAddCard}
          banks={banks.map(b => ({ id: b.id, name: b.name }))}
        />
      )}
      {tab === 'Banks' && (
        <AddBankSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          onAdd={handleAddBank}
        />
      )}

      <EditCardSheet
        card={editCard}
        open={editSheetOpen}
        onClose={() => setEditSheetOpen(false)}
        onSave={handleSaveCard}
        onMakeDefault={handleMakeDefault}
        banks={banks.map(b => ({ id: b.id, name: b.name }))}
      />

      {/* ── Card expenses sheet ──────────────────────────────────────────── */}
      <div
        onClick={() => setSelectedCard(null)}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          selectedCard ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          selectedCard ? 'translate-y-0' : 'translate-y-full',
        )}
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

        {/* Stats */}
        {!expLoading && (() => {
          const now        = new Date()
          const monthStart = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-01`
          const yearStart  = `${now.getFullYear()}-01-01`
          const mo   = cardExpenses.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
          const yr   = cardExpenses.filter(e => e.date >= yearStart ).reduce((s, e) => s + Number(e.cost), 0)
          const all  = cardExpenses.reduce((s, e) => s + Number(e.cost), 0)
          const subNames   = new Set(cardSubs.map(s => s.name.toLowerCase()))
          const subExp     = cardExpenses.filter(e => subNames.has(e.name.toLowerCase()))
          const subMo      = subExp.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
          const subYr      = subExp.filter(e => e.date >= yearStart ).reduce((s, e) => s + Number(e.cost), 0)
          const subAllTime = subExp.reduce((s, e) => s + Number(e.cost), 0)
          const estMo      = cardSubs.reduce((s, sub) => s + sub.monthly_cost, 0)
          const estYr      = cardSubs.reduce((s, sub) => s + sub.annual_cost, 0)
          return (
            <>
              {/* Expense stats */}
              <div className="grid grid-cols-3 gap-2 px-5 mb-2">
                {[['This Month', mo], ['This Year', yr], ['All Time', all]].map(([label, val]) => (
                  <div key={label as string} className="bg-bg-overlay rounded-[14px] px-3 py-3">
                    <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
                    <p className="text-[14px] font-bold font-mono text-gold">{$fk(val as number)}</p>
                  </div>
                ))}
              </div>
              {/* Sub stats */}
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
                      <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                        <CategoryIcon
                          category={exp.categories?.name ?? 'Other'}
                          type="Expense"
                          size={15}
                          className={isSub ? 'text-white/60' : 'text-gold'}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[14px] font-medium text-ink truncate">{exp.name}</p>
                        <p className="text-[11px] text-ink-muted">{fmtDate(exp.date)}</p>
                      </div>
                      <p className="text-[15px] font-semibold font-mono flex-shrink-0 text-ink">
                        −{$fd(exp.cost)}
                      </p>
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

