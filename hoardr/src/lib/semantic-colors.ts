export type FlatColor     = { type: 'flat';     hex: string }
export type GradientColor = { type: 'gradient'; from: string; to: string; angle: number }
export type ColorPref     = FlatColor | GradientColor

export interface SemanticColors {
  income?:  ColorPref
  expense?: ColorPref
  sub?:     ColorPref
}

function hexToRgb(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16)
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`
}

export function getSemanticColors(): SemanticColors {
  if (typeof window === 'undefined') return {}
  try { return JSON.parse(localStorage.getItem('sem-colors') ?? '{}') as SemanticColors }
  catch { return {} }
}

export function setSemanticColors(colors: SemanticColors) {
  localStorage.setItem('sem-colors', JSON.stringify(colors))
  applySemanticColors(colors)
  window.dispatchEvent(new CustomEvent('sem-colors-changed'))
}

export function applySemanticColors(colors: SemanticColors = getSemanticColors()) {
  const el = document.documentElement

  // Income
  const inc = colors.income
  if (inc) {
    if (inc.type === 'flat') {
      el.style.setProperty('--sem-income',       inc.hex)
      el.style.setProperty('--sem-income-rgb',   hexToRgb(inc.hex))
      el.style.setProperty('--sem-income-from',  inc.hex)
      el.style.setProperty('--sem-income-to',    inc.hex)
      el.style.setProperty('--sem-income-angle', '135deg')
      el.removeAttribute('data-inc-grad')
    } else {
      el.style.setProperty('--sem-income',       inc.from)
      el.style.setProperty('--sem-income-rgb',   hexToRgb(inc.from))
      el.style.setProperty('--sem-income-from',  inc.from)
      el.style.setProperty('--sem-income-to',    inc.to)
      el.style.setProperty('--sem-income-angle', `${inc.angle}deg`)
      el.setAttribute('data-inc-grad', '')
    }
  } else {
    el.style.removeProperty('--sem-income')
    el.style.removeProperty('--sem-income-rgb')
    el.style.removeProperty('--sem-income-from')
    el.style.removeProperty('--sem-income-to')
    el.style.removeProperty('--sem-income-angle')
    el.removeAttribute('data-inc-grad')
  }

  // Expense
  const exp = colors.expense
  if (exp) {
    if (exp.type === 'flat') {
      el.style.setProperty('--sem-expense',       exp.hex)
      el.style.setProperty('--sem-expense-rgb',   hexToRgb(exp.hex))
      el.style.setProperty('--sem-expense-from',  exp.hex)
      el.style.setProperty('--sem-expense-to',    exp.hex)
      el.style.setProperty('--sem-expense-angle', '135deg')
      el.removeAttribute('data-exp-grad')
    } else {
      el.style.setProperty('--sem-expense',       exp.from)
      el.style.setProperty('--sem-expense-rgb',   hexToRgb(exp.from))
      el.style.setProperty('--sem-expense-from',  exp.from)
      el.style.setProperty('--sem-expense-to',    exp.to)
      el.style.setProperty('--sem-expense-angle', `${exp.angle}deg`)
      el.setAttribute('data-exp-grad', '')
    }
  } else {
    el.style.removeProperty('--sem-expense')
    el.style.removeProperty('--sem-expense-rgb')
    el.style.removeProperty('--sem-expense-from')
    el.style.removeProperty('--sem-expense-to')
    el.style.removeProperty('--sem-expense-angle')
    el.removeAttribute('data-exp-grad')
  }

  // Sub
  const sub = colors.sub
  if (sub) {
    if (sub.type === 'flat') {
      el.style.setProperty('--sem-sub',       sub.hex)
      el.style.setProperty('--sem-sub-from',  sub.hex)
      el.style.setProperty('--sem-sub-to',    sub.hex)
      el.style.setProperty('--sem-sub-angle', '135deg')
      el.removeAttribute('data-sub-grad')
    } else {
      el.style.setProperty('--sem-sub',       sub.from)
      el.style.setProperty('--sem-sub-from',  sub.from)
      el.style.setProperty('--sem-sub-to',    sub.to)
      el.style.setProperty('--sem-sub-angle', `${sub.angle}deg`)
      el.setAttribute('data-sub-grad', '')
    }
  } else {
    el.style.removeProperty('--sem-sub')
    el.style.removeProperty('--sem-sub-from')
    el.style.removeProperty('--sem-sub-to')
    el.style.removeProperty('--sem-sub-angle')
    el.removeAttribute('data-sub-grad')
  }
}
