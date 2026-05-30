export type Theme = 'obsidian' | 'charcoal-slate' | 'cool-linen' | 'midnight-teal'

export interface ThemeDef {
  id:        Theme
  label:     string
  subtitle:  string
  swatches:  [string, string, string]
  gradient?: string  // when set, renders a single gradient swatch instead of 3 flat chips
}

export const THEMES: ThemeDef[] = [
  { id: 'obsidian',       label: 'Obsidian',       subtitle: 'Dark',  swatches: ['#0A0A0B', '#16161B', '#1A1A1E'] },
  { id: 'charcoal-slate', label: 'Charcoal Slate', subtitle: 'Dark',  swatches: ['#191B1F', '#21242A', '#2A2D35'] },
  { id: 'cool-linen',     label: 'Cool Linen',     subtitle: 'Light', swatches: ['#F0F2F5', '#E8EAEE', '#DFE2E7'] },
  {
    id:       'midnight-teal',
    label:    'Midnight Teal',
    subtitle: 'Dark',
    swatches: ['#161E27', '#2DD4BF', '#22D3EE'],
    gradient: 'linear-gradient(135deg, #2DD4BF 0%, #22D3EE 100%)',
  },
]

const THEME_BG: Record<Theme, string> = {
  'obsidian':       '#0A0A0B',
  'charcoal-slate': '#191B1F',
  'cool-linen':     '#F0F2F5',
  'midnight-teal':  '#0E151D',
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.remove('charcoal-slate', 'cool-linen', 'light', 'midnight-teal')
  document.documentElement.style.colorScheme = ''

  if (t === 'charcoal-slate') {
    document.documentElement.classList.add('charcoal-slate')
  } else if (t === 'cool-linen') {
    document.documentElement.classList.add('cool-linen')
    document.documentElement.style.colorScheme = 'light'
  } else if (t === 'midnight-teal') {
    document.documentElement.classList.add('midnight-teal')
  }

  document.documentElement.style.background = THEME_BG[t]
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_BG[t])
  localStorage.setItem('theme', t)
}

export function readTheme(): Theme {
  if (typeof window === 'undefined') return 'obsidian'
  const stored = localStorage.getItem('theme')
  if (stored === 'charcoal-slate') return 'charcoal-slate'
  if (stored === 'cool-linen')     return 'cool-linen'
  if (stored === 'midnight-teal')  return 'midnight-teal'
  return 'obsidian'
}
