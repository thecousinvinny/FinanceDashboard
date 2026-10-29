'use client'

import { useState, useEffect, useRef } from 'react'
import { CreditCard, Landmark, CalendarDays, Repeat } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import type { BillingCycle } from '@/types'
import type { CardOption, BankOption } from '@/components/money/AddTransactionSheet'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'Weekly',    label: 'Weekly'    },
  { value: 'BiWeekly',  label: 'Every 2 Weeks' },
  { value: 'Monthly',   label: 'Monthly'   },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Annual',    label: 'Yearly'    },
]

export interface NewSub {
  name:         string
  cost:         number
  billing:      BillingCycle
  next_renewal: string
  card_id:      string | null
  bank_id:      string | null
  category:     string | null
}

interface Props {
  open:             boolean
  onClose:          () => void
  onAdd:            (sub: NewSub) => void
  cards?:           CardOption[]
  banks?:           BankOption[]
  defaultCardId?:   string | null
  defaultBilling?:  BillingCycle
}

export function AddSubscriptionSheet({ open, onClose, onAdd, cards = [], banks = [], defaultCardId, defaultBilling }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [billing,     setBilling]     = useState<BillingCycle>('Monthly')
  const [nextRenewal, setNextRenewal] = useState(localToday())
  const [cardId,      setCardId]      = useState<string | null>(null)
  const [bankId,      setBankId]      = useState<string | null>(null)
  const [direct,      setDirect]      = useState(false)
  const [category,    setCategory]    = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setCardId(defaultCardId ?? null)
      setBilling(defaultBilling ?? 'Monthly')
      setDirect(false)
      setBankId(null)
    } else {
      const t = setTimeout(() => {
        setName(''); setAmount(''); setBilling(defaultBilling ?? 'Monthly')
        setNextRenewal(localToday()); setCardId(defaultCardId ?? null); setCategory(null)
        setDirect(false); setBankId(null)
      }, 360)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const canAdd = !!name.trim()

  function handleAdd() {
    if (!canAdd) return
    const parsed = parseFloat(amount) || 0
    onAdd({ name: name.trim(), cost: parsed, billing, next_renewal: nextRenewal, card_id: direct ? null : cardId, bank_id: direct ? bankId : null, category })
    onClose()
  }

  const sortedCards = [...cards].sort((a, b) => (a.id === defaultCardId ? -1 : b.id === defaultCardId ? 1 : 0))
  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)
  const billingLabel = BILLING_OPTIONS.find(o => o.value === billing)?.label ?? billing

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Subscription"
      action={{ label: 'Add', onClick: handleAdd, disabled: !canAdd }}
    >
      <AmountHero
        value={amount}
        onChange={setAmount}
        onEnter={() => nameRef.current?.focus()}
        caption={billingLabel}
      />

      <FormGroup>
        <FormRow label="Name">
          <input
            ref={nameRef}
            type="text" placeholder="Spotify" value={name}
            onChange={e => setName(e.target.value)}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        <Select
          value={billing}
          onChange={e => setBilling(e.target.value as BillingCycle)}
          aria-label="Repeats"
          className="w-full text-left"
          trigger={
            <FormRow icon={Repeat} iconColor="#BF5AF2" label="Repeats" chevron>
              <span>{billingLabel}</span>
            </FormRow>
          }
        >
          {BILLING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <FormRow icon={CalendarDays} iconColor="#FF453A" label="Next renewal">
          <CustomDateInput
            value={nextRenewal}
            onChange={setNextRenewal}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
      </FormGroup>

      <FormGroup footer={direct ? 'Charged straight to a bank account rather than a card.' : undefined}>
        <FormRow label="Pay from bank">
          <Toggle label="Pay from bank" checked={direct} onChange={setDirect} />
        </FormRow>
        {direct ? (
          banks.length === 0 ? (
            <FormRow icon={Landmark} iconColor="#8E8E93" label="Bank">No banks yet</FormRow>
          ) : (
            <Select
              value={bankId ?? ''}
              onChange={e => setBankId(e.target.value || null)}
              aria-label="Bank"
              className="w-full text-left"
              trigger={
                <FormRow icon={Landmark} iconColor="#30B0C7" label="Bank" chevron>
                  <span className="truncate">{bank?.name ?? 'None'}</span>
                </FormRow>
              }
            >
              <option value="">None</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )
        ) : (
          cards.length === 0 ? (
            <FormRow icon={CreditCard} iconColor="#8E8E93" label="Card">No cards yet</FormRow>
          ) : (
            <Select
              value={cardId ?? ''}
              onChange={e => setCardId(e.target.value || null)}
              aria-label="Card"
              className="w-full text-left"
              trigger={
                <FormRow icon={CreditCard} iconColor="#5E5CE6" label="Card" chevron>
                  <span className="truncate">{card ? `${card.name}${card.last4 ? ` •${card.last4}` : ''}` : 'None'}</span>
                </FormRow>
              }
            >
              <option value="">None</option>
              {sortedCards.map(c => (
                <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ••••${c.last4}` : ''}</option>
              ))}
            </Select>
          )
        )}
      </FormGroup>

      <FormGroup header="Category" footer="Optional — tap again to clear.">
        <CategoryPicker categories={EXPENSE_CATEGORIES} value={category} type="Expense" optional onChange={setCategory} />
      </FormGroup>
    </Sheet>
  )
}
