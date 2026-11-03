'use client'

import { useState, useRef, useEffect } from 'react'
import { PaceChart, type HeroSeries } from './PaceChart'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { $f, $fc, $fk } from '@/lib/utils'
import { useScreenVisit } from '@/lib/tab-nav'
import { useHeroHandoff } from '@/lib/hero-handoff'

/** Stats strip: whole dollars, compact only past what a quarter of the card fits */
const stat = (v: number) => (Math.abs(v) >= 100_000 ? $fk(v) : $f(v))

interface Props {
  spent: number
  month: HeroSeries
  year:  HeroSeries
  /** On the greeting card: numbers roll from the card's entrance, not a screen visit */
  greeting?: { rollAt: (ms: number) => number; chartDelay: number }
}

function fmtInt(n: number)   { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }
const MINUS = '−'

export function HomeHero({ spent, month, year, greeting }: Props) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [view,     setView]     = useState<'month' | 'year'>('month')

  const swipeStart   = useRef<{ x: number; y: number } | null>(null)
  const isSwiping    = useRef(false)
  const gestureMode  = useRef<'undecided' | 'swiping' | 'scrubbing'>('undecided')

  useEffect(() => { setHoverIdx(null) }, [view])

  // The greeting's copy of this card is flying onto it (lib/hero-handoff):
  // stay hidden until it lands, and skip this visit's entrance — it's drawn.
  const visit     = useScreenVisit()
  const flying    = useHeroHandoff() && !greeting
  const stillOn   = useRef<number | null>(null)
  if (flying && stillOn.current !== visit) stillOn.current = visit
  const still     = !greeting && stillOn.current === visit
  const rollAt    = (ms: number) => greeting ? greeting.rollAt(ms) : still ? -1e6 : undefined

  const isYear  = view === 'year'
  const s       = isYear ? year : month
  const n       = s.cum.length
  const total   = isYear ? (year.cum[year.cum.length - 1] ?? 0) : spent
  const income  = s.inc.reduce((a, v) => a + v, 0)
  const net     = income - total

  // Last month at the same point, for the pace tag
  const prevAt  = s.prev && n ? s.prev[Math.min(n, s.prev.length) - 1] : null
  const pace    = prevAt ? ((s.cum[n - 1] - prevAt) / prevAt) * 100 : null

  // Stats strip: subs split out of the total, so Spent + Subs = the hero number
  const subs      = s.sub.reduce((a, v) => a + v, 0)
  const avg       = n ? total / n : 0

  // Capture-phase swipe detection — intercepts quick horizontal flicks before PaceChart sees them.
  // gestureMode coordinates with PaceChart's long-press scrub: once scrubbing, swipe is suppressed.
  function onTouchStartCapture(e: React.TouchEvent) {
    swipeStart.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    isSwiping.current   = false
    gestureMode.current = 'undecided'
  }
  function onTouchMoveCapture(e: React.TouchEvent) {
    if (!swipeStart.current) return
    if (gestureMode.current === 'scrubbing') return  // PaceChart owns this gesture
    const dx = e.touches[0].clientX - swipeStart.current.x
    const dy = e.touches[0].clientY - swipeStart.current.y
    if (!isSwiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      isSwiping.current   = true
      gestureMode.current = 'swiping'
    }
    if (isSwiping.current) e.stopPropagation()
  }
  function onTouchEndCapture(e: React.TouchEvent) {
    if (!swipeStart.current) return
    if (isSwiping.current) {
      const dx = e.changedTouches[0].clientX - swipeStart.current.x
      if (Math.abs(dx) > 40) setView(v => v === 'month' ? 'year' : 'month')
    }
    swipeStart.current  = null
    isSwiping.current   = false
  }

  // Desktop: mouse-drag flick mirrors the touch swipe
  function onMouseDownSwipe(e: React.MouseEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY }
    isSwiping.current  = false
  }
  function onMouseMoveSwipe(e: React.MouseEvent) {
    if (!swipeStart.current) return
    const dx = e.clientX - swipeStart.current.x
    const dy = e.clientY - swipeStart.current.y
    if (!isSwiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) isSwiping.current = true
  }
  function onMouseUpSwipe(e: React.MouseEvent) {
    if (!swipeStart.current) return
    if (isSwiping.current) {
      const dx = e.clientX - swipeStart.current.x
      if (Math.abs(dx) > 40) setView(v => v === 'month' ? 'year' : 'month')
    }
    swipeStart.current = null
    isSwiping.current  = false
  }

  const legendText = 'flex items-center gap-1 text-[10px] font-medium'
  const legendFont = { fontFamily: 'var(--font-big-shoulders)' }
  const dash = <span className="inline-block flex-shrink-0" style={{ width: 10, borderTop: '1.5px dashed rgb(var(--rgb-ink) / 0.4)' }} />
  const sq   = <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'var(--sem-expense, #D4AF37)' }} />

  let legend: React.ReactNode
  if (hoverIdx !== null) {
    const cur = s.cum[hoverIdx], p = s.prev?.[hoverIdx]
    const diff = p != null ? cur - p : null
    legend = (
      <>
        <span className={`${legendText} text-gold`} style={legendFont}>{sq}{$fc(cur)}</span>
        {p != null && <span className={`${legendText} text-ink-muted`} style={legendFont}>{dash}{s.prevName} {$fc(p)}</span>}
        {diff !== null && (
          <span className={legendText} style={{ ...legendFont, color: diff <= 0 ? 'var(--sem-income)' : '#ef4444' }}>
            {diff <= 0 ? MINUS : '+'}{$fc(Math.abs(diff))}
          </span>
        )}
      </>
    )
  } else {
    legend = (
      <>
        <span className={`${legendText} text-gold`} style={legendFont}>{sq}{$fk(total)}</span>
        {prevAt !== null && <span className={`${legendText} text-ink-muted`} style={legendFont}>{dash}{s.prevName} {$fk(prevAt)}</span>}
        {pace !== null && (
          <span className={legendText} style={{ ...legendFont, color: pace <= 0 ? 'var(--sem-income)' : '#ef4444' }}>
            {pace <= 0 ? '↓' : '↑'} {Math.abs(pace).toFixed(0)}%
          </span>
        )}
      </>
    )
  }

  const statLbl = 'text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint truncate'
  const statNum: React.CSSProperties = { fontFamily: 'var(--font-big-shoulders)', fontSize: 18, fontWeight: 700, lineHeight: 1.15, display: 'flex', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }

  return (
    <div
      className={`${greeting ? '' : 'mx-4 mt-5 '}bg-bg-surface border border-ink/[0.06] rounded-card overflow-hidden`}
      style={{ position: 'relative', height: 292, visibility: flying ? 'hidden' : undefined }}
      data-home-hero={greeting ? undefined : ''}
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
      onMouseDown={onMouseDownSwipe}
      onMouseMove={onMouseMoveSwipe}
      onMouseUp={onMouseUpSwipe}
      onMouseLeave={onMouseUpSwipe}
    >
      {/* Two-panel chart rail — slides horizontally on view switch */}
      <div style={{ position: 'absolute', top: 0, left: 0, height: 240, width: '200%', display: 'flex',
        transform: isYear ? 'translateX(-50%)' : 'translateX(0)', transition: 'transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)' }}>
        <div style={{ width: '50%', height: '100%', position: 'relative' }}>
          <PaceChart series={month} onHover={isYear ? undefined : setHoverIdx} gestureMode={gestureMode} delay={greeting?.chartDelay} still={still} />
        </div>
        <div style={{ width: '50%', height: '100%', position: 'relative' }}>
          <PaceChart series={year} onHover={isYear ? setHoverIdx : undefined} gestureMode={gestureMode} delay={greeting?.chartDelay} still={still} />
        </div>
      </div>

      {/* Fades the chart behind the hero number into the card */}
      <div className="absolute left-0 right-0 top-0 pointer-events-none" style={{
        height: 240, zIndex: 1,
        background: 'linear-gradient(90deg, rgb(var(--rgb-bg-surface) / 0.85) 0%, rgb(var(--rgb-bg-surface) / 0.5) 45%, rgb(var(--rgb-bg-surface) / 0) 70%)',
      }} />

      {/* Text overlay — hero number + legend */}
      <div className="absolute left-0 right-0 pointer-events-none" style={{ top: 0, padding: '14px 16px', zIndex: 2 }}>
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-ink-faint">
            {hoverIdx !== null ? s.labels[hoverIdx] : isYear ? 'This Year' : 'This Month'}
          </p>
          <div className="flex items-center gap-1 pointer-events-auto">
            {(['month', 'year'] as const).map(v => (
              <button key={v} type="button" aria-label={v === 'month' ? 'This month' : 'This year'} onClick={() => setView(v)}
                className="flex items-center justify-center cursor-pointer" style={{ padding: 4, margin: -4 }}>
                <span className="block rounded-full transition-all duration-300" style={{
                  width: view === v ? 10 : 4, height: 4,
                  background: view === v ? 'rgb(var(--rgb-ink) / 0.45)' : 'rgb(var(--rgb-ink) / 0.18)',
                }} />
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2.5 mb-3">{legend}</div>

        <div className="flex items-start" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
          <span className="text-[22px] font-light text-ink-muted mt-[7px] mr-0.5">$</span>
          <span className="text-[52px] font-bold leading-none tracking-[-0.04em] text-ink">
            <SlotNumber value={Math.floor(total)} format={fmtInt} startAt={rollAt(260)} />
            <span className="text-[32px] text-ink-muted font-light">.{fmtCents(total)}</span>
          </span>
        </div>
      </div>

      {/* Quick stats */}
      <div className="absolute left-0 right-0 bottom-0 flex border-t border-ink/[0.06]" style={{ height: 52, zIndex: 2 }}>
        {([
          ['Spent',  <SlotNumber key="s" value={Math.max(0, total - subs)} format={stat} startAt={rollAt(520)} />, 'var(--sem-expense)'],
          ['Subs',   <SlotNumber key="u" value={subs} format={stat} startAt={rollAt(580)} />, 'var(--sem-sub)'],
          ['Net',    <SlotNumber key="n" value={Math.abs(net)} format={v => `${net >= 0 ? '+' : MINUS}${stat(v)}`} startAt={rollAt(640)} />, net >= 0 ? 'var(--sem-income)' : '#ef4444'],
          [isYear ? 'Avg / mo' : 'Avg / day', <SlotNumber key="a" value={avg} format={stat} startAt={rollAt(700)} />, undefined],
        ] as const).map(([label, value, color], i) => (
          <div key={label} className={`flex-1 min-w-0${i ? ' border-l border-ink/[0.06]' : ''}`} style={{ padding: i ? '8px 0 0 10px' : '8px 0 0 16px' }}>
            <p className={statLbl}>{label}</p>
            <p className={color ? undefined : 'text-ink'} style={{ ...statNum, color }}>{value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
