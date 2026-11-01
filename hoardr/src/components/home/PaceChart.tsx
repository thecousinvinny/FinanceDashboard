'use client'

import { useState, useRef, useEffect, useMemo, type MutableRefObject } from 'react'
import { haptic } from '@/lib/utils'
import { afterSlide, useScreenVisit } from '@/lib/tab-nav'

/** One view of the hero: running spend across a month (days) or a year (months) */
export interface HeroSeries {
  slots:    number            // x positions: days in the month, or 12
  labels:   string[]          // one per slot ("Oct 14", "March")
  cum:      number[]          // running spend so far (length = slots elapsed)
  prev:     number[] | null   // last month's running spend, full length
  prevName: string | null     // "Sep"
  out:      number[]          // spend per slot, subs included
  sub:      number[]          // subscription payments per slot (for the stats strip)
  inc:      number[]          // income per slot
}

type GestureMode = 'undecided' | 'swiping' | 'scrubbing'

function readVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback
}

const W = 300, H = 200
const TOP = 62          // clears the hero number's baseline on the left
const BOT = H - 6

/**
 * Hoard's hero chart: this period's running spend as a soft gold area, last
 * month's as a dashed line behind it, and a pulsing dot where today is.
 * Long-press (touch) or hover (mouse) scrubs; HomeHero shows the values.
 */
export function PaceChart({ series, onHover, gestureMode, delay, still }: {
  series:       HeroSeries
  onHover?:     (idx: number | null) => void
  gestureMode?: MutableRefObject<GestureMode>
  /** ms before the draw-in (the greeting times it off its card) */
  delay?:       number
  /** Already drawn: no draw-in, the dot is just there (the greeting handoff) */
  still?:       boolean
}) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const [colorRev, setColorRev] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  const seriesRef  = useRef(series)
  const onHoverRef = useRef(onHover)
  useEffect(() => { seriesRef.current  = series  }, [series])
  useEffect(() => { onHoverRef.current = onHover }, [onHover])

  // Touch: long-press activates scrub; a quick swipe belongs to HomeHero
  const touchStartRef  = useRef<{ x: number; y: number } | null>(null)
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const scrubbingRef   = useRef(false)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const cancelTimer = () => { if (longPressTimer.current) { clearTimeout(longPressTimer.current); longPressTimer.current = null } }
    const idxAt = (clientX: number) => {
      const s = seriesRef.current, rect = el.getBoundingClientRect()
      const i = Math.round(((clientX - rect.left) / rect.width) * (s.slots - 1))
      return Math.max(0, Math.min(s.cum.length - 1, i))
    }
    function onStart(e: TouchEvent) {
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
      scrubbingRef.current  = false
      longPressTimer.current = setTimeout(() => {
        longPressTimer.current = null
        if (gestureMode && gestureMode.current !== 'undecided') return
        scrubbingRef.current = true
        if (gestureMode) gestureMode.current = 'scrubbing'
        haptic('tap')
        const i = idxAt(touchStartRef.current!.x)
        setHoverIdx(i); onHoverRef.current?.(i)
      }, 300)
    }
    function onMove(e: TouchEvent) {
      if (!touchStartRef.current) return
      if (gestureMode?.current === 'swiping') { cancelTimer(); return }
      if (!scrubbingRef.current) {
        const dx = Math.abs(e.touches[0].clientX - touchStartRef.current.x)
        const dy = Math.abs(e.touches[0].clientY - touchStartRef.current.y)
        if (dx > 8 || dy > 8) cancelTimer()
        return
      }
      e.preventDefault()
      const i = idxAt(e.touches[0].clientX)
      setHoverIdx(i); onHoverRef.current?.(i)
    }
    function onEnd() {
      cancelTimer()
      scrubbingRef.current = false
      if (gestureMode && gestureMode.current === 'scrubbing') gestureMode.current = 'undecided'
      touchStartRef.current = null
      setHoverIdx(null); onHoverRef.current?.(null)
    }
    el.addEventListener('touchstart',  onStart, { passive: true  })
    el.addEventListener('touchmove',   onMove,  { passive: false })
    el.addEventListener('touchend',    onEnd,   { passive: true  })
    el.addEventListener('touchcancel', onEnd,   { passive: true  })
    return () => {
      el.removeEventListener('touchstart',  onStart)
      el.removeEventListener('touchmove',   onMove)
      el.removeEventListener('touchend',    onEnd)
      el.removeEventListener('touchcancel', onEnd)
      cancelTimer()
    }
  }, [])  // gestureMode is a stable ref object; setters are stable

  useEffect(() => {
    const handler = () => setColorRev(r => r + 1)
    window.addEventListener('sem-colors-changed', handler)
    return () => window.removeEventListener('sem-colors-changed', handler)
  }, [])

  // WebKit SVG won't resolve var() in gradient stops — read the colors
  const expColor = readVar('--sem-expense', '#D4AF37')
  const inkRgb   = readVar('--rgb-ink', '247 247 245')

  const { cum, prev, slots } = series
  const n = cum.length
  const max = Math.max(cum[n - 1] ?? 0, prev?.[prev.length - 1] ?? 0, 1) * 1.06
  const toX = (i: number) => slots <= 1 ? W / 2 : (i / (slots - 1)) * W
  const toY = (v: number) => BOT - (v / max) * (BOT - TOP)

  // Same soft curve the old daily chart drew: horizontal tangents at each point
  function curve(vals: number[]) {
    if (vals.length < 2) return ''
    let d = `M${toX(0)},${toY(vals[0]).toFixed(1)}`
    for (let i = 0; i < vals.length - 1; i++) {
      const x1 = toX(i), x2 = toX(i + 1), y1 = toY(vals[i]), y2 = toY(vals[i + 1]), dx = (x2 - x1) * 0.4
      d += ` C${(x1 + dx).toFixed(1)},${y1.toFixed(1)} ${(x2 - dx).toFixed(1)},${y2.toFixed(1)} ${x2.toFixed(1)},${y2.toFixed(1)}`
    }
    return d
  }
  const area = (vals: number[]) => vals.length < 2 ? '' : `${curve(vals)} L${toX(vals.length - 1)},${H} L${toX(0)},${H} Z`

  // Gradient peaks just under the line's highest point and fades to nothing
  const peak = toY(cum[n - 1] ?? 0) / H
  const g = { before: Math.max(0, peak - 0.08), peak, mid1: Math.min(1, peak + 0.3), mid2: Math.min(1, peak + 0.6) }
  const prevPeak = prev ? toY(prev[prev.length - 1]) / H : 0

  // Replays on new data and on each visit (kept-alive screens mount hidden)
  const visit   = useScreenVisit()
  const animKey = `${slots}-${n}-${Math.round(cum[n - 1] ?? 0)}-${colorRev}-${visit}`
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const revealDelay = useMemo(() => delay ?? afterSlide(), [animKey])

  function handleMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const i = Math.max(0, Math.min(n - 1, Math.round(((e.clientX - rect.left) / rect.width) * (slots - 1))))
    if (i !== hoverIdx) { setHoverIdx(i); onHover?.(i) }
  }
  function handleMouseLeave() { setHoverIdx(null); onHover?.(null) }

  if (n === 0) return null
  const pct = (x: number, total: number) => `${(x / total) * 100}%`
  const endX = toX(n - 1), endY = toY(cum[n - 1])
  const dots = hoverIdx === null ? [] : [
    { y: toY(cum[hoverIdx]), color: expColor },
    ...(prev && prev[hoverIdx] != null ? [{ y: toY(prev[hoverIdx]), color: `rgb(${inkRgb} / 0.6)` }] : []),
  ]

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full select-none"
      style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      <div key={animKey} className="absolute inset-0" style={{ animation: still ? 'none' : `spark-clip-reveal 1s cubic-bezier(0.45,0,0.2,1) ${revealDelay}ms both` }}>
        <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" overflow="visible">
          <defs>
            <linearGradient id="pace-grad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset={0}        stopColor={expColor} stopOpacity={0}    />
              <stop offset={g.before} stopColor={expColor} stopOpacity={0}    />
              <stop offset={g.peak}   stopColor={expColor} stopOpacity={0.95} />
              <stop offset={g.mid1}   stopColor={expColor} stopOpacity={0.55} />
              <stop offset={g.mid2}   stopColor={expColor} stopOpacity={0.15} />
              <stop offset={1}        stopColor={expColor} stopOpacity={0}    />
            </linearGradient>
            <linearGradient id="pace-prev-grad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset={prevPeak}               stopColor={`rgb(${inkRgb})`} stopOpacity={0.1} />
              <stop offset={Math.min(1, prevPeak + 0.5)} stopColor={`rgb(${inkRgb})`} stopOpacity={0} />
            </linearGradient>
          </defs>

          {prev && <path d={area(prev)} fill="url(#pace-prev-grad)" stroke="none" />}
          <path d={area(cum)} fill="url(#pace-grad)" stroke="none" className="spark-area" />
          {prev && (
            <path d={curve(prev)} fill="none" stroke={`rgb(${inkRgb} / 0.32)`} strokeWidth={1.5}
              strokeDasharray="4 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          )}
          <path d={curve(cum)} fill="none" stroke={expColor} strokeWidth={1.8} strokeLinecap="round" vectorEffect="non-scaling-stroke" />

          {hoverIdx !== null && (
            <line x1={toX(hoverIdx)} y1={TOP - 12} x2={toX(hoverIdx)} y2={H}
              stroke={`rgb(${inkRgb} / 0.25)`} strokeWidth="1" vectorEffect="non-scaling-stroke" />
          )}
        </svg>
      </div>

      {/* Today: lands after the line draws in, then keeps a slow pulse */}
      {hoverIdx === null && (
        <div key={`dot-${animKey}`} className="pointer-events-none" style={{ position: 'absolute', left: pct(endX, W), top: pct(endY, H), width: 0, height: 0 }}>
          <span className="greet-pulse" style={{ position: 'absolute', left: -4, top: -4, width: 8, height: 8, borderRadius: '50%', background: expColor, ['--d' as string]: `${still ? 0 : revealDelay + 1300}ms` }} />
          <span className={still ? undefined : 'greet-pop'} style={{ position: 'absolute', left: -4.5, top: -4.5, width: 9, height: 9, borderRadius: '50%', background: expColor, boxShadow: '0 0 0 2px var(--color-bg-surface)', ['--d' as string]: `${revealDelay + 950}ms` }} />
        </div>
      )}

      {dots.map((d, i) => (
        <div key={i} className="pointer-events-none" style={{
          position: 'absolute', zIndex: 5, left: pct(toX(hoverIdx!), W), top: pct(d.y, H),
          width: 7, height: 7, borderRadius: '50%', background: 'var(--color-bg-surface)',
          border: `1.5px solid ${d.color}`, transform: 'translate(-50%, -50%)',
        }} />
      ))}
    </div>
  )
}
