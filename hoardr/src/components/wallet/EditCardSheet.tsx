'use client'

import { useState, useEffect } from 'react'
import { Star, Landmark } from 'lucide-react'
import type { Card, CardType, CardNetwork, CardStyle, CardTexture } from '@/types'
import { CARD_STYLE_DEFS, CARD_TEXTURE_DEFS, STYLE_GROUPS } from '@/lib/cardStyles'
import { CardVisual } from './CardVisual'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented, ChoiceChips, rowInput } from '@/components/ui/Form'

export interface CardEdits {
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
  card:          Card | null
  open:          boolean
  onClose:       () => void
  onSave:        (id: string, edits: CardEdits) => void
  onMakeDefault: (id: string) => void
  banks:         BankOption[]
}

const CARD_TYPES: CardType[]   = ['Debit', 'Credit', 'Prepaid', 'Business']
const NETWORKS:  CardNetwork[] = ['Visa', 'Mastercard', 'Amex', 'Discover']

export function EditCardSheet({ card, open, onClose, onSave, onMakeDefault, banks }: Props) {
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
    if (card) {
      setName(card.name)
      setAlias(card.alias ?? '')
      setType(card.type ?? 'Debit')
      setLast4(card.last4 ?? '')
      setNetwork(card.network ?? 'Visa')
      setExpires(card.expires ?? '')
      setCardholder(card.cardholder ?? '')
      setStyle(card.style)
      setTexture(card.texture ?? 'none')
      setBankId(card.bank_id)
    }
  }, [card])

  function handleLast4(raw: string) {
    setLast4(raw.replace(/\D/g, '').slice(0, 4))
  }

  function handleExpires(raw: string) {
    const d = raw.replace(/\D/g, '').slice(0, 4)
    setExpires(d.length >= 3 ? `${d.slice(0, 2)}/${d.slice(2)}` : d)
  }

  function handleSave() {
    if (!name.trim() || last4.length !== 4 || !card) return
    onSave(card.id, {
      name: name.trim().toUpperCase(), alias: alias.trim() || null,
      type, last4, network, expires,
      cardholder: cardholder.trim().toUpperCase(),
      style, texture, bank_id: bankId,
    })
    onClose()
  }

  const canSave = !!name.trim() && last4.length === 4

  const done = (e: React.KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }
  const bank = banks.find(b => b.id === bankId)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Edit Card"
      action={{ label: 'Save', onClick: handleSave, disabled: !canSave }}
    >
      {/* Live preview */}
      {card && (
        <div className="pt-3 pb-1 max-w-[340px] mx-auto">
          <CardVisual card={{ ...card, name: name || card.name, alias: alias || null, type, last4, network, expires, cardholder, style, texture }} />
        </div>
      )}

      <FormGroup>
        {card?.is_default ? (
          <FormRow icon={Star} label="Default card"><span className="text-gold">Yes</span></FormRow>
        ) : (
          <FormRow icon={Star} label="Make default card" chevron onClick={() => { if (card) { onMakeDefault(card.id); onClose() } }} />
        )}
      </FormGroup>

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
          <input type="text" inputMode="numeric" value={last4} onChange={e => handleLast4(e.target.value)} placeholder="1234" enterKeyHint="done" onKeyDown={done} className={`${rowInput} tabular-nums`} />
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
