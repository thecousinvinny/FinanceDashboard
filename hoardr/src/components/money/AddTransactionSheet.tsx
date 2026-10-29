'use client'

import { useState, useEffect, useRef } from 'react'
import { CreditCard, Landmark, CalendarDays } from 'lucide-react'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type SeedTx,
} from '@/lib/data/transactions'
import { localToday, $fd } from '@/lib/utils'
import { resolveDefaultBankId } from '@/lib/app-prefs'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { advanceToField } from '@/lib/field-advance'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle, Segmented, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'

type TxType = 'Expense' | 'Income'

export interface CardOption { id: string; name: string; last4: string | null }
export interface BankOption { id: string; name: string }

interface Props {
  open:              boolean
  onClose:           () => void
  onAdd:             (tx: SeedTx) => void
  cards?:            CardOption[]
  banks?:            BankOption[]
  defaultCardId?:    string | null
  defaultBankId?:    string | null
  defaultCategory?:  string | null
}

const TYPES = ['Expense', 'Income'] as const

export function AddTransactionSheet({ open, onClose, onAdd, cards = [], banks = [], defaultCardId, defaultBankId, defaultCategory }: Props) {
  const [type,          setType]          = useState<TxType>('Expense')
  const [amount,        setAmount]        = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [hasDiscount,   setHasDiscount]   = useState(false)
  const [name,          setName]          = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState<string | null>(null)
  const [date,          setDate]          = useState(localToday())
  const [cardId,        setCardId]        = useState<string | null>(null)
  const [bankId,        setBankId]        = useState<string | null>(null)

  const categories = type === 'Expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  useEffect(() => {
    // On tab switch (and mount): restore the default category for expenses, clear for income.
    // Setting the default here instead of null avoids clobbering it on mount.
    setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
    if (type === 'Income') { setHasDiscount(false); setOriginalPrice('') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

  // Auto-advance: completing one field scrolls/focuses the next
  const scrollRef      = useRef<HTMLDivElement>(null)
  const nameInputRef   = useRef<HTMLInputElement>(null)
  const pickerSecRef   = useRef<HTMLDivElement>(null)  // Card (expense) or Bank (income)
  const advanceTo = (sec: HTMLElement | null, focusEl?: HTMLElement | null) =>
    advanceToField(scrollRef.current, sec, focusEl)

  useEffect(() => {
    if (open) {
      setCardId(defaultCardId ?? null)
      // Bank used to be set only by the close-reset, so the first income of a
      // session saved with no bank while the picker displayed the default.
      setBankId(resolveDefaultBankId(banks))
      setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
    } else {
      const t = setTimeout(() => {
        setType('Expense')
        setAmount('')
        setOriginalPrice('')
        setHasDiscount(false)
        setName('')
        setDescription('')
        setCategory(defaultCategory ?? null)
        setDate(localToday())
        setCardId(defaultCardId ?? null)
        setBankId(defaultBankId ?? null)
      }, 360)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const parsedPaid     = parseFloat(amount)     || 0
  const parsedOriginal = parseFloat(originalPrice) || 0
  const savings        = hasDiscount && parsedOriginal > parsedPaid && parsedOriginal > 0 && parsedPaid > 0
                           ? parsedOriginal - parsedPaid : 0

  const canAdd = !!parsedPaid && !!name.trim() && !!category &&
                 (!hasDiscount || !!parsedOriginal)

  function handleAdd() {
    if (!canAdd || !category) return
    onAdd({
      id:            `t${Date.now()}`,
      type,
      name:          name.trim(),
      description:   description.trim() || null,
      category,
      date,
      amount:        parsedPaid,
      original_cost: hasDiscount && parsedOriginal > 0 ? parsedOriginal : null,
      card_id:       type === 'Expense' ? cardId : undefined,
      bank_id:       type === 'Income'  ? bankId : undefined,
    })
    onClose()
  }

  const sortedCards = [...cards].sort((a, b) => (a.id === defaultCardId ? -1 : b.id === defaultCardId ? 1 : 0))
  const sortedBanks = [...banks].sort((a, b) => (a.id === defaultBankId ? -1 : b.id === defaultBankId ? 1 : 0))
  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={type === 'Income' ? 'New Income' : 'New Expense'}
      action={{ label: 'Add', onClick: handleAdd, disabled: !canAdd }}
      scrollRef={scrollRef}
    >
      <div className="pt-1">
        <Segmented options={TYPES} value={type} onChange={setType} />
      </div>

      <AmountHero
        value={amount}
        onChange={setAmount}
        onEnter={() => nameInputRef.current?.focus()}
        caption={savings > 0
          ? <span className="text-emerald font-medium">You save {$fd(savings)}</span>
          : hasDiscount ? 'Amount paid' : undefined}
      />

      <FormGroup>
        <FormRow label={type === 'Expense' ? 'Merchant' : 'Source'}>
          <input
            ref={nameInputRef}
            type="text"
            placeholder={type === 'Expense' ? 'Blue Bottle' : 'Paycheck'}
            value={name}
            onChange={e => setName(e.target.value)}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        <FormRow label="Note">
          <input
            type="text"
            placeholder="Optional"
            value={description}
            onChange={e => setDescription(e.target.value)}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
      </FormGroup>

      {type === 'Expense' && (
        <FormGroup footer={hasDiscount ? 'The amount above is what you paid.' : undefined}>
          <FormRow label="Discount">
            <Toggle label="Discount" checked={hasDiscount} onChange={v => { setHasDiscount(v); setOriginalPrice('') }} />
          </FormRow>
          {hasDiscount && (
            <FormRow label="Original price">
              <span className={originalPrice ? 'text-ink' : 'text-ink-faint'}>$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={originalPrice}
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setOriginalPrice(v) }}
                className={`${rowInput} flex-none tabular-nums`}
                style={{ width: `${Math.max(4, originalPrice.length) + 0.5}ch` }}
                autoFocus
              />
            </FormRow>
          )}
        </FormGroup>
      )}

      <FormGroup header="Category">
        <CategoryPicker
          categories={categories}
          value={category}
          type={type}
          onChange={c => { setCategory(c); advanceTo(pickerSecRef.current) }}
        />
      </FormGroup>

      <div ref={pickerSecRef}>
        <FormGroup>
          {type === 'Expense' ? (
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
          ) : (
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
                {sortedBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </Select>
            )
          )}
          <FormRow icon={CalendarDays} iconColor="#FF453A" label="Date">
            <CustomDateInput
              value={date}
              onChange={setDate}
              className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
            />
          </FormRow>
        </FormGroup>
      </div>
    </Sheet>
  )
}
