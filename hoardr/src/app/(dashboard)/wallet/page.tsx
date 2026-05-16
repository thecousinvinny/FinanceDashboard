'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddCardSheet, type NewCard } from '@/components/wallet/AddCardSheet'
import { AddBankSheet, type NewBank } from '@/components/wallet/AddBankSheet'
import { EditCardSheet, type CardEdits } from '@/components/wallet/EditCardSheet'
import { CardVisual } from '@/components/wallet/CardVisual'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

import type { Card, Bank } from '@/types'
import { cn, $fc, $fk, fmtDate } from '@/lib/utils'
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
  const [reorderMode,     setReorderMode]   = useState(false)

  const supabase    = useMemo(() => createClient(), [])
  const loadGen     = useRef(0)
  const detailGen   = useRef(0)

  const loadData = useCallback(async () => {
    const gen = ++loadGen.current
    const [{ data: cardsData }, { data: banksData }] = await Promise.all([
      supabase
        .from('cards')
        .select('*, bank:banks(id, name, type, last4)')
        .order('sort_order',  { ascending: true,  nullsFirst: false })
        .order('is_default',  { ascending: false })
        .order('created_at',  { ascending: false }),
      supabase
        .from('banks')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
    const newCards = (cardsData ?? []) as Card[]
    const newBanks = (banksData  ?? []) as Bank[]
    if (gen !== loadGen.current) return
    setCards(newCards)
    setBanks(newBanks)
    pageCache.set('wallet', { cards: newCards, banks: newBanks })
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData(); return () => { loadGen.current++ } }, [loadData])

  const { distance: pullDist, refreshing: pullRefreshing, threshold: pullThreshold } =
    usePullToRefresh(loadData)

  useEffect(() => {
    if (!selectedCard) { setCardExpenses([]); setCardSubs([]); return }
    const gen = ++detailGen.current
    setExpLoading(true)
    async function loadDetail() {
      const [{ data: expData }, { data: subData }] = await Promise.all([
        supabase
          .from('expenses')
          .select('id, name, cost, date, categories(name)')
          .eq('card_id', selectedCard!.id)
          .order('date', { ascending: false })
          .order('created_at', { ascending: false }),
        supabase
          .from('subscriptions')
          .select('id, name, cost, billing, monthly_cost, next_renewal, category')
          .eq('card_id', selectedCard!.id)
          .order('next_renewal', { ascending: true }),
      ])
      if (gen !== detailGen.current) return
      setCardExpenses((expData ?? []) as unknown as CardExpense[])
      setCardSubs((subData ?? []).map(s => ({
        id:           String(s.id),
        name:         String(s.name),
        cost:         Number(s.cost),
        billing:      String(s.billing),
        monthly_cost: Number(s.monthly_cost ?? 0),
        next_renewal: s.next_renewal ? String(s.next_renewal) : null,
        category:     s.category ? String(s.category) : null,
      })))
      setExpLoading(false)
    }
    loadDetail()
    return () => { detailGen.current++ }
  }, [selectedCard, supabase])

  async function handleDeleteCard(id: string) {
    setCards(prev => prev.filter(c => c.id !== id))
    const { error } = await supabase.from('cards').delete().eq('id', id)
    if (error) { console.error('delete card error:', JSON.stringify(error)); await loadData() }
  }

  async function handleDeleteBank(id: string) {
    setBanks(prev => prev.filter(b => b.id !== id))
    const { error } = await supabase.from('banks').delete().eq('id', id)
    if (error) { console.error('delete bank error:', JSON.stringify(error)); await loadData() }
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

  async function handleMoveCard(id: string, dir: 'up' | 'down') {
    const idx = cards.findIndex(c => c.id === id)
    if (idx === -1) return
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= cards.length) return

    const reordered = [...cards]
    ;[reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]]
    setCards(reordered)

    await Promise.all(
      reordered.map((c, i) => supabase.from('cards').update({ sort_order: i }).eq('id', c.id))
    )
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
      id: `tmp-${Date.now()}`, user_id: user.id,
      name: newBank.name, type: newBank.type, last4: newBank.last4,
      created_at: new Date().toISOString(),
    }
    setBanks(prev => [optimistic, ...prev])

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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 pt-14 pb-0 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Wallet</p>
            <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Wallet</h1>
          </div>
          <div className="flex items-center gap-2 mt-10">
            {tab === 'Cards' && cards.length > 1 && (
              <button
                onClick={() => setReorderMode(v => !v)}
                className={cn(
                  'h-8 px-3 rounded-full text-[11px] font-medium select-none transition-colors',
                  reorderMode ? 'bg-gold/20 text-gold' : 'bg-bg-overlay text-ink-muted'
                )}
              >
                {reorderMode ? 'Done' : 'Reorder'}
              </button>
            )}
            <button
              onClick={() => setSheetOpen(true)}
              className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light select-none"
              aria-label="Add"
            >
              +
            </button>
          </div>
        </div>

        {/* ── Tab toggle ─────────────────────────────────────────────────── */}
        <div className="mx-4 mt-5">
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
          <div className="px-4 mt-5 flex flex-col gap-4">
            {cards.length === 0 && (
              <div className="py-12 text-center text-ink-faint text-[13px]">
                No cards yet — add your first one above.
              </div>
            )}
            {cards.map((card, idx) => (
              <div key={card.id}>
                <SwipeToDelete onDelete={() => handleDeleteCard(card.id)} onTap={reorderMode ? undefined : () => setSelectedCard(card)} className="rounded-card">
                  <div className={cn('transition-transform duration-75', !reorderMode && 'active:scale-[0.98]')}>
                    <CardVisual card={card} />
                  </div>
                </SwipeToDelete>
                {reorderMode && (
                  <div className="flex justify-end gap-2 mt-2 pr-1">
                    <button
                      onClick={() => handleMoveCard(card.id, 'up')}
                      disabled={idx === 0}
                      className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center text-ink-muted disabled:opacity-30 select-none"
                    >
                      ↑
                    </button>
                    <button
                      onClick={() => handleMoveCard(card.id, 'down')}
                      disabled={idx === cards.length - 1}
                      className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center text-ink-muted disabled:opacity-30 select-none"
                    >
                      ↓
                    </button>
                  </div>
                )}
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
                  {[['Sub / Mo', subMo], ['Sub / Yr', subYr], ['All Time', subAllTime]].map(([label, val]) => (
                    <div key={label as string} className="bg-bg-overlay rounded-[14px] px-3 py-3">
                      <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
                      <p className="text-[14px] font-bold font-mono text-emerald">
                        {$fk(val as number)}
                      </p>
                    </div>
                  ))}
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
              <div className="px-4 space-y-2.5 pb-4">
                {cardExpenses.map(exp => {
                  const isSub = subNameSet.has(exp.name.toLowerCase())
                  return (
                    <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
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
                        −{$fc(exp.cost)}
                      </p>
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </div>
      </div>
    </>
  )
}

