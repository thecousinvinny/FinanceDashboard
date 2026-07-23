'use client'

import { useState, useRef, useEffect } from 'react'
import { SparkChart, type DayPoint } from './SparkChart'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { $fc, $fk } from '@/lib/utils'

interface Props {
  spent:        number
  points:       DayPoint[]
  annualPoints: DayPoint[]
}

function fmtInt(n: number)   { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }

export function HomeHero({ spent, points, annualPoints }: Props) {
  const [hoveredPoint, setHoveredPoint] = useState<DayPoint | null>(null)
  const [view,         setView]         = useState<'month' | 'year'>('month')

  const swipeStart   = useRef<{ x: number; y: number } | null>(null)
  const isSwiping    = useRef(false)
  const gestureMode  = useRef<'undecided' | 'swiping' | 'scrubbing'>('undecided')

  useEffect(() => { setHoveredPoint(null) }, [view])

  // Monthly totals (for legend non-hover state)
  const totalInc = points.reduce((s, p) => s + p.inc, 0)
  const totalExp = points.reduce((s, p) => s + p.exp, 0)
  const totalSub = points.reduce((s, p) => s + p.sub, 0)

  // Annual totals
  const annualInc = annualPoints.reduce((s, p) => s + p.inc, 0)
  const annualExp = annualPoints.reduce((s, p) => s + p.exp, 0)
  const annualSub = annualPoints.reduce((s, p) => s + p.sub, 0)
  const annualOut = annualExp + annualSub

  const isYear     = view === 'year'
  const heroVal    = isYear ? annualOut  : spent
  const legendInc  = hoveredPoint ? hoveredPoint.inc : isYear ? annualInc : totalInc
  const legendExp  = hoveredPoint ? hoveredPoint.exp : isYear ? annualExp : totalExp
  const legendSub  = hoveredPoint ? hoveredPoint.sub : isYear ? annualSub : totalSub
  const hasSub     = isYear ? annualSub > 0 : totalSub > 0

  // Capture-phase swipe detection — intercepts quick horizontal flicks before SparkChart sees them.
  // gestureMode coordinates with SparkChart's long-press scrub: once scrubbing, swipe is suppressed.
  function onTouchStartCapture(e: React.TouchEvent) {
    swipeStart.current  = { x: e.touches[0].clientX, y: e.touches[0].clientY }
    isSwiping.current   = false
    gestureMode.current = 'undecided'
  }
  function onTouchMoveCapture(e: React.TouchEvent) {
    if (!swipeStart.current) return
    if (gestureMode.current === 'scrubbing') return  // SparkChart owns this gesture
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

  // Desktop: mouse-drag flick mirrors the touch swipe. SparkChart's hover
  // scrub is harmless during a drag, so no capture/stopPropagation needed.
  function onMouseDownSwipe(e: React.MouseEvent) {
    swipeStart.current = { x: e.clientX, y: e.clientY }
    isSwiping.current  = false
  }
  function onMouseMoveSwipe(e: React.MouseEvent) {
    if (!swipeStart.current) return
    const dx = e.clientX - swipeStart.current.x
    const dy = e.clientY - swipeStart.current.y
    if (!isSwiping.current && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.5) {
      isSwiping.current = true
    }
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

  return (
    <div
      className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden"
      style={{ position: 'relative', height: 240 }}
      onTouchStartCapture={onTouchStartCapture}
      onTouchMoveCapture={onTouchMoveCapture}
      onTouchEndCapture={onTouchEndCapture}
      onMouseDown={onMouseDownSwipe}
      onMouseMove={onMouseMoveSwipe}
      onMouseUp={onMouseUpSwipe}
      onMouseLeave={onMouseUpSwipe}
    >
      {/* Two-panel chart rail — slides horizontally on view switch */}
      <div
        style={{
          position:   'absolute',
          top:        0,
          left:       0,
          height:     '100%',
          width:      '200%',
          display:    'flex',
          transform:  isYear ? 'translateX(-50%)' : 'translateX(0)',
          transition: 'transform 0.42s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{ width: '50%', height: '100%', position: 'relative' }}>
          <SparkChart points={points} onHover={setHoveredPoint} gestureMode={gestureMode} />
        </div>
        <div style={{ width: '50%', height: '100%', position: 'relative' }}>
          <SparkChart points={annualPoints} onHover={setHoveredPoint} gestureMode={gestureMode} />
        </div>
      </div>

      {/* Dark gradient overlay — protects text readability, transparent on right */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, rgba(22,30,39,0.85) 0%, rgba(22,30,39,0.5) 45%, rgba(22,30,39,0.0) 70%)',
          zIndex: 1,
        }}
      />

      {/* Text overlay — hero number + legend */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ top: 0, padding: '14px 16px', zIndex: 2 }}
      >
        {/* Label + page dots */}
        <div className="flex items-center gap-2 mb-1">
          <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-ink-faint">
            {isYear ? 'This Year' : 'This Month'}
          </p>
          <div className="flex items-center gap-1 pointer-events-auto">
            <button
              type="button"
              aria-label="This month"
              onClick={() => setView('month')}
              className="flex items-center justify-center cursor-pointer"
              style={{ padding: 4, margin: -4 }}
            >
              <span
                className="block rounded-full transition-all duration-300"
                style={{
                  width:      view === 'month' ? 10 : 4,
                  height:     4,
                  background: view === 'month' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
                }}
              />
            </button>
            <button
              type="button"
              aria-label="This year"
              onClick={() => setView('year')}
              className="flex items-center justify-center cursor-pointer"
              style={{ padding: 4, margin: -4 }}
            >
              <span
                className="block rounded-full transition-all duration-300"
                style={{
                  width:      view === 'year' ? 10 : 4,
                  height:     4,
                  background: view === 'year' ? 'rgba(255,255,255,0.45)' : 'rgba(255,255,255,0.18)',
                }}
              />
            </button>
          </div>
        </div>

        {/* Compact legend row — updates on hover */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
            <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'var(--sem-income, #4ADE80)' }}/>
            {hoveredPoint ? $fc(legendInc) : $fk(legendInc)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-gold" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
            <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'var(--sem-expense, #D4AF37)' }}/>
            {hoveredPoint ? $fc(legendExp) : $fk(legendExp)}
          </span>
          {hasSub && (
            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ fontFamily: 'var(--font-big-shoulders)', color: 'rgba(180,185,200,0.8)' }}>
              <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'rgba(180,185,200,0.7)' }}/>
              {hoveredPoint ? $fc(legendSub) : $fk(legendSub)}
            </span>
          )}
        </div>

        {/* Hero number */}
        <div className="flex items-start" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
          <span className="text-[22px] font-light text-ink-muted mt-[7px] mr-0.5">$</span>
          <span className="text-[52px] font-bold leading-none tracking-[-0.04em] text-ink">
            <SlotNumber value={Math.floor(heroVal)} format={fmtInt} />
            <span className="text-[32px] text-ink-muted font-light">
              .{fmtCents(heroVal)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
