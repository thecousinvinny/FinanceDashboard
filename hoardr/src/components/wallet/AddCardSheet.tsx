'use client'

import { useState, useEffect } from 'react'
import { Landmark } from 'lucide-react'
import type { Card, CardType, CardNetwork, CardStyle, CardTexture } from '@/types'
import { CARD_STYLE_DEFS, CARD_TEXTURE_DEFS, STYLE_GROUPS } from '@/lib/cardStyles'
import { CardVisual } from './CardVisual'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented, ChoiceChips, rowInput } from '@/components/ui/Form'

const CARD_TYPES: CardType[]   = ['Debit', 'Credit', 'Prepaid', 'Business']
const NETWORKS:  CardNetwork[] = ['Visa', 'Mastercard', 'Amex', 'Discover']

export interface NewCard {
  name:       string
  alias:      string | null
  type:       CardType
  last4:      string
  network:    CardNetwork
  expires:    string
  cardholder: string
  style:      CardStyle
  texture:    CardTexture
  bank_id:    string | null
}

interface BankOption { id: string; name: string }

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (card: NewCard) => void
  banks:   BankOption[]
}

/** Add a card — same layout as Edit Card, with a live preview. */
export function AddCardSheet({ open, onClose, onAdd, banks }: Props) {
  const [name,       setName]       = useState('')
  const [alias,      setAlias]      = useState('')
  const [type,       setType]       = useState<CardType>('Debit')
  const [last4,      setLast4]      = useState('')
  const [network,    setNetwork]    = useState<CardNetwork>('Visa')
  const [expires,    setExpires]    = useState('')
  const [cardholder, setCardholder] = useState('')
  const [style,      setStyle]      = useState<CardStyle>('black')
  const [texture,    setTexture]    = useState<CardTexture>('none')
  const [bankId,     setBankId]     = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName(''); setAlias(''); setType('Debit'); setLast4('')
        setNetwork('Visa'); setExpires(''); setCardholder('')
        setStyle('black'); setTexture('none'); setBankId(null)
      }, 360)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleExpires(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 4)
    setExpires(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
  }

  const canAdd = !!name.trim() && last4.length === 4

  function handleAdd() {
    if (!canAdd) return
    onAdd({
      name:       name.trim().toUpperCase(),
      alias:      alias.trim() || null,
      type, last4, network, expires,
      cardholder: cardholder.trim().toUpperCase(),
      style, texture, bank_id: bankId,
    })
    onClose()
  }

  const done = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }
  const bank = banks.find(b => b.id === bankId)
  const preview = {
    id: 'preview', name: name.trim().toUpperCase() || 'NEW CARD', alias: alias || null,
    type, last4: last4 || '0000', network, expires, cardholder, style, texture,
    is_default: false, bank_id: bankId,
  } as unknown as Card

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Card"
      action={{ label: 'Add', onClick: handleAdd, disabled: !canAdd }}
    >
      <div className="pt-3 pb-1 max-w-[340px] mx-auto">
        <CardVisual card={preview} />
      </div>

      <FormGroup>
        <FormRow label="Name">
          <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="CHASE SAPPHIRE" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
        <FormRow label="Nickname">
          <input type="text" value={alias} onChange={e => setAlias(e.target.value)} placeholder="Optional" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
        <FormRow label="Cardholder">
          <input type="text" value={cardholder} onChange={e => setCardholder(e.target.value)} placeholder="JOHN DOE" enterKeyHint="done" onKeyDown={done} className={rowInput} />
        </FormRow>
        <FormRow label="Last 4">
          <input type="text" inputMode="numeric" value={last4} onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))} placeholder="1234" enterKeyHint="done" onKeyDown={done} className={`${rowInput} tabular-nums`} />
        </FormRow>
        <FormRow label="Expires">
          <input type="text" inputMode="numeric" value={expires} onChange={e => handleExpires(e.target.value)} placeholder="MM/YY" enterKeyHint="done" onKeyDown={done} className={`${rowInput} tabular-nums`} />
        </FormRow>
        {banks.length > 0 && (
          <Select
            value={bankId ?? ''}
            onChange={e => setBankId(e.target.value || null)}
            aria-label="Linked bank"
            className="w-full text-left"
            trigger={<FormRow icon={Landmark} label="Linked bank" chevron><span className="truncate">{bank?.name ?? 'None'}</span></FormRow>}
          >
            <option value="">None</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </FormGroup>

      <FormGroup header="Type" plain>
        <Segmented options={CARD_TYPES} value={type} onChange={setType} />
      </FormGroup>

      <FormGroup header="Network" plain>
        <Segmented options={NETWORKS} value={network} onChange={setNetwork} />
      </FormGroup>

      <FormGroup header="Color" plain>
        <div className="space-y-3">
          {STYLE_GROUPS.map(group => (
            <div key={group.label}>
              <p className="px-1 mb-1.5 text-[12px] text-ink-muted">{group.label}</p>
              <div className="grid grid-cols-4 gap-2">
                {group.styles.map(s => {
                  const def = CARD_STYLE_DEFS[s]
                  const on  = style === s
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStyle(s)}
                      className="h-[52px] rounded-[12px] select-none flex items-end p-1.5 overflow-hidden transition-shadow"
                      style={{ background: def.gradient, boxShadow: on ? '0 0 0 2px var(--color-bg-surface), 0 0 0 3.5px #D4AF37' : 'inset 0 0 0 0.5px rgb(var(--rgb-ink) / 0.12)' }}
                    >
                      <span className="text-[9px] font-semibold leading-tight" style={{ color: def.textPrimary }}>{def.label}</span>
                    </button>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      </FormGroup>

      <FormGroup header="Texture" plain>
        <div className="-mx-4 -my-3">
          <ChoiceChips
            options={Object.keys(CARD_TEXTURE_DEFS) as CardTexture[]}
            labels={Object.fromEntries(Object.entries(CARD_TEXTURE_DEFS).map(([k, v]) => [k, v.label])) as Partial<Record<CardTexture, string>>}
            value={texture}
            onChange={setTexture}
          />
        </div>
      </FormGroup>
    </Sheet>
  )
}
