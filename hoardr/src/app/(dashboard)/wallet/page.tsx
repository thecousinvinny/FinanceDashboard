'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
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

interface CardExpense {
  id:         string
  name:       string
  cost:       number
  date:       string
  categories: { name: string } | null
}

type Tab = 'Cards' | 'Banks'

export default function WalletPage() {
  const [tab,             setTab]           = useState<Tab>('Cards')
  const [cards,           setCards]         = useState<Card[]>([])
  const [banks,           setBanks]         = useState<Bank[]>([])
  const [loading,         setLoading]       = useState(true)
  const [sheetOpen,       setSheetOpen]     = useState(false)
  const [selectedCard,    setSelectedCard]  = useState<Card | null>(null)
  const [editCard,        setEditCard]      = useState<Card | null>(null)
  const [editSheetOpen,   setEditSheetOpen] = useState(false)
  const [cardExpenses,    setCardExpenses]  = useState<CardExpense[]>([])
  const [expLoading,      setExpLoading]    = useState(false)

  const supabase = useMemo(() => createClient(), [])

  const loadData = useCallback(async () => {
    const [{ data: cardsData }, { data: banksData }] = await Promise.all([
      supabase
        .from('cards')
        .select('*, bank:banks(id, name, type, last4)')
        .order('is_default', { ascending: false })
        .order('created_at',  { ascending: false }),
      supabase
        .from('banks')
        .select('*')
        .order('created_at', { ascending: false }),
    ])
    setCards((cardsData ?? []) as Card[])
    setBanks((banksData  ?? []) as Bank[])
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadData() }, [loadData])

  useEffect(() => {
    if (!selectedCard) { setCardExpenses([]); return }
    setExpLoading(true)
    supabase
      .from('expenses')
      .select('id, name, cost, date, categories(name)')
      .eq('card_id', selectedCard.id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        setCardExpenses((data ?? []) as unknown as CardExpense[])
        setExpLoading(false)
      })
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

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <div className="px-5 pt-14 pb-0 flex items-start justify-between">
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Wallet</p>
            <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Wallet</h1>
          </div>
          <button
            onClick={() => setSheetOpen(true)}
            className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light shadow-gold mt-10 select-none"
            aria-label="Add"
          >
            +
          </button>
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
            {cards.map(card => (
              <SwipeToDelete key={card.id} onDelete={() => handleDeleteCard(card.id)} onTap={() => setSelectedCard(card)} className="rounded-card">
                <div className="active:scale-[0.98] transition-transform duration-75">
                  <CardVisual card={card} />
                </div>
              </SwipeToDelete>
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
          const mo  = cardExpenses.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
          const yr  = cardExpenses.filter(e => e.date >= yearStart ).reduce((s, e) => s + Number(e.cost), 0)
          const all = cardExpenses.reduce((s, e) => s + Number(e.cost), 0)
          return (
            <div className="grid grid-cols-3 gap-2 px-5 mb-4">
              {[['This Month', mo], ['This Year', yr], ['All Time', all]].map(([label, val]) => (
                <div key={label as string} className="bg-bg-overlay rounded-[14px] px-3 py-3">
                  <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
                  <p className="text-[14px] font-bold font-mono text-gold">{$fk(val as number)}</p>
                </div>
              ))}
            </div>
          )
        })()}

        <div className="overflow-y-auto" style={{ maxHeight: '50vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
          {expLoading ? (
            <div className="px-4 space-y-2.5 pb-4">
              {[1,2,3].map(i => <div key={i} className="h-14 rounded-[18px] skeleton" />)}
            </div>
          ) : cardExpenses.length === 0 ? (
            <div className="py-12 text-center text-ink-faint text-[13px]">No expenses on this card yet.</div>
          ) : (
            <div className="px-4 space-y-2.5 pb-4">
              {cardExpenses.map(exp => (
                <div key={exp.id} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
                  <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <CategoryIcon category={exp.categories?.name ?? 'Other'} type="Expense" size={15} className="text-gold" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink truncate">{exp.name}</p>
                    <p className="text-[11px] text-ink-muted">{fmtDate(exp.date)}</p>
                  </div>
                  <p className="text-[15px] font-semibold font-mono text-ink flex-shrink-0">−{$fc(exp.cost)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}

