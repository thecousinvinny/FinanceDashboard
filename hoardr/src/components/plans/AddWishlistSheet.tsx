'use client'

import { useState, useEffect, useRef } from 'react'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'

export interface NewWishItem {
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
  description:   string | null
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: NewWishItem) => void
}

export function AddWishlistSheet({ open, onClose, onAdd }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [category,    setCategory]    = useState('')
  const [url,         setUrl]         = useState('')
  const [description, setDescription] = useState('')

  // Auto-advance: refs so completing a field focuses the next one
  const scrollRef    = useRef<HTMLDivElement>(null)
  const nameRef      = useRef<HTMLInputElement>(null)
  const descRef      = useRef<HTMLInputElement>(null)
  const urlRef       = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName(''); setAmount(''); setCategory(''); setUrl(''); setDescription('')
      }, 360)
      return () => clearTimeout(t)
    }
  }, [open])

  const canAdd = !!name.trim()

  function handleAdd() {
    if (!canAdd) return
    const parsed = parseFloat(amount)
    onAdd({
      name:          name.trim(),
      original_cost: parsed > 0 ? parsed : null,
      category:      category.trim() || null,
      url:           url.trim() || null,
      description:   description.trim() || null,
    })
    onClose()
  }

  const next = (e: React.KeyboardEvent<HTMLInputElement>, to?: HTMLInputElement | null) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (to) to.focus(); else e.currentTarget.blur()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Wishlist Item"
      action={{ label: 'Add', onClick: handleAdd, disabled: !canAdd }}
      scrollRef={scrollRef}
    >
      <AmountHero
        value={amount}
        onChange={setAmount}
        onEnter={() => nameRef.current?.focus()}
        caption="List price · optional"
      />

      <FormGroup>
        <FormRow label="Item">
          <input
            ref={nameRef}
            type="text" placeholder="iPhone" value={name}
            onChange={e => setName(e.target.value)}
            enterKeyHint="next"
            onKeyDown={e => next(e, descRef.current)}
            className={rowInput}
          />
        </FormRow>
        <FormRow label="Details">
          <input
            ref={descRef}
            type="text" placeholder="Optional" value={description}
            onChange={e => setDescription(e.target.value)}
            enterKeyHint="next"
            onKeyDown={e => next(e, urlRef.current)}
            className={rowInput}
          />
        </FormRow>
        <FormRow label="Link">
          <input
            ref={urlRef}
            type="url" inputMode="url" autoCapitalize="none" autoCorrect="off"
            placeholder="https://" value={url}
            onChange={e => setUrl(e.target.value)}
            enterKeyHint="done"
            onKeyDown={e => next(e)}
            className={rowInput}
          />
        </FormRow>
      </FormGroup>

      <FormGroup header="Category" footer="Optional — tap again to clear.">
        <CategoryPicker
          categories={EXPENSE_CATEGORIES}
          value={category || null}
          type="Expense"
          optional
          onChange={c => setCategory(c ?? '')}
        />
      </FormGroup>
    </Sheet>
  )
}
