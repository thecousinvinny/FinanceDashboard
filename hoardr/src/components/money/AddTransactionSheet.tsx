'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { CreditCard, Landmark, CalendarDays } from 'lucide-react'
import {
  expenseCategories,
  incomeCategories,
  type SeedTx,
} from '@/lib/data/transactions'
import { localToday, $fd, haptic } from '@/lib/utils'
import { resolveDefaultBankId } from '@/lib/app-prefs'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { advanceToField } from '@/lib/field-advance'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { useTxMemory, warmTxMemory, rememberTx, suggestNames, knownName, byUse, type KnownName } from '@/lib/tx-memory'

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
  /** Which kind of entry this sheet adds. There's no in-sheet switch — each
   *  FAB action opens the sheet for the one thing it says. */
  mode?:             TxType
}

export function AddTransactionSheet({ open, onClose, onAdd, cards = [], banks = [], defaultCardId, defaultBankId, defaultCategory, mode = 'Expense' }: Props) {
  const type = mode
  const [amount,        setAmount]        = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [hasDiscount,   setHasDiscount]   = useState(false)
  const [name,          setName]          = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState<string | null>(null)
  const [date,          setDate]          = useState(localToday())
  const [cardId,        setCardId]        = useState<string | null>(null)
  const [bankId,        setBankId]        = useState<string | null>(null)
  const [nameFocused,   setNameFocused]   = useState(false)

  // Merchant memory: names you've used before fill in their category, card
  // and amount, and categories are listed in the order you use them
  const memory     = useTxMemory(type, open)
  const categories = useMemo(
    () => byUse(type === 'Expense' ? expenseCategories() : incomeCategories(), memory.catCounts),
    // catCounts is mutated in place by rememberTx; names.size changes with it
    // eslint-disable-next-line react-hooks/exhaustive-deps
    // open: the account's categories (lib/category-meta) may have loaded since
    [type, memory, memory.names.size, open],
  )
  const suggestions = nameFocused ? suggestNames(memory, name) : []
  useEffect(() => { warmTxMemory() }, [])

  // Once you pick a category or card yourself, a recognised name stops overriding it
  const catTouched  = useRef(false)
  const acctTouched = useRef(false)

  // Auto-advance: completing one field scrolls/focuses the next
  const scrollRef      = useRef<HTMLDivElement>(null)
  const nameInputRef   = useRef<HTMLInputElement>(null)
  const pickerSecRef   = useRef<HTMLDivElement>(null)  // Card (expense) or Bank (income)
  const advanceTo = (sec: HTMLElement | null, focusEl?: HTMLElement | null) =>
    advanceToField(scrollRef.current, sec, focusEl)

  useEffect(() => {
    if (open) {
      catTouched.current  = false
      acctTouched.current = false
      setCardId(defaultCardId ?? null)
      // Bank used to be set only by the close-reset, so the first income of a
      // session saved with no bank while the picker displayed the default.
      setBankId(resolveDefaultBankId(banks))
      setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
    } else {
      const t = setTimeout(() => {
        setAmount('')
        setOriginalPrice('')
        setHasDiscount(false)
        setName('')
        setDescription('')
        setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
        setDate(localToday())
        setCardId(defaultCardId ?? null)
        setBankId(defaultBankId ?? null)
      }, 360)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function applyKnown(k: KnownName, fillAmount: boolean) {
    if (k.category && !catTouched.current && categories.some(c => c.name === k.category)) setCategory(k.category)
    if (k.accountId && !acctTouched.current) {
      if (type === 'Expense' && cards.some(c => c.id === k.accountId)) setCardId(k.accountId)
      if (type === 'Income'  && banks.some(b => b.id === k.accountId)) setBankId(k.accountId)
    }
    if (fillAmount && !amount && k.amount > 0) setAmount(String(+k.amount.toFixed(2)))
  }

  function pickSuggestion(k: KnownName) {
    haptic('tap')
    setName(k.name)
    applyKnown(k, true)
    nameInputRef.current?.blur()
  }

  // Typing a known name in full works too (without touching the amount)
  function onNameBlur() {
    setNameFocused(false)
    const k = knownName(memory, name)
    if (k) applyKnown(k, false)
  }

  const parsedPaid     = parseFloat(amount)     || 0
  const parsedOriginal = parseFloat(originalPrice) || 0
  const savings        = hasDiscount && parsedOriginal > parsedPaid && parsedOriginal > 0 && parsedPaid > 0
                           ? parsedOriginal - parsedPaid : 0

  const canAdd = !!parsedPaid && !!name.trim() && !!category &&
                 (!hasDiscount || !!parsedOriginal)

  function handleAdd() {
    if (!canAdd || !category) return
    const tx: SeedTx = {
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
    }
    rememberTx(tx)
    onAdd(tx)
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
            onFocus={() => setNameFocused(true)}
            onBlur={onNameBlur}
            autoComplete="off"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        {/* Names you've used before — one tap fills category, card and amount */}
        {suggestions.map(k => {
          const Icon = k.category ? getCategoryIcon(k.category, type) : null
          return (
            <button
              key={k.name}
              type="button"
              // Before the input's blur, so the tap isn't lost when the list unmounts
              onPointerDown={e => { e.preventDefault(); pickSuggestion(k) }}
              className="flex items-center gap-3 w-full px-4 h-[46px] text-left active:bg-ink/[0.04]"
              style={{ borderTop: '0.5px solid rgb(var(--rgb-ink) / 0.08)' }}
            >
              <span className={type === 'Income' ? 'text-emerald' : 'text-gold'}>
                {Icon && <Icon size={16} strokeWidth={1.9} />}
              </span>
              <span className="flex-1 min-w-0 truncate text-[15px] text-ink">{k.name}</span>
              <span className="text-[12px] text-ink-muted tabular-nums flex-shrink-0">
                {k.category ? `${k.category} · ` : ''}{$fd(k.amount)}
              </span>
            </button>
          )
        })}
      </FormGroup>

      <FormGroup header="Category">
        <CategoryPicker
          categories={categories}
          value={category}
          type={type}
          onChange={c => { catTouched.current = true; setCategory(c); advanceTo(pickerSecRef.current) }}
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
                onChange={e => { acctTouched.current = true; setCardId(e.target.value || null) }}
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
                onChange={e => { acctTouched.current = true; setBankId(e.target.value || null) }}
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

      {/* Optional extras last, out of the way of the required fields */}
      <FormGroup header="More" footer={hasDiscount ? 'The amount above is what you paid.' : undefined}>
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
        {type === 'Expense' && (
          <FormRow label="Discount">
            <Toggle label="Discount" checked={hasDiscount} onChange={v => { setHasDiscount(v); setOriginalPrice('') }} />
          </FormRow>
        )}
        {type === 'Expense' && hasDiscount && (
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
    </Sheet>
  )
}
