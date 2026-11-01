'use client'

import { useLayoutEffect, useMemo, useRef, useState } from 'react'
import { afterSlideTimeout, useScreenVisit } from '@/lib/tab-nav'
import { $fk, haptic } from '@/lib/utils'
import type { CfMonth } from '@/lib/profile-stats'

const MINUS = '−'
const H     = 170   // column area
const PAD_T = 18    // room for the selected value above a green column
const PAD_B = 16    // …and below a red one
const RED   = '#ef4444'
const sgn   = (n: number) => `${n < 0 ? MINUS : '+'}${$fk(Math.abs(n))}`

/** Grows once per screen visit (and per range: the columns remount) — transform only */
function useGrow() {
  const visit = useScreenVisit()
  const [grown, setGrown] = useState(false)
  useLayoutEffect(() => {
    setGrown(false)
    if (visit === 0) return
    return afterSlideTimeout(() => setGrown(true), 60)
  }, [visit])
  return grown
}

/**
 * Profile's cashflow: one column per month, green above the line when you kept
 * money and red below when you didn't. Tap or drag across it to read a month
 * underneath — In / Out / Subs / Net, its top categories and a few extras.
 */
export function CashflowCard({ months }: { months: CfMonth[] }) {
  const thisYear = months.length ? Number(months[months.length - 1].key.slice(0, 4)) : new Date().getFullYear()
  const years    = useMemo(() => [...new Set(months.map(m => Number(m.key.slice(0, 4))))].sort((a, b) => b - a), [months])
  const ranges   = useMemo(() => [{ id: '12m', label: '12 mo' }, ...years.map(y => ({ id: String(y), label: String(y) }))], [years])
  const [range, setRange] = useState('12m')
  const shown = useMemo(() => range === '12m' ? months.slice(-12) : months.filter(m => m.key.startsWith(range)), [months, range])
  const [selRaw, setSel] = useState<number | null>(null)
  const sel = selRaw !== null && selRaw < shown.length ? selRaw : shown.length - 1

  const inc = shown.reduce((s, m) => s + m.inc, 0)
  const out = shown.reduce((s, m) => s + m.exp, 0)
  const net = inc - out
  const rangeName = range === '12m' ? 'last 12 months' : Number(range) === thisYear ? `${range} so far` : range

  if (shown.length === 0) return null
  const m = shown[sel], prev = shown[sel - 1] ?? null
  const mNet = m.inc - m.exp
  const kept = m.inc > 0 ? Math.round((mNet / m.inc) * 100) : null
  const catMax = Math.max(...m.top.map(t => t[1]), 1)

  return (
    <div className="bg-bg-surface rounded-card p-4 select-none" style={{
      border: '0.5px solid rgba(201,168,76,0.25)', boxShadow: 'inset 0 0 20px rgba(201,168,76,0.05)',
      WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
    }}>
      <div className="flex items-center gap-2 mb-3">
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gold">Cashflow</p>
        <div className="flex gap-1.5 ml-auto">
          {ranges.map(r => (
            <button key={r.id} onClick={() => { setRange(r.id); setSel(null) }}
              className={`px-3 py-1 rounded-full text-[11px] font-semibold transition-colors ${range === r.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted'}`}>
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* Range total */}
      <div className="flex items-end justify-between gap-3 mb-3">
        <div>
          <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint">Net · {rangeName}</p>
          <p className="text-[32px] font-bold leading-none mt-1" style={{ fontFamily: 'var(--font-big-shoulders)', color: net >= 0 ? 'var(--sem-income)' : RED }}>
            {sgn(net)}
          </p>
        </div>
        <div className="flex gap-3 text-[12px] font-medium" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
          <span className="flex items-center gap-1" style={{ color: 'var(--sem-income)' }}><i className="w-[7px] h-[7px] rounded-[2px] inline-block" style={{ background: 'var(--sem-income)' }} />In {$fk(inc)}</span>
          <span className="flex items-center gap-1 text-gold"><i className="w-[7px] h-[7px] rounded-[2px] inline-block" style={{ background: 'var(--sem-expense)' }} />Out {$fk(out)}</span>
        </div>
      </div>

      <Columns key={range} months={shown} sel={sel} onSel={setSel} />

      {/* The month under the finger */}
      <div className="mt-3 pt-3 border-t border-ink/[0.06]">
        <div className="flex items-baseline justify-between mb-2.5">
          <p className="text-[13px] font-semibold text-ink">{m.long}</p>
          {prev && (
            <p className="text-[11px] text-ink-muted">
              {mNet - (prev.inc - prev.exp) >= 0 ? '↑' : '↓'} {$fk(Math.abs(mNet - (prev.inc - prev.exp)))} vs {prev.label}
            </p>
          )}
        </div>
        <div className="grid grid-cols-4">
          {([
            ['In',   $fk(m.inc), 'var(--sem-income)'],
            ['Out',  $fk(m.exp), 'var(--sem-expense)'],
            ['Subs', $fk(m.sub), 'var(--sem-sub)'],
            ['Net',  sgn(mNet),  mNet >= 0 ? 'var(--sem-income)' : RED],
          ] as const).map(([l, v, c], i) => (
            <div key={l} className={`min-w-0 ${i ? 'pl-2.5 border-l border-ink/[0.06]' : ''}`}>
              <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint">{l}</p>
              <p className="text-[18px] font-bold leading-tight whitespace-nowrap" style={{ fontFamily: 'var(--font-big-shoulders)', color: c }}>{v}</p>
            </div>
          ))}
        </div>
        {m.top.length > 0 && (
          <div className="mt-3 space-y-1.5">
            {m.top.map(([name, v]) => (
              <div key={name} className="grid items-center gap-2 text-[11px]" style={{ gridTemplateColumns: '76px 1fr 48px' }}>
                <span className="text-ink-muted truncate">{name}</span>
                <span className="h-[6px] rounded-full overflow-hidden bg-ink/[0.05]">
                  <span className="block h-full w-full rounded-full" style={{
                    background: 'linear-gradient(90deg, rgba(var(--sem-expense-rgb),0.95), rgba(var(--sem-expense-rgb),0.5))',
                    transform: `scaleX(${v / catMax})`, transformOrigin: 'left',
                    transition: 'transform 380ms cubic-bezier(0.22, 1, 0.36, 1)',
                  }} />
                </span>
                <span className="text-right text-ink" style={{ fontFamily: 'var(--font-big-shoulders)', fontSize: 12 }}>{$fk(v)}</span>
              </div>
            ))}
          </div>
        )}
        <p className="text-[10.5px] text-ink-muted mt-2.5">
          {m.n} expenses{kept !== null ? ` · kept ${kept}% of income` : ''}{m.saved > 0 ? ` · ${$fk(m.saved)} saved on discounts` : ''}
        </p>
      </div>
    </div>
  )
}

function Columns({ months, sel, onSel }: { months: CfMonth[]; sel: number; onSel: (i: number) => void }) {
  const grown = useGrow()
  const ref = useRef<HTMLDivElement>(null)
  const N = months.length
  const nets = months.map(m => m.inc - m.exp)
  const mx = Math.max(0, ...nets), mn = Math.min(0, ...nets), span = mx - mn || 1
  const inner = H - PAD_T - PAD_B
  const zero = PAD_T + (mx / span) * inner

  function pick(clientX: number) {
    const r = ref.current?.getBoundingClientRect()
    if (!r) return
    const i = Math.max(0, Math.min(N - 1, Math.floor(((clientX - r.left) / r.width) * N)))
    if (i !== sel) { onSel(i); haptic('tap') }
  }

  return (
    <div>
      <div
        ref={ref}
        className="relative flex"
        style={{ height: H, touchAction: 'pan-y', cursor: 'pointer' }}
        onPointerDown={e => pick(e.clientX)}
        onPointerMove={e => { if (e.pointerType === 'mouse' || e.buttons) pick(e.clientX) }}
      >
        <div className="absolute left-0 right-0 pointer-events-none" style={{ top: zero, height: 1, background: 'rgb(var(--rgb-ink) / 0.18)' }} />
        {months.map((m, i) => {
          const v = nets[i], pos = v >= 0, h = Math.max(2, (Math.abs(v) / span) * inner), on = i === sel
          return (
            <div key={m.key} className="relative flex-1 flex justify-center">
              <div style={{
                position: 'absolute', width: '58%', maxWidth: 26, height: h,
                ...(pos ? { bottom: H - zero } : { top: zero }),
                borderRadius: 5,
                background: pos
                  ? 'linear-gradient(180deg, var(--sem-income), rgba(var(--sem-income-rgb),0.5))'
                  : `linear-gradient(0deg, ${RED}, rgba(239,68,68,0.5))`,
                opacity: on ? 1 : 0.42,
                transform: `scaleY(${grown ? 1 : 0})`, transformOrigin: pos ? 'bottom' : 'top',
                transition: grown ? `transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 30}ms, opacity 200ms ease` : 'opacity 200ms ease',
              }} />
              {on && (
                <span className="absolute text-[11px] font-semibold whitespace-nowrap pointer-events-none" style={{
                  ...(pos ? { bottom: H - zero + h + 4 } : { top: zero + h + 3 }),
                  color: pos ? 'var(--sem-income)' : RED, fontFamily: 'var(--font-montserrat)',
                }}>
                  {sgn(v)}
                </span>
              )}
            </div>
          )
        })}
      </div>
      <div className="flex mt-1.5">
        {months.map((m, i) => (
          <span key={m.key} className={`flex-1 text-center text-[10px] ${i === sel ? 'text-ink font-semibold' : 'text-ink-faint'}`}>
            {N > 12 ? m.label[0] : m.label}
          </span>
        ))}
      </div>
    </div>
  )
}
