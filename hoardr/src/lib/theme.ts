export type Theme = 'obsidian' | 'charcoal-slate' | 'slate-mist' | 'midnight-teal'

export interface ThemeDef {
  id:       Theme
  label:    string
  subtitle: string
  swatches: [string, string, string]  // CSS color strings — may be flat hex or gradient
}

export const THEMES: ThemeDef[] = [
  { id: 'obsidian',       label: 'Obsidian',       subtitle: 'Dark',  swatches: ['#0A0A0B', '#16161B', '#1A1A1E'] },
  { id: 'charcoal-slate', label: 'Charcoal Slate', subtitle: 'Dark',  swatches: ['#191B1F', '#21242A', '#2A2D35'] },
  { id: 'slate-mist',     label: 'Slate Mist',     subtitle: 'Light', swatches: ['#D8DCE2', '#E4E8EE', '#C0C6CE'] },
  { id: 'midnight-teal', label: 'Midnight Teal', subtitle: 'Dark',  swatches: ['#141414', '#1C1F22', 'linear-gradient(135deg, #2DD4BF, #22D3EE)'] },
]

const THEME_BG: Record<Theme, string> = {
  'obsidian':       '#0A0A0B',
  'charcoal-slate': '#191B1F',
  'slate-mist':     '#D8DCE2',
  'midnight-teal':  '#141414',
}

export function applyTheme(t: Theme) {
  document.documentElement.classList.remove('charcoal-slate', 'slate-mist', 'light', 'midnight-teal')
  document.documentElement.style.colorScheme = ''

  if (t === 'charcoal-slate') {
    document.documentElement.classList.add('charcoal-slate')
  } else if (t === 'slate-mist') {
    document.documentElement.classList.add('slate-mist')
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
  if (stored === 'slate-mist')     return 'slate-mist'
  if (stored === 'midnight-teal')  return 'midnight-teal'
  return 'obsidian'
}
