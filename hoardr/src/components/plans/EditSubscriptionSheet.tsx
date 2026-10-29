'use client'

import { useState, useEffect } from 'react'
import { CreditCard, Landmark, CalendarDays, Repeat } from 'lucide-react'
import { calcSubCosts } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import type { BillingCycle } from '@/types'
import type { CardOption, BankOption } from '@/components/money/AddTransactionSheet'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle, AmountHero, CategoryPicker, rowInput, amountStr } from '@/components/ui/Form'

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'Weekly',    label: 'Weekly'        },
  { value: 'BiWeekly',  label: 'Every 2 Weeks' },
  { value: 'Monthly',   label: 'Monthly'       },
  { value: 'Quarterly', label: 'Quarterly'     },
  { value: 'Annual',    label: 'Yearly'        },
]

interface SubSnapshot {
  id:           string
  name:         string
  cost:         number
  billing:      BillingCycle
  next_renewal: string | null
  card_id:      string | null
  bank_id:      string | null
  category:     string | null
}

export interface SubEdits {
  name:         string
  cost:         number
  billing:      BillingCycle
  next_renewal: string
  monthly_cost: number
  annual_cost:  number
  card_id:      string | null
  bank_id:      string | null
  category:     string | null
}

interface Props {
  sub:     SubSnapshot | null
  open:    boolean
  onClose: () => void
  onSave:  (id: string, edits: SubEdits) => void
  cards?:  CardOption[]
  banks?:  BankOption[]
}

/** Edit a subscription — same layout as the Add sheet. */
export function EditSubscriptionSheet({ sub, open, onClose, onSave, cards = [], banks = [] }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [billing,     setBilling]     = useState<BillingCycle>('Monthly')
  const [nextRenewal, setNextRenewal] = useState('')
  const [cardId,      setCardId]      = useState<string | null>(null)
  const [bankId,      setBankId]      = useState<string | null>(null)
  const [direct,      setDirect]      = useState(false)
  const [category,    setCategory]    = useState<string | null>(null)

  useEffect(() => {
    if (sub) {
      setName(sub.name)
      setAmount(amountStr(sub.cost))
      setBilling(sub.billing)
      setNextRenewal(sub.next_renewal ?? '')
      setCardId(sub.card_id)
      setBankId(sub.bank_id)
      setDirect(!!sub.bank_id)
      setCategory(sub.category ?? null)
    }
  }, [sub])

  const canSave = !!name.trim() && !!nextRenewal

  function handleSave() {
    if (!canSave || !sub) return
    const parsed = parseFloat(amount) || 0
    const { monthly, annual } = calcSubCosts(parsed, billing)
    onSave(sub.id, {
      name: name.trim(), cost: parsed, billing, next_renewal: nextRenewal,
      monthly_cost: monthly, annual_cost: annual,
      card_id: direct ? null : cardId,
      bank_id: direct ? bankId : null,
      category,
    })
    onClose()
  }

  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)
  const billingLabel = BILLING_OPTIONS.find(o => o.value === billing)?.label ?? billing

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit Subscription"
      action={{ label: 'Save', onClick: handleSave, disabled: !canSave }}
    >
      <AmountHero value={amount} onChange={setAmount} caption={billingLabel} />

      <FormGroup>
        <FormRow label="Name">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Spotify"
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
          trigger={<FormRow icon={Repeat} label="Repeats" chevron><span>{billingLabel}</span></FormRow>}
        >
          {BILLING_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </Select>
        <FormRow icon={CalendarDays} label="Next renewal">
          <CustomDateInput
            value={nextRenewal}
            onChange={setNextRenewal}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
      </FormGroup>

      <FormGroup>
        <FormRow label="Pay from bank">
          <Toggle label="Pay from bank" checked={direct} onChange={setDirect} />
        </FormRow>
        {direct ? (
          banks.length > 0 && (
            <Select
              value={bankId ?? ''}
              onChange={e => setBankId(e.target.value || null)}
              aria-label="Bank"
              className="w-full text-left"
              trigger={<FormRow icon={Landmark} label="Bank" chevron><span className="truncate">{bank?.name ?? 'None'}</span></FormRow>}
            >
              <option value="">None</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )
        ) : (
          cards.length > 0 && (
            <Select
              value={cardId ?? ''}
              onChange={e => setCardId(e.target.value || null)}
              aria-label="Card"
              className="w-full text-left"
              trigger={<FormRow icon={CreditCard} label="Card" chevron><span className="truncate">{card ? `${card.name}${card.last4 ? ` •${card.last4}` : ''}` : 'None'}</span></FormRow>}
            >
              <option value="">None</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ••••${c.last4}` : ''}</option>)}
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
