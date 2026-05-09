'use client'

import { useState } from 'react'
import { PillGroup } from '@/components/ui/Pill'
import { SEED_CARDS, SEED_BANKS, cardsForBank, type SeedCard } from '@/lib/data/wallet'
import type { CardStyle } from '@/types'
import { cn } from '@/lib/utils'

type Tab = 'Cards' | 'Banks'

export default function WalletPage() {
  const [tab,   setTab]   = useState<Tab>('Cards')
  const [cards, ]         = useState(SEED_CARDS)
  const [banks, ]         = useState(SEED_BANKS)

  return (
    <div className="min-h-screen bg-bg-base tab-enter">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-0 flex items-start justify-between">
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
            Wallet
          </p>
          <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Wallet</h1>
        </div>
        <button
          className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light shadow-gold mt-10 select-none"
          aria-label="Add"
        >
          +
        </button>
      </div>

      {/* ── Tab toggle ───────────────────────────────────────────────────── */}
      <div className="mx-4 mt-5">
        <PillGroup
          options={['Cards', 'Banks'] as Tab[]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {/* ── Cards ────────────────────────────────────────────────────────── */}
      {tab === 'Cards' && (
        <div className="px-4 mt-5 flex flex-col gap-4">
          {cards.map(card => (
            <CardVisual key={card.id} card={card} />
          ))}
        </div>
      )}

      {/* ── Banks ────────────────────────────────────────────────────────── */}
      {tab === 'Banks' && (
        <div className="mx-4 mt-4 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {banks.map(bank => {
            const linked = cardsForBank(bank.id, cards)
            return (
              <div key={bank.id} className="flex items-center gap-3 px-4 py-4">
                <div className="w-10 h-10 rounded-[10px] bg-bg-overlay flex items-center justify-center text-lg flex-shrink-0">
                  🏦
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink">{bank.name}</p>
                  <p className="text-[11px] text-ink-muted">{bank.type} · ••••{bank.last4}</p>
                </div>
                <p className="text-[12px] text-ink-faint flex-shrink-0">
                  {linked.length} {linked.length === 1 ? 'card' : 'cards'}
                </p>
              </div>
            )
          })}
        </div>
      )}

      <div className="h-10" />
    </div>
  )
}

/* ── Card visual ─────────────────────────────────────────────────────────── */

function CardVisual({ card }: { card: SeedCard }) {
  const { name, alias, type, last4, expires, cardholder, network, style, is_default } = card
  const isGold  = style === 'gold'
  const isGreen = style === 'green'

  const containerStyle: React.CSSProperties = isGold
    ? { background: 'linear-gradient(135deg, #b8860b 0%, #d4af37 40%, #f0d060 60%, #c8952a 100%)' }
    : {}

  const containerClass = cn(
    'relative rounded-card border overflow-hidden p-5 flex flex-col justify-between aspect-[1.586/1]',
    isGold  ? 'border-yellow-600/30'            : '',
    isGreen ? 'bg-[#0c2d1c] border-emerald/20'  : '',
    !isGold && !isGreen ? 'bg-[#13131f] border-white/[0.08]' : '',
  )

  const t1 = isGold ? 'text-yellow-950'    : 'text-ink-muted'
  const t2 = isGold ? 'text-yellow-900/70' : 'text-ink-faint'
  const t3 = isGold ? 'text-yellow-950'    : 'text-ink'
  const chipFill   = isGold ? '#8B7030' : '#3a3a4a'
  const chipStroke = isGold ? '#6b5a20' : '#2a2a3a'

  return (
    <div className={containerClass} style={containerStyle}>
      {/* Default badge */}
      {is_default && (
        <span className="absolute top-3 right-3 text-[8px] font-bold tracking-widest uppercase bg-black/20 px-2 py-0.5 rounded-full text-white/60">
          Default
        </span>
      )}

      {/* Top row */}
      <div className="flex items-center justify-between">
        <div>
          <p className={`text-[11px] font-bold tracking-[0.22em] ${t1}`}>{name}</p>
          {alias && <p className={`text-[9px] tracking-wide mt-0.5 ${t2}`}>{alias}</p>}
        </div>
        <p className={`text-[9px] font-medium tracking-[0.12em] uppercase ${t2}`}>{type}</p>
      </div>

      {/* Chip + NFC */}
      <div className="flex items-center gap-3 mt-3">
        <svg width="38" height="30" viewBox="0 0 38 30" className="opacity-75">
          <rect width="38" height="30" rx="4" fill={chipFill}/>
          <line x1="13" y1="0"  x2="13" y2="30" stroke={chipStroke} strokeWidth="1"/>
          <line x1="25" y1="0"  x2="25" y2="30" stroke={chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="10" x2="38" y2="10" stroke={chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="20" x2="38" y2="20" stroke={chipStroke} strokeWidth="1"/>
          <rect x="13" y="10" width="12" height="10" fill={chipStroke} opacity="0.4"/>
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className={t2}>
          <path d="M5 12.5a9 9 0 0114 0M1.5 9A14 14 0 0122.5 9M8.5 16a5 5 0 017 0M12 20h.01"/>
        </svg>
      </div>

      {/* Card number */}
      <p className={`text-[14px] font-mono tracking-[0.28em] mt-3 ${t1}`}>
        •••• •••• •••• {last4}
      </p>

      {/* Bottom row */}
      <div className="flex items-end justify-between mt-auto">
        <div className="flex gap-5">
          <div>
            <p className={`text-[7px] tracking-[0.1em] uppercase mb-0.5 ${t2}`}>Cardholder</p>
            <p className={`text-[10px] font-medium tracking-wider ${t1}`}>{cardholder}</p>
          </div>
          <div>
            <p className={`text-[7px] tracking-[0.1em] uppercase mb-0.5 ${t2}`}>Expires</p>
            <p className={`text-[10px] font-medium ${t1}`}>{expires}</p>
          </div>
        </div>
        <p className={`text-[15px] font-bold italic ${t3}`}>{network}</p>
      </div>
    </div>
  )
}
