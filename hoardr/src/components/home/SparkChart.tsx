'use client'

import { useState, useRef } from 'react'
import { $fc } from '@/lib/utils'

export interface DayPoint {
  day:   string  // "1", "12", "31"
  label: string  // "May 1", "May 12"
  exp:   number  // cumulative non-sub expenses
  inc:   number  // cumulative income
  sub:   number  // cumulative subscription payments
}

// Fills the full parent container (parent must be position:relative with a defined size).
// Legend, x-axis, and tooltip are rendered as internal overlays.
export function SparkChart({ points, onHover }: { points: DayPoint[]; onHover?: (p: DayPoint | null) => void }) {
  const [hoverIdx,     setHoverIdx]     = useState<number | null>(null)
  const [tooltipFixed, setTooltipFixed] = useState<{ x: number; y: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const W = 300, H = 200, n = points.length
  if (n === 0) return null

  const maxVal = Math.max(...points.map(p => Math.max(p.exp, p.inc, p.sub)), 1)

  function toY(v: number) { return H - (v / maxVal) * (H - 20) - 10 }
  function toX(i: number) { return n <= 1 ? W / 2 : (i / (n - 1)) * W }

  function buildPath(vals: number[]) {
    const pts = vals.map((v, i) => ({ x: toX(i), y: toY(v) }))
    if (pts.length < 2) return ''
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1]
      const dx = (p2.x - p1.x) * 0.4
      d += ` C${(p1.x + dx).toFixed(1)},${p1.y.toFixed(1)} ${(p2.x - dx).toFixed(1)},${p2.y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`
    }
    return d
  }

  function buildArea(vals: number[]) {
    const pts = vals.map((v, i) => ({ x: toX(i), y: toY(v) }))
    if (pts.length < 2) return ''
    return `${buildPath(vals)} L${pts[pts.length - 1].x},${H} L${pts[0].x},${H} Z`
  }

  const expVals = points.map(p => p.exp)
  const incVals = points.map(p => p.inc)
  const subVals = points.map(p => p.sub)
  // 14-day totals (for legend non-hover state)
  const totalExp = expVals.reduce((s, v) => s + v, 0)
  const totalInc = incVals.reduce((s, v) => s + v, 0)
  const totalSub = subVals.reduce((s, v) => s + v, 0)

  const animKey = `${n}-${Math.round(totalExp + totalInc)}`
  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  function handleMouseMove(e: React.MouseEvent) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const idx = Math.round(((e.clientX - rect.left) / rect.width) * (n - 1))
    const clamped = Math.max(0, Math.min(n - 1, idx))
    setHoverIdx(clamped)
    setTooltipFixed({ x: e.clientX, y: e.clientY })
    onHover?.(points[clamped] ?? null)
  }

  function handleMouseLeave() {
    setHoverIdx(null)
    setTooltipFixed(null)
    onHover?.(null)
  }

  // Flip tooltip left of cursor when near the right 35% of the container
  const tooltipFlip = tooltipFixed && containerRef.current
    ? tooltipFixed.x > containerRef.current.getBoundingClientRect().right - 170
    : false

  // Up to 7 evenly-spaced day labels (matches the 14-day window)
  const labelIndices: number[] = n <= 7
    ? Array.from({ length: n }, (_, i) => i)
    : Array.from({ length: 7 }, (_, i) => Math.round(i * (n - 1) / 6))
  const labelSet = new Set(labelIndices)

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full"
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      onTouchMove={e => {
        e.preventDefault()
        const rect = containerRef.current?.getBoundingClientRect()
        if (!rect) return
        const idx = Math.round(((e.touches[0].clientX - rect.left) / rect.width) * (n - 1))
        const clamped = Math.max(0, Math.min(n - 1, idx))
        setHoverIdx(clamped)
        onHover?.(points[clamped] ?? null)
      }}
      onTouchEnd={() => { setHoverIdx(null); onHover?.(null) }}
    >
      {/* key remounts this div on new data, restarting the clip animation */}
      <div
        key={animKey}
        className="absolute inset-0"
        style={{ animation: 'spark-clip-reveal 0.9s ease-out forwards' }}
      >
        <svg
          width="100%"
          height="100%"
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          overflow="visible"
        >
          <defs>
            {/* 6-stop mountain curve — transparent at top, builds through middle,
                peaks ~72% down where the bulk of each fill sits, softens to baseline.
                objectBoundingBox (default) means each series' gradient is relative
                to that series' own fill height, so all three are equally vivid. */}
            <linearGradient id="inc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0.00} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.00 }}/>
              <stop offset={0.25} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.15 }}/>
              <stop offset={0.50} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.55 }}/>
              <stop offset={0.72} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.82 }}/>
              <stop offset={0.88} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.60 }}/>
              <stop offset={1.00} style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.00 }}/>
            </linearGradient>
            <linearGradient id="exp-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0.00} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.00 }}/>
              <stop offset={0.25} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.15 }}/>
              <stop offset={0.50} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.55 }}/>
              <stop offset={0.72} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.82 }}/>
              <stop offset={0.88} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.60 }}/>
              <stop offset={1.00} style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.00 }}/>
            </linearGradient>
            <linearGradient id="sub-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset={0.00} stopColor="rgb(180,185,200)" stopOpacity="0.00"/>
              <stop offset={0.25} stopColor="rgb(180,185,200)" stopOpacity="0.15"/>
              <stop offset={0.50} stopColor="rgb(180,185,200)" stopOpacity="0.55"/>
              <stop offset={0.72} stopColor="rgb(180,185,200)" stopOpacity="0.82"/>
              <stop offset={0.88} stopColor="rgb(180,185,200)" stopOpacity="0.60"/>
              <stop offset={1.00} stopColor="rgb(180,185,200)" stopOpacity="0.00"/>
            </linearGradient>
          </defs>

          <path d={buildArea(expVals)} fill="url(#exp-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          <path d={buildArea(incVals)} fill="url(#inc-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          {totalSub > 0 && (
            <path d={buildArea(subVals)} fill="url(#sub-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          )}

          {hoverIdx !== null && (
            <>
              <line
                x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
                stroke="rgba(255,255,255,0.15)" strokeWidth="1" vectorEffect="non-scaling-stroke"
              />
              <circle cx={toX(hoverIdx)} cy={toY(expVals[hoverIdx])} r="3" fill="var(--sem-expense, #D4AF37)"/>
              <circle cx={toX(hoverIdx)} cy={toY(incVals[hoverIdx])} r="3" fill="var(--sem-income,  #4ADE80)"/>
              {totalSub > 0 && (
                <circle cx={toX(hoverIdx)} cy={toY(subVals[hoverIdx])} r="3" fill="rgba(226,234,240,0.8)"/>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Tooltip — fixed position so it escapes overflow:hidden on the card */}
      {hoverIdx !== null && tooltipFixed && hovered && (
        <div
          className="pointer-events-none bg-bg-surface/90 border border-white/[0.10] rounded-[10px] px-3 py-2"
          style={{
            position: 'fixed',
            zIndex:   100,
            top:      tooltipFixed.y - 58,
            left:     tooltipFlip ? tooltipFixed.x - 168 : tooltipFixed.x + 12,
          }}
        >
          <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-1.5">{hovered.label}</p>
          <div className="flex flex-col gap-0.5">
            <p className="text-[11px] font-semibold font-mono text-emerald">Inc {$fc(hovered.inc)}</p>
            <p className="text-[11px] font-semibold font-mono text-gold">Exp {$fc(hovered.exp)}</p>
            {totalSub > 0 && (
              <p className="text-[11px] font-semibold font-mono" style={{ color: 'rgba(226,234,240,0.7)' }}>
                Sub {$fc(hovered.sub)}
              </p>
            )}
          </div>
        </div>
      )}

      {/* X-axis day labels pinned to bottom */}
      <div className="absolute bottom-0 left-0 right-0 px-4 pb-2.5 pointer-events-none" style={{ zIndex: 10 }}>
        {/* Sparse x-axis day labels */}
        <div className="relative" style={{ height: 10 }}>
          {[...labelSet].sort((a, b) => a - b).map(i => {
            const p       = points[i]
            const isFirst = i === 0
            const isLast  = i === n - 1
            const pct     = n <= 1 ? 50 : (i / (n - 1)) * 100
            return (
              <span
                key={i}
                className={`absolute text-[8px] font-medium leading-none ${
                  i === hoverIdx ? 'text-ink' : isLast ? 'text-gold' : 'text-ink-faint'
                }`}
                style={{
                  fontFamily: 'var(--font-big-shoulders)',
                  ...(isFirst ? { left: 0 } : isLast ? { right: 0 } : { left: `${pct}%`, transform: 'translateX(-50%)' }),
                }}
              >
                {p.day}
              </span>
            )
          })}
          {hoverIdx !== null && !labelSet.has(hoverIdx) && (() => {
            const p   = points[hoverIdx]
            const pct = (hoverIdx / (n - 1)) * 100
            return (
              <span
                className="absolute text-[8px] font-medium leading-none text-ink"
                style={{ fontFamily: 'var(--font-big-shoulders)', left: `${pct}%`, transform: 'translateX(-50%)' }}
              >
                {p.day}
              </span>
            )
          })()}
        </div>
      </div>
    </div>
  )
}
