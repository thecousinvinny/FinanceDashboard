'use client'

import { useState, useEffect } from 'react'
import { Truck } from 'lucide-react'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, CategoryPicker, rowInput, amountStr } from '@/components/ui/Form'

interface WishSnapshot {
  id:            string
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
  description:   string | null
  status?:       string
  delivered_at?: string | null
}

export interface WishEdits {
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
  description:   string | null
  delivered_at?: string | null
}

interface Props {
  item:    WishSnapshot | null
  open:    boolean
  onClose: () => void
  onSave:  (id: string, edits: WishEdits) => void
}

/** Edit a wishlist item — same layout as the Add sheet. Delivered items also get their delivery date. */
export function EditWishlistSheet({ item, open, onClose, onSave }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [category,    setCategory]    = useState('')
  const [url,         setUrl]         = useState('')
  const [description, setDescription] = useState('')
  const [deliveredAt, setDeliveredAt] = useState('')

  const isDelivered = item?.status === 'Delivered'

  useEffect(() => {
    if (item) {
      setName(item.name)
      setAmount(amountStr(item.original_cost))
      setCategory(item.category ?? '')
      setUrl(item.url ?? '')
      setDescription(item.description ?? '')
      setDeliveredAt(item.delivered_at ?? '')
    }
  }, [item])

  const canSave = !!name.trim()

  function handleSave() {
    if (!canSave || !item) return
    const parsed = parseFloat(amount)
    onSave(item.id, {
      name:          name.trim(),
      original_cost: parsed > 0 ? parsed : null,
      category:      category.trim() || null,
      url:           url.trim() || null,
      description:   description.trim() || null,
      ...(isDelivered ? { delivered_at: deliveredAt || null } : {}),
    })
    onClose()
  }

  const done = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit Item"
      action={{ label: 'Save', onClick: handleSave, disabled: !canSave }}
    >
      <AmountHero value={amount} onChange={setAmount} caption="List price · optional" />

      <FormGroup>
        <FormRow label="Item">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="iPhone" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
        <FormRow label="Details">
          <input type="text" value={description} onChange={e => setDescription(e.target.value)} placeholder="Optional" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
        <FormRow label="Link">
          <input type="url" inputMode="url" autoCapitalize="none" autoCorrect="off" value={url} onChange={e => setUrl(e.target.value)} placeholder="https://" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
      </FormGroup>

      {isDelivered && (
        <FormGroup>
          <FormRow icon={Truck} label="Delivered">
            <CustomDateInput
              value={deliveredAt}
              onChange={setDeliveredAt}
              className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
            />
          </FormRow>
        </FormGroup>
      )}

      <FormGroup header="Category" footer="Optional — tap again to clear.">
        <CategoryPicker categories={EXPENSE_CATEGORIES} value={category || null} type="Expense" optional onChange={c => setCategory(c ?? '')} />
      </FormGroup>
    </Sheet>
  )
}
