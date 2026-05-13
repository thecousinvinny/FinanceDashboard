'use client'

import type { Card, CardTexture } from '@/types'
import { CARD_STYLE_DEFS } from '@/lib/cardStyles'

const G = (o: number) => `rgba(232,196,107,${o})`

function getTexturePattern(texture: CardTexture, id: string): React.ReactElement | null {
  if (texture === 'none') return null
  if (texture === 'diamonds') return (
    <pattern key={id} id={id} width="26" height="26" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <path d="M0,13 H26 M13,0 V26" stroke={G(0.18)} strokeWidth="0.55" fill="none"/>
    </pattern>
  )
  if (texture === 'slate') return (
    <pattern key={id} id={id} width="8" height="8" patternUnits="userSpaceOnUse">
      <path d="M8,0 L0,8 M0,0 L8,8" stroke={G(0.14)} strokeWidth="0.5" fill="none"/>
    </pattern>
  )
  if (texture === 'fractal') return (
    <pattern key={id} id={id} width="20" height="23.1" patternUnits="userSpaceOnUse">
      <polygon points="10,0 20,5.77 20,17.32 10,23.1 0,17.32 0,5.77" fill="none" stroke={G(0.2)} strokeWidth="0.5"/>
    </pattern>
  )
  if (texture === 'waves') return (
    <pattern key={id} id={id} width="40" height="14" patternUnits="userSpaceOnUse">
      <path d="M0,7 C10,0 10,14 20,7 C30,0 30,14 40,7" fill="none" stroke={G(0.2)} strokeWidth="0.6"/>
    </pattern>
  )
  if (texture === 'circuit') return (
    <pattern key={id} id={id} width="30" height="30" patternUnits="userSpaceOnUse">
      <path d="M0,10 H8 V22 H22 M22,0 V8 H30 M10,30 V22" fill="none" stroke={G(0.18)} strokeWidth="0.5"/>
      <circle cx="8"  cy="10" r="1.2" fill={G(0.28)}/>
      <circle cx="22" cy="22" r="1.2" fill={G(0.28)}/>
      <circle cx="22" cy="8"  r="0.8" fill={G(0.22)}/>
    </pattern>
  )
  // dots
  return (
    <pattern key={id} id={id} width="12" height="12" patternUnits="userSpaceOnUse">
      <circle cx="6" cy="6" r="0.9" fill={G(0.3)}/>
    </pattern>
  )
}

export function CardVisual({ card }: { card: Card }) {
  const { name, alias, type, last4, expires, cardholder, network, style, is_default } = card
  const texture  = card.texture ?? 'none'
  const def      = CARD_STYLE_DEFS[style] ?? CARD_STYLE_DEFS.black
  const patId    = `tex-${card.id}`
  const texEl    = getTexturePattern(texture, patId)

  return (
    <div
      className="relative rounded-card border overflow-hidden p-5 flex flex-col justify-between aspect-[1.586/1]"
      style={{ background: def.gradient, borderColor: 'rgba(255,255,255,0.08)' }}
    >
      {/* Texture overlay */}
      {texEl && (
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          preserveAspectRatio="xMidYMid slice"
        >
          <defs>{texEl}</defs>
          <rect width="100%" height="100%" fill={`url(#${patId})`} />
        </svg>
      )}

      {is_default && (
        <span
          className="absolute top-3 right-3 text-[8px] font-bold tracking-widest uppercase bg-black/20 px-2 py-0.5 rounded-full"
          style={{ color: def.textMuted }}
        >
          Default
        </span>
      )}

      <div className="relative flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold tracking-[0.22em]" style={{ color: def.textPrimary }}>{name}</p>
          {alias && <p className="text-[9px] tracking-wide mt-0.5" style={{ color: def.textMuted }}>{alias}</p>}
        </div>
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase" style={{ color: def.textMuted }}>{type ?? ''}</p>
      </div>

      <div className="relative flex items-center gap-3 mt-3">
        <svg width="38" height="30" viewBox="0 0 38 30" className="opacity-75">
          <rect width="38" height="30" rx="4" fill={def.chipFill}/>
          <line x1="13" y1="0"  x2="13" y2="30" stroke={def.chipStroke} strokeWidth="1"/>
          <line x1="25" y1="0"  x2="25" y2="30" stroke={def.chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="10" x2="38" y2="10" stroke={def.chipStroke} strokeWidth="1"/>
          <line x1="0"  y1="20" x2="38" y2="20" stroke={def.chipStroke} strokeWidth="1"/>
          <rect x="13" y="10" width="12" height="10" fill={def.chipStroke} opacity="0.4"/>
        </svg>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" style={{ color: def.textMuted }}>
          <path stroke="currentColor" d="M5 12.5a9 9 0 0114 0M1.5 9A14 14 0 0122.5 9M8.5 16a5 5 0 017 0M12 20h.01"/>
        </svg>
      </div>

      <p className="relative text-[14px] font-mono tracking-[0.28em] mt-3" style={{ color: def.textPrimary }}>
        •••• •••• •••• {last4 ?? '????'}
      </p>

      <div className="relative flex items-end justify-between mt-auto">
        <div className="flex gap-5">
          <div>
            <p className="text-[7px] tracking-[0.1em] uppercase mb-0.5" style={{ color: def.textMuted }}>Cardholder</p>
            <p className="text-[10px] font-medium tracking-wider" style={{ color: def.textPrimary }}>{cardholder ?? ''}</p>
          </div>
          {expires && (
            <div>
              <p className="text-[7px] tracking-[0.1em] uppercase mb-0.5" style={{ color: def.textMuted }}>Expires</p>
              <p className="text-[10px] font-medium" style={{ color: def.textPrimary }}>{expires}</p>
            </div>
          )}
        </div>
        <p className="text-[15px] font-bold italic" style={{ color: def.textPrimary }}>{network ?? ''}</p>
      </div>
    </div>
  )
}
