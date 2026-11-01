'use client'

import { useState, useEffect, useRef } from 'react'
import { CreditCard, Landmark, CalendarDays } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import type { BillingCycle, BillingUnit } from '@/types'
import { BillingPicker, billingCaption, type BillingValue } from './BillingPicker'
import type { CardOption, BankOption } from '@/components/money/AddTransactionSheet'
import { expenseCategories } from '@/lib/data/transactions'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'

export interface NewSub {
  name:         string
  cost:         number
  billing:      BillingCycle
  billing_every: number | null
  billing_unit:  BillingUnit | null
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
  const [billing,     setBilling]     = useState<BillingValue>({ billing: 'Monthly', billing_every: null, billing_unit: null })
  const [nextRenewal, setNextRenewal] = useState(localToday())
  const [cardId,      setCardId]      = useState<string | null>(null)
  const [bankId,      setBankId]      = useState<string | null>(null)
  const [direct,      setDirect]      = useState(false)
  const [category,    setCategory]    = useState<string | null>(null)

  const nameRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setCardId(defaultCardId ?? null)
      setBilling({ billing: defaultBilling ?? 'Monthly', billing_every: null, billing_unit: null })
      setDirect(false)
      setBankId(null)
    } else {
      const t = setTimeout(() => {
        setName(''); setAmount(''); setBilling({ billing: defaultBilling ?? 'Monthly', billing_every: null, billing_unit: null })
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
    onAdd({ name: name.trim(), cost: parsed, ...billing, next_renewal: nextRenewal, card_id: direct ? null : cardId, bank_id: direct ? bankId : null, category })
    onClose()
  }

  const sortedCards = [...cards].sort((a, b) => (a.id === defaultCardId ? -1 : b.id === defaultCardId ? 1 : 0))
  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)
  const billingLabel = billingCaption(billing)

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
        <BillingPicker value={billing} onChange={setBilling} />
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
        <CategoryPicker categories={expenseCategories()} value={category} type="Expense" optional onChange={setCategory} />
      </FormGroup>
    </Sheet>
  )
}
