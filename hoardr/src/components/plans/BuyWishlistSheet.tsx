'use client'

import { useEffect, useState } from 'react'
import { CreditCard, CalendarDays, Tag } from 'lucide-react'
import { $fd, localToday } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero } from '@/components/ui/Form'

interface BuyItem { id: string; name: string; original_cost: number | null }
interface BuyCard { id: string; name: string; last4?: string | null }

interface Props {
  item:          BuyItem | null
  onClose:       () => void
  cards:         BuyCard[]
  defaultCardId: string | null
  onBuy:         (id: string, paid: number, date: string, cardId: string | null) => void
}

/** Swipe a wishlist item right on Out: what you paid, when, and on which card. */
export function BuyWishlistSheet({ item, onClose, cards, defaultCardId, onBuy }: Props) {
  // The item stays on screen while the sheet slides away
  const [shown,  setShown]  = useState<BuyItem | null>(item)
  const [amount, setAmount] = useState('')
  const [date,   setDate]   = useState(localToday())
  const [cardId, setCardId] = useState<string | null>(defaultCardId)

  useEffect(() => {
    if (!item) return
    setShown(item); setAmount(''); setDate(localToday()); setCardId(defaultCardId)
  }, [item, defaultCardId])

  const paid = parseFloat(amount)
  const list = shown?.original_cost ?? null
  const saved = list != null && paid > 0 && list > paid ? list - paid : 0
  const sorted = [...cards].sort((a, b) => (a.id === defaultCardId ? -1 : b.id === defaultCardId ? 1 : 0))
  const card = cards.find(c => c.id === cardId)

  function buy() {
    if (!(paid > 0) || !shown) return
    onBuy(shown.id, paid, date || localToday(), cardId)
    onClose()
  }

  return (
    <Sheet
      open={!!item}
      onClose={onClose}
      title="Mark as Bought"
      action={{ label: 'Add to Expenses', onClick: buy, disabled: !(paid > 0) }}
    >
      <p className="pt-2 text-center text-[13px] text-ink-muted truncate px-6">{shown?.name}</p>
      <AmountHero
        value={amount} onChange={setAmount}
        caption={saved > 0
          ? <span className="text-emerald">You saved {$fd(saved)}</span>
          : 'What you paid'}
      />

      <FormGroup>
        {list != null && (
          <FormRow icon={Tag} iconColor="#8E8E93" label="List price">
            <span className="tabular-nums text-ink-muted">{$fd(list)}</span>
          </FormRow>
        )}
        {cards.length > 0 && (
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
            {sorted.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ••••${c.last4}` : ''}</option>)}
          </Select>
        )}
        <FormRow icon={CalendarDays} iconColor="#FF453A" label="Date">
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
