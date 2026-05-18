import type { CardStyle, CardTexture } from '@/types'

export interface CardStyleDef {
  label:       string
  gradient:    string
  chipFill:    string
  chipStroke:  string
  textPrimary: string
  textMuted:   string
}

export const CARD_STYLE_DEFS: Record<CardStyle, CardStyleDef> = {
  // ── Originals ──────────────────────────────────────────────────────────────
  black: {
    label:       'Black',
    gradient:    'linear-gradient(135deg, #0d0d14 0%, #1c1c2e 50%, #0d0d14 100%)',
    chipFill:    '#3a3a4a', chipStroke: '#2a2a3a',
    textPrimary: 'rgba(240,240,248,0.85)', textMuted: 'rgba(240,240,248,0.4)',
  },
  gold: {
    label:       'Gold',
    gradient:    'linear-gradient(135deg, #b8860b 0%, #d4af37 35%, #f0d060 55%, #c8952a 80%, #8b6008 100%)',
    chipFill:    '#8B7030', chipStroke: '#6b5a20',
    textPrimary: 'rgba(28,12,0,0.85)',   textMuted: 'rgba(28,12,0,0.55)',
  },
  green: {
    label:       'Emerald',
    gradient:    'linear-gradient(135deg, #051510 0%, #0c2d1c 50%, #0f3824 100%)',
    chipFill:    '#1a4d2e', chipStroke: '#0f3a22',
    textPrimary: 'rgba(74,222,128,0.85)', textMuted: 'rgba(74,222,128,0.45)',
  },
  // ── New ────────────────────────────────────────────────────────────────────
  platinum: {
    label:       'Platinum',             // Amex Platinum
    gradient:    'linear-gradient(135deg, #1e1e1e 0%, #3d3d3d 30%, #616161 55%, #3a3a3a 75%, #1e1e1e 100%)',
    chipFill:    '#585858', chipStroke: '#424242',
    textPrimary: 'rgba(255,255,255,0.9)', textMuted: 'rgba(255,255,255,0.5)',
  },
  sapphire: {
    label:       'Sapphire',             // Chase Sapphire Reserve
    gradient:    'linear-gradient(135deg, #060f1e 0%, #0e2044 50%, #162d60 100%)',
    chipFill:    '#1a3060', chipStroke: '#0e2048',
    textPrimary: 'rgba(147,197,253,0.9)', textMuted: 'rgba(147,197,253,0.5)',
  },
  cobalt: {
    label:       'Cobalt',               // Hilton Surpass / Barclays
    gradient:    'linear-gradient(135deg, #04091e 0%, #0b1652 50%, #11218a 100%)',
    chipFill:    '#162460', chipStroke: '#0c1848',
    textPrimary: 'rgba(165,180,252,0.9)', textMuted: 'rgba(165,180,252,0.5)',
  },
  graphite: {
    label:       'Graphite',             // Apple Card / Citi
    gradient:    'linear-gradient(135deg, #141414 0%, #2c2c2c 50%, #1a1a1a 100%)',
    chipFill:    '#404040', chipStroke: '#2c2c2c',
    textPrimary: 'rgba(255,255,255,0.75)', textMuted: 'rgba(255,255,255,0.38)',
  },
  ruby: {
    label:       'Ruby',                 // Wells Fargo / Citi Double Cash
    gradient:    'linear-gradient(135deg, #14000a 0%, #3d0018 50%, #5e0020 100%)',
    chipFill:    '#5a0018', chipStroke: '#420010',
    textPrimary: 'rgba(252,165,165,0.9)', textMuted: 'rgba(252,165,165,0.5)',
  },
  midnight: {
    label:       'Midnight',             // Citi Prestige
    gradient:    'linear-gradient(135deg, #040410 0%, #08081e 50%, #0c0c2c 100%)',
    chipFill:    '#14143a', chipStroke: '#0c0c28',
    textPrimary: 'rgba(196,181,253,0.85)', textMuted: 'rgba(196,181,253,0.45)',
  },
  rose: {
    label:       'Rose',                 // Rose Gold / Millennial
    gradient:    'linear-gradient(135deg, #120608 0%, #300e16 50%, #481420 100%)',
    chipFill:    '#5c1a28', chipStroke: '#421018',
    textPrimary: 'rgba(251,207,232,0.9)', textMuted: 'rgba(251,207,232,0.5)',
  },
  forest: {
    label:       'Forest',               // Green status card
    gradient:    'linear-gradient(135deg, #030806 0%, #061410 50%, #091e18 100%)',
    chipFill:    '#0e2e22', chipStroke: '#082018',
    textPrimary: 'rgba(134,239,172,0.85)', textMuted: 'rgba(134,239,172,0.45)',
  },
  obsidian: {
    label:       'Obsidian',             // Luxury black-purple
    gradient:    'linear-gradient(135deg, #060410 0%, #0e081e 50%, #16102e 100%)',
    chipFill:    '#22103c', chipStroke: '#160a2a',
    textPrimary: 'rgba(216,180,254,0.85)', textMuted: 'rgba(216,180,254,0.45)',
  },
}

export const STYLE_GROUPS: { label: string; styles: CardStyle[] }[] = [
  { label: 'Neutral', styles: ['black', 'graphite', 'platinum', 'midnight'] },
  { label: 'Blue',    styles: ['sapphire', 'cobalt', 'obsidian'] },
  { label: 'Green',   styles: ['green', 'forest'] },
  { label: 'Warm',    styles: ['gold', 'rose', 'ruby'] },
]

export const CARD_TEXTURE_DEFS: Record<CardTexture, { label: string }> = {
  none:       { label: 'None'    },
  diamonds:   { label: 'Diamond' },
  slate:      { label: 'Slate'   },
  fractal:    { label: 'Hex'     },
  grid:       { label: 'Grid'    },
  chevron:    { label: 'Chevron' },
  carbon:     { label: 'Carbon'  },
  topography: { label: 'Topo'    },
}

