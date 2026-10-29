'use client'

import { useState, useEffect } from 'react'
import { CreditCard, Landmark, CalendarDays } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type SeedTx,
} from '@/lib/data/transactions'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import type { CardOption, BankOption } from './AddTransactionSheet'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, CategoryPicker, rowInput, amountStr } from '@/components/ui/Form'

export interface TxEdits {
  name:        string
  amount:      number
  category:    string
  date:        string
  description: string | null
  card_id:     string | null
  bank_id:     string | null
}

interface Props {
  tx:      SeedTx | null
  open:    boolean
  onClose: () => void
  onSave:  (id: string, edits: TxEdits) => void
  cards?:  CardOption[]
  banks?:  BankOption[]
}

/** Edit an expense or income row — same layout as the Add sheet. */
export function EditTransactionSheet({ tx, open, onClose, onSave, cards = [], banks = [] }: Props) {
  const [amount,      setAmount]      = useState('')
  const [name,        setName]        = useState('')
  const [description, setDescription] = useState('')
  const [category,    setCategory]    = useState<string | null>(null)
  const [date,        setDate]        = useState('')
  const [cardId,      setCardId]      = useState<string | null>(null)
  const [bankId,      setBankId]      = useState<string | null>(null)

  useEffect(() => {
    if (tx) {
      setAmount(amountStr(tx.amount))
      setName(tx.name)
      setDescription(tx.description ?? '')
      setCategory(tx.category)
      setDate(tx.date)
      setCardId(tx.card_id ?? null)
      setBankId(tx.bank_id ?? null)
    }
  }, [tx])

  const isExpense = tx?.type !== 'Income'
  const parsed    = parseFloat(amount) || 0
  const canSave   = !!parsed && !!name.trim() && !!category

  function handleSave() {
    if (!canSave || !category || !tx) return
    onSave(tx.id, {
      name: name.trim(), amount: parsed, category, date,
      description: description.trim() || null,
      card_id: isExpense ? cardId : null,
      bank_id: isExpense ? null : bankId,
    })
    onClose()
  }

  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isExpense ? 'Edit Expense' : 'Edit Income'}
      action={{ label: 'Save', onClick: handleSave, disabled: !canSave }}
    >
      <AmountHero value={amount} onChange={setAmount} />

      <FormGroup>
        <FormRow label={isExpense ? 'Merchant' : 'Source'}>
          <input
            type="text" value={name} onChange={e => setName(e.target.value)}
            placeholder={isExpense ? 'Blue Bottle' : 'Paycheck'}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        <FormRow label="Note">
          <input
            type="text" value={description} onChange={e => setDescription(e.target.value)}
            placeholder="Optional"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
      </FormGroup>

      <FormGroup header="Category">
        <CategoryPicker
          categories={isExpense ? EXPENSE_CATEGORIES : INCOME_CATEGORIES}
          value={category}
          type={isExpense ? 'Expense' : 'Income'}
          onChange={c => c && setCategory(c)}
        />
      </FormGroup>

      <FormGroup>
        {isExpense ? (
          cards.length > 0 && (
            <Select
              value={cardId ?? ''}
              onChange={e => setCardId(e.target.value || null)}
              aria-label="Card"
              className="w-full text-left"
              trigger={
                <FormRow icon={CreditCard} label="Card" chevron>
                  <span className="truncate">{card ? `${card.name}${card.last4 ? ` •${card.last4}` : ''}` : 'None'}</span>
                </FormRow>
              }
            >
              <option value="">None</option>
              {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ••••${c.last4}` : ''}</option>)}
            </Select>
          )
        ) : (
          banks.length > 0 && (
            <Select
              value={bankId ?? ''}
              onChange={e => setBankId(e.target.value || null)}
              aria-label="Bank"
              className="w-full text-left"
              trigger={
                <FormRow icon={Landmark} label="Bank" chevron>
                  <span className="truncate">{bank?.name ?? 'None'}</span>
                </FormRow>
              }
            >
              <option value="">None</option>
              {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          )
        )}
        <FormRow icon={CalendarDays} label="Date">
          <CustomDateInput
            value={date}
            onChange={setDate}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
      </FormGroup>
    </Sheet>
  )
}
