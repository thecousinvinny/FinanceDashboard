'use client'

import { useState, useRef, useEffect } from 'react'
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
function readColor(varName: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  return getComputedStyle(document.documentElement).getPropertyValue(varName).trim() || fallback
}

export function SparkChart({ points, onHover }: { points: DayPoint[]; onHover?: (p: DayPoint | null) => void }) {
  const [hoverIdx,     setHoverIdx]     = useState<number | null>(null)
  const [tooltipFixed, setTooltipFixed] = useState<{ x: number; y: number } | null>(null)
  const [colorRev,     setColorRev]     = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const handler = () => setColorRev(r => r + 1)
    window.addEventListener('sem-colors-changed', handler)
    return () => window.removeEventListener('sem-colors-changed', handler)
  }, [])

  const incColor = readColor('--sem-income',  '#4ADE80')
  const expColor = readColor('--sem-expense', '#D4AF37')
  const subColor = readColor('--sem-sub',     'rgb(180,185,200)')

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

  const incPeakY = toY(Math.max(...incVals, 0))
  const expPeakY = toY(Math.max(...expVals, 0))
  const subPeakY = toY(Math.max(...subVals, 0))

  function gf(peakY: number) {
    const p = peakY / H
    return {
      before: Math.max(0, p - 0.08),
      peak:   p,
      mid1:   Math.min(1, p + 0.30),
      mid2:   Math.min(1, p + 0.60),
    }
  }
  const ig = gf(incPeakY), eg = gf(expPeakY), sg = gf(subPeakY)

  const animKey = `${n}-${Math.round(totalExp + totalInc)}-${colorRev}`
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
            <linearGradient id="inc-grad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset={0}         stopColor={incColor} stopOpacity={0}   />
              <stop offset={ig.before} stopColor={incColor} stopOpacity={0}   />
              <stop offset={ig.peak}   stopColor={incColor} stopOpacity={0.95}/>
              <stop offset={ig.mid1}   stopColor={incColor} stopOpacity={0.55}/>
              <stop offset={ig.mid2}   stopColor={incColor} stopOpacity={0.15}/>
              <stop offset={1}         stopColor={incColor} stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="exp-grad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset={0}         stopColor={expColor} stopOpacity={0}   />
              <stop offset={eg.before} stopColor={expColor} stopOpacity={0}   />
              <stop offset={eg.peak}   stopColor={expColor} stopOpacity={0.95}/>
              <stop offset={eg.mid1}   stopColor={expColor} stopOpacity={0.55}/>
              <stop offset={eg.mid2}   stopColor={expColor} stopOpacity={0.15}/>
              <stop offset={1}         stopColor={expColor} stopOpacity={0}   />
            </linearGradient>
            <linearGradient id="sub-grad" x1="0" y1="0" x2="0" y2={H} gradientUnits="userSpaceOnUse">
              <stop offset={0}         stopColor={subColor} stopOpacity={0}   />
              <stop offset={sg.before} stopColor={subColor} stopOpacity={0}   />
              <stop offset={sg.peak}   stopColor={subColor} stopOpacity={0.95}/>
              <stop offset={sg.mid1}   stopColor={subColor} stopOpacity={0.55}/>
              <stop offset={sg.mid2}   stopColor={subColor} stopOpacity={0.15}/>
              <stop offset={1}         stopColor={subColor} stopOpacity={0}   />
            </linearGradient>
          </defs>

          <path d={buildArea(expVals)} fill="url(#exp-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          <path d={buildArea(incVals)} fill="url(#inc-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          {totalSub > 0 && (
            <path d={buildArea(subVals)} fill="url(#sub-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
          )}

          {hoverIdx !== null && (
            <line
              x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
              stroke="rgba(255,255,255,0.15)" strokeWidth="1" vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        {hoverIdx !== null && containerRef.current && (() => {
          const cW = containerRef.current!.offsetWidth
          const cH = containerRef.current!.offsetHeight
          const xPx = (toX(hoverIdx) / W) * cW
          const dots = [
            { yPx: (toY(incVals[hoverIdx]) / H) * cH, color: incColor },
            { yPx: (toY(expVals[hoverIdx]) / H) * cH, color: expColor },
            ...(totalSub > 0 ? [{ yPx: (toY(subVals[hoverIdx]) / H) * cH, color: subColor }] : []),
          ]
          return dots.map(({ yPx, color }, i) => (
            <div key={i} className="pointer-events-none" style={{
              position:     'absolute',
              zIndex:       5,
              left:         xPx,
              top:          yPx,
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   '#161E27',
              border:       `1.5px solid ${color}`,
              transform:    'translate(-50%, -50%)',
            }} />
          ))
        })()}
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
      <div className="absolute bottom-0 left-0 right-0 px-4 pointer-events-none" style={{ zIndex: 10 }}>
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
                  i === hoverIdx ? 'text-white' : isLast ? 'text-gold' : 'text-ink-faint'
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
                className="absolute text-[8px] font-medium leading-none text-ink-faint"
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
