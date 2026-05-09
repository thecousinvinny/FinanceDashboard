'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { CardType, CardNetwork, CardStyle } from '@/types'

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
  bank_id:    string | null
}

interface BankOption { id: string; name: string }

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (card: NewCard) => void
  banks:   BankOption[]
}

export function AddCardSheet({ open, onClose, onAdd, banks }: Props) {
  const [name,       setName]       = useState('')
  const [alias,      setAlias]      = useState('')
  const [type,       setType]       = useState<CardType>('Debit')
  const [last4,      setLast4]      = useState('')
  const [network,    setNetwork]    = useState<CardNetwork>('Visa')
  const [expires,    setExpires]    = useState('')
  const [cardholder, setCardholder] = useState('')
  const [style,      setStyle]      = useState<CardStyle>('black')
  const [bankId,     setBankId]     = useState<string | null>(null)

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName(''); setAlias(''); setType('Debit'); setLast4('')
        setNetwork('Visa'); setExpires(''); setCardholder('')
        setStyle('black'); setBankId(null)
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

  function handleAdd() {
    if (!name.trim() || last4.length !== 4) return
    onAdd({
      name:       name.trim().toUpperCase(),
      alias:      alias.trim() || null,
      type, last4, network, expires,
      cardholder: cardholder.trim().toUpperCase(),
      style, bank_id: bankId,
    })
    onClose()
  }

  const canAdd = !!name.trim() && last4.length === 4

  const STYLES: { value: CardStyle; bg: string; textColor: string; inlineStyle?: React.CSSProperties }[] = [
    { value: 'black', bg: 'bg-[#13131f]', textColor: 'text-ink' },
    { value: 'gold',  bg: '',             textColor: 'text-yellow-950', inlineStyle: { background: 'linear-gradient(135deg,#b8860b 0%,#d4af37 40%,#f0d060 60%,#c8952a 100%)' } },
    { value: 'green', bg: 'bg-[#0c2d1c]', textColor: 'text-emerald' },
  ]

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
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Card</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Style picker */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Style</p>
            <div className="grid grid-cols-3 gap-2">
              {STYLES.map(s => (
                <button
                  key={s.value}
                  onClick={() => setStyle(s.value)}
                  className={cn('h-12 rounded-[14px] border-2 transition-all select-none flex items-center justify-center', s.bg, style === s.value ? 'border-gold' : 'border-transparent')}
                  style={s.inlineStyle}
                >
                  <span className={cn('text-[11px] font-semibold capitalize', s.textColor)}>{s.value}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Name */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Card Name</p>
            <input type="text" placeholder="e.g. LUMEN" value={name} onChange={e => setName(e.target.value)}
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

          {/* Submit */}
          <button onClick={handleAdd} disabled={!canAdd}
            className={cn('w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none', canAdd ? 'gradient-gold text-white shadow-gold' : 'bg-bg-overlay text-ink-faint')}>
            Add Card
          </button>
        </div>
      </div>
    </>
  )
}
