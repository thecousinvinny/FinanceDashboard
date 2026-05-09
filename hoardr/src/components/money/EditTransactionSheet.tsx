'use client'

import { useState, useEffect } from 'react'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type SeedTx,
} from '@/lib/data/transactions'
import { cn } from '@/lib/utils'
import type { CardOption, BankOption } from './AddTransactionSheet'

export interface TxEdits {
  name:     string
  amount:   number
  category: string
  date:     string
  card_id:  string | null
  bank_id:  string | null
}

interface Props {
  tx:      SeedTx | null
  open:    boolean
  onClose: () => void
  onSave:  (id: string, edits: TxEdits) => void
  cards?:  CardOption[]
  banks?:  BankOption[]
}

export function EditTransactionSheet({ tx, open, onClose, onSave, cards = [], banks = [] }: Props) {
  const [amount,   setAmount]   = useState('')
  const [name,     setName]     = useState('')
  const [category, setCategory] = useState<string | null>(null)
  const [date,     setDate]     = useState('')
  const [cardId,   setCardId]   = useState<string | null>(null)
  const [bankId,   setBankId]   = useState<string | null>(null)

  useEffect(() => {
    if (tx) {
      setAmount(String(tx.amount))
      setName(tx.name)
      setCategory(tx.category)
      setDate(tx.date)
      setCardId(tx.card_id ?? null)
      setBankId(tx.bank_id ?? null)
    }
  }, [tx])

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setAmount(''); setName(''); setCategory(null); setDate('')
        setCardId(null); setBankId(null)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }

  function handleSave() {
    const parsed = parseFloat(amount)
    if (!parsed || !name.trim() || !category || !tx) return
    onSave(tx.id, {
      name: name.trim(), amount: parsed, category, date,
      card_id: tx.type === 'Expense' ? cardId : null,
      bank_id: tx.type === 'Income'  ? bankId : null,
    })
    onClose()
  }

  const canSave    = !!parseFloat(amount) && !!name.trim() && !!category
  const categories = tx?.type === 'Expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 mb-5">
          <div>
            <h2 className="text-[18px] font-bold tracking-tight text-ink">Edit Transaction</h2>
            {tx && (
              <span className={cn(
                'text-[10px] font-semibold px-2 py-0.5 rounded-full',
                tx.type === 'Income' ? 'bg-emerald/10 text-emerald' : 'bg-ruby/10 text-ruby',
              )}>
                {tx.type}
              </span>
            )}
          </div>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Amount</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-3">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-[28px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              {tx?.type === 'Expense' ? 'Merchant' : 'Source'}
            </p>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Category</p>
            <div className="grid grid-cols-4 gap-2">
              {categories.map(cat => (
                <button
                  key={cat.name} onClick={() => setCategory(cat.name)}
                  className={cn(
                    'flex flex-col items-center gap-1.5 py-3 rounded-[14px] transition-all select-none',
                    category === cat.name ? 'bg-gold/15 ring-1 ring-gold/40' : 'bg-bg-overlay',
                  )}
                >
                  <span className="text-[20px] leading-none">{cat.emoji}</span>
                  <span className="text-[9px] font-medium text-ink-muted leading-tight text-center px-0.5">{cat.name}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Card picker (expenses) */}
          {tx?.type === 'Expense' && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Card</p>
              {cards.length === 0 ? (
                <p className="text-[12px] text-ink-faint py-2">No cards yet — add one in Wallet</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5">
                  <button
                    onClick={() => setCardId(null)}
                    className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none', cardId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}
                  >
                    None
                  </button>
                  {cards.map(c => (
                    <button
                      key={c.id} onClick={() => setCardId(c.id)}
                      className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none', cardId === c.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}
                    >
                      {c.name}{c.last4 ? ` ••••${c.last4}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Bank picker (income) */}
          {tx?.type === 'Income' && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Bank</p>
              {banks.length === 0 ? (
                <p className="text-[12px] text-ink-faint py-2">No banks yet — add one in Wallet</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5">
                  <button
                    onClick={() => setBankId(null)}
                    className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none', bankId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}
                  >
                    None
                  </button>
                  {banks.map(b => (
                    <button
                      key={b.id} onClick={() => setBankId(b.id)}
                      className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none', bankId === b.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}
                    >
                      {b.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Date</p>
            <input
              type="date" value={date} onChange={e => setDate(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none"
            />
          </div>

          <button
            onClick={handleSave} disabled={!canSave}
            className={cn(
              'w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canSave ? 'gradient-gold text-white shadow-gold' : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  )
}
