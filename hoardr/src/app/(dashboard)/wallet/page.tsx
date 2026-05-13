'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { PillGroup } from '@/components/ui/Pill'
import { AddCardSheet, type NewCard } from '@/components/wallet/AddCardSheet'
import { AddBankSheet, type NewBank } from '@/components/wallet/AddBankSheet'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { Card, Bank } from '@/types'
import type { CardStyle } from '@/types'
import { cn, $fc, fmtDate } from '@/lib/utils'

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
      style: newCard.style, is_default: false, created_at: new Date().toISOString(),
    }
    setCards(prev => [optimistic, ...prev])

    const { error } = await supabase.from('cards').insert({
      user_id: user.id, bank_id: newCard.bank_id, name: newCard.name,
      alias: newCard.alias, type: newCard.type, last4: newCard.last4,
      network: newCard.network, expires: newCard.expires,
      cardholder: newCard.cardholder, style: newCard.style, is_default: false,
    })
    if (error) console.error('card insert error:', JSON.stringify(error))
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
                <CardVisual card={card} />
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
            <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink-faint">Card Expenses</p>
            <h2 className="text-[18px] font-bold tracking-tight text-ink">{selectedCard?.name}</h2>
          </div>
          <button onClick={() => setSelectedCard(null)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 24px)' }}>
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

/* ── Card visual ───────────────────────────────────────────────────────────── */

function CardVisual({ card }: { card: Card }) {
  const { name, alias, type, last4, expires, cardholder, network, style, is_default } = card
  const isGold  = style === 'gold'
  const isGreen = style === 'green'

  const containerStyle: React.CSSProperties = isGold
    ? { background: 'linear-gradient(135deg, #b8860b 0%, #d4af37 40%, #f0d060 60%, #c8952a 100%)' }
    : {}

  const containerClass = cn(
    'relative rounded-card border overflow-hidden p-5 flex flex-col justify-between aspect-[1.586/1]',
    isGold  ? 'border-yellow-600/30'            : '',
    isGreen ? 'bg-[#0c2d1c] border-emerald/20'  : '',
    !isGold && !isGreen ? 'bg-[#13131f] border-white/[0.08]' : '',
  )

  const t1 = isGold ? 'text-yellow-950'    : 'text-ink-muted'
  const t2 = isGold ? 'text-yellow-900/70' : 'text-ink-faint'
  const t3 = isGold ? 'text-yellow-950'    : 'text-ink'
  const chipFill   = isGold ? '#8B7030' : '#3a3a4a'
  const chipStroke = isGold ? '#6b5a20' : '#2a2a3a'

  return (
    <div className={containerClass} style={containerStyle}>
      {is_default && (
        <span className="absolute top-3 right-3 text-[8px] font-bold tracking-widest uppercase bg-black/20 px-2 py-0.5 rounded-full text-white/60">
          Default
        </span>
      )}

      <div className="flex items-center justify-between">
        <div>
          <p className={`text-[11px] font-bold tracking-[0.22em] ${t1}`}>{name}</p>
          {alias && <p className={`text-[9px] tracking-wide mt-0.5 ${t2}`}>{alias}</p>}
        </div>
        <p className={`text-[9px] font-medium tracking-[0.12em] uppercase ${t2}`}>{type ?? ''}</p>
      </div>

      <div className="flex items-center gap-3 mt-3">
        <svg width="38" height="30" viewBox="0 0 38 30" className="opacity-75">
          <rect width="38" height="30" rx="4" fill={chipFill}/>
          <line x1="13" y1="0"  x2="13" y2="30" stroke={chipStroke} strokeWidth="1"/>
          <line x1="25" y1="0"  x2="25" y2="30" stroke={chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="10" x2="38" y2="10" stroke={chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="20" x2="38" y2="20" stroke={chipStroke} strokeWidth="1"/>
          <rect x="13" y="10" width="12" height="10" fill={chipStroke} opacity="0.4"/>
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={t2}>
          <path d="M5 12.5a9 9 0 0114 0M1.5 9A14 14 0 0122.5 9M8.5 16a5 5 0 017 0M12 20h.01"/>
        </svg>
      </div>

      <p className={`text-[14px] font-mono tracking-[0.28em] mt-3 ${t1}`}>
        •••• •••• •••• {last4 ?? '????'}
      </p>

      <div className="flex items-end justify-between mt-auto">
        <div className="flex gap-5">
          <div>
            <p className={`text-[7px] tracking-[0.1em] uppercase mb-0.5 ${t2}`}>Cardholder</p>
            <p className={`text-[10px] font-medium tracking-wider ${t1}`}>{cardholder ?? ''}</p>
          </div>
          {expires && (
            <div>
              <p className={`text-[7px] tracking-[0.1em] uppercase mb-0.5 ${t2}`}>Expires</p>
              <p className={`text-[10px] font-medium ${t1}`}>{expires}</p>
            </div>
          )}
        </div>
        <p className={`text-[15px] font-bold italic ${t3}`}>{network ?? ''}</p>
      </div>
    </div>
  )
}
