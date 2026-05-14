'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { Card, CardType, CardNetwork, CardStyle, CardTexture } from '@/types'
import { CARD_STYLE_DEFS, CARD_TEXTURE_DEFS, STYLE_GROUPS } from '@/lib/cardStyles'

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

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName(''); setAlias(''); setType('Debit'); setLast4('')
        setNetwork('Visa'); setExpires(''); setCardholder('')
        setStyle('black'); setTexture('none'); setBankId(null)
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

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

  return (
    <>
      <div
        onClick={onClose}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">Edit Card</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Default badge / make default button */}
          {card?.is_default ? (
            <div className="w-full py-3 rounded-[14px] text-[13px] font-semibold bg-gold/10 text-gold text-center">
              ★ Default Card
            </div>
          ) : (
            <button
              onClick={() => { if (card) { onMakeDefault(card.id); onClose() } }}
              className="w-full py-3 rounded-[14px] text-[13px] font-semibold bg-bg-overlay text-gold ring-1 ring-gold/30 select-none"
            >
              ☆ Make Default Card
            </button>
          )}

          {/* Style picker */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Color</p>
            <div className="space-y-3">
              {STYLE_GROUPS.map(group => (
                <div key={group.label}>
                  <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint/50 mb-1.5">{group.label}</p>
                  <div className="grid grid-cols-4 gap-2">
                    {group.styles.map(s => {
                      const def = CARD_STYLE_DEFS[s]
                      return (
                        <button
                          key={s}
                          onClick={() => setStyle(s)}
                          className={cn('h-[52px] rounded-[12px] border-2 transition-all select-none flex items-end p-1.5 overflow-hidden', style === s ? 'border-gold' : 'border-transparent')}
                          style={{ background: def.gradient }}
                        >
                          <span className="text-[9px] font-semibold leading-tight" style={{ color: def.textPrimary }}>{def.label}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Texture picker */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Texture</p>
            <div className="grid grid-cols-4 gap-2">
              {(Object.keys(CARD_TEXTURE_DEFS) as CardTexture[]).map(t => (
                <button
                  key={t}
                  onClick={() => setTexture(t)}
                  className={cn('py-2.5 rounded-[12px] text-[10px] font-semibold transition-all select-none', texture === t ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}
                >
                  {CARD_TEXTURE_DEFS[t].label}
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Card Name</p>
            <input type="text" placeholder="e.g. CHASE SAPPHIRE" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Alias */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              Nickname <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <input type="text" placeholder="e.g. Daily Driver" value={alias} onChange={e => setAlias(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Type */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Type</p>
            <div className="grid grid-cols-2 gap-2">
              {CARD_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none', type === t ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Network */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Network</p>
            <div className="grid grid-cols-2 gap-2">
              {NETWORKS.map(n => (
                <button key={n} onClick={() => setNetwork(n)}
                  className={cn('py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none', network === n ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  {n}
                </button>
              ))}
            </div>
          </div>

          {/* Last 4 + Expires */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Last 4</p>
              <input type="text" inputMode="numeric" placeholder="1234" value={last4} onChange={e => handleLast4(e.target.value)}
                className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] font-mono text-ink placeholder:text-ink-faint outline-none" />
            </div>
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Expires</p>
              <input type="text" inputMode="numeric" placeholder="MM/YY" value={expires} onChange={e => handleExpires(e.target.value)}
                className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] font-mono text-ink placeholder:text-ink-faint outline-none" />
            </div>
          </div>

          {/* Cardholder */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Cardholder Name</p>
            <input type="text" placeholder="e.g. JOHN DOE" value={cardholder} onChange={e => setCardholder(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] font-mono text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Linked bank */}
          {banks.length > 0 && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">
                Linked Bank <span className="normal-case text-ink-faint/60">(optional)</span>
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button onClick={() => setBankId(null)}
                  className={cn('py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none', bankId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  None
                </button>
                {banks.map(b => (
                  <button key={b.id} onClick={() => setBankId(b.id)}
                    className={cn('py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none', bankId === b.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          <button onClick={handleSave} disabled={!canSave}
            className={cn('w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none', canSave ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint')}>
            Save Changes
          </button>
        </div>
      </div>
    </>
  )
}
