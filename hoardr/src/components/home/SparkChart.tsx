'use client'

import { useState, useRef, useEffect } from 'react'
import { $fc, $fk } from '@/lib/utils'

export interface DayPoint {
  day:   string  // "1", "12", "31"
  label: string  // "May 1", "May 12"
  exp:   number  // cumulative non-sub expenses
  inc:   number  // cumulative income
  sub:   number  // cumulative subscription payments
}

export function SparkChart({ points }: { points: DayPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const expPathRef   = useRef<SVGPathElement>(null)
  const incPathRef   = useRef<SVGPathElement>(null)
  const subPathRef   = useRef<SVGPathElement>(null)

  const W = 300, H = 64, n = points.length
  if (n === 0) return null

  const maxVal = Math.max(...points.map(p => Math.max(p.exp, p.inc, p.sub)), 1)

  function toY(v: number) { return H - (v / maxVal) * (H - 10) - 5 }
  function toX(i: number) { return n <= 1 ? W / 2 : (i / (n - 1)) * W }

  function buildPath(vals: number[]) {
    const pts = vals.map((v, i) => ({ x: toX(i), y: toY(v) }))
    if (pts.length < 2) return ''
    let d = `M${pts[0].x},${pts[0].y}`
    for (let i = 0; i < pts.length - 1; i++) {
      const p1 = pts[i], p2 = pts[i + 1]
      const dx = (p2.x - p1.x) / 3
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
  const totalExp = expVals[n - 1] ?? 0
  const totalInc = incVals[n - 1] ?? 0
  const totalSub = subVals[n - 1] ?? 0

  // Derive a key that changes when real data arrives or refreshes
  const animKey = `${n}-${Math.round(totalExp + totalInc)}`

  // JS-driven draw animation — getTotalLength() avoids the vectorEffect/pathLength mismatch
  useEffect(() => {
    if (n === 0) return
    const entries: [React.RefObject<SVGPathElement | null>, number][] = [
      [incPathRef, 0],
      [expPathRef, 50],
      ...(totalSub > 0 ? [[subPathRef, 100]] as [React.RefObject<SVGPathElement | null>, number][] : []),
    ]
    entries.forEach(([ref, delayMs]) => {
      const path = ref.current
      if (!path) return
      const len = path.getTotalLength()
      path.style.strokeDasharray  = `${len}`
      path.style.strokeDashoffset = `${len}`
      path.style.transition = 'none'
      // getComputedStyle flushes pending CSS — getBoundingClientRect only forces layout,
      // not style recalculation, so WebKit won't register the dashoffset change otherwise
      void getComputedStyle(path).strokeDashoffset
      // Double rAF: first frame paints the hidden state, second starts the transition
      requestAnimationFrame(() => requestAnimationFrame(() => {
        path.style.transition       = `stroke-dashoffset 0.9s ease-out ${delayMs}ms`
        path.style.strokeDashoffset = '0'
      }))
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animKey])

  function pickIdx(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const idx = Math.round(((clientX - rect.left) / rect.width) * (n - 1))
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)))
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  // Sparse landmark labels — at most 5, always includes day 1 and today
  const labelIndices: number[] = n <= 7
    ? Array.from({ length: n }, (_, i) => i)
    : [0, Math.round(n * 0.25), Math.round(n * 0.5), Math.round(n * 0.75), n - 1]
  const labelSet = new Set(labelIndices)

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint">
          {hovered ? hovered.label : 'Month to date'}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald" style={{ fontFamily: "var(--font-big-shoulders)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block" />
            {hovered ? $fc(hovered.inc) : $fk(totalInc)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-gold" style={{ fontFamily: "var(--font-big-shoulders)" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
            {hovered ? $fc(hovered.exp) : $fk(totalExp)}
          </span>
          {totalSub > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-white/60" style={{ fontFamily: "var(--font-big-shoulders)" }}>
              <span className="w-1.5 h-1.5 rounded-full bg-white/60 inline-block" />
              {hovered ? $fc(hovered.sub) : $fk(totalSub)}
            </span>
          )}
        </div>
      </div>

      <div
        ref={containerRef}
        className="h-16 w-full"
        onMouseMove={e => pickIdx(e.clientX)}
        onMouseLeave={() => setHoverIdx(null)}
        onTouchMove={e => { e.preventDefault(); pickIdx(e.touches[0].clientX) }}
        onTouchEnd={() => setHoverIdx(null)}
      >
        <svg viewBox="0 0 300 64" className="w-full h-full" preserveAspectRatio="none" overflow="visible">
          <defs>
            <linearGradient id="inc-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#4ADE80" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#4ADE80" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="exp-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#E8C46B" stopOpacity="0.22"/>
              <stop offset="100%" stopColor="#E8C46B" stopOpacity="0"/>
            </linearGradient>
            <linearGradient id="sub-grad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="rgba(255,255,255,0.18)"/>
              <stop offset="100%" stopColor="rgba(255,255,255,0)"/>
            </linearGradient>
          </defs>

          {/* Area fills — keyed so CSS fade restarts when data changes */}
          <g key={animKey}>
            <path d={buildArea(expVals)} fill="url(#exp-grad)" style={{ animation: 'spark-fade 0.5s ease 0.1s both' }}/>
            <path d={buildArea(incVals)} fill="url(#inc-grad)" style={{ animation: 'spark-fade 0.5s ease 0s both' }}/>
            {totalSub > 0 && <path d={buildArea(subVals)} fill="url(#sub-grad)" style={{ animation: 'spark-fade 0.5s ease 0.2s both' }}/>}
          </g>
          {/* Stroke paths — JS-animated via getTotalLength() to sidestep vectorEffect/pathLength mismatch */}
          <path ref={expPathRef} d={buildPath(expVals)} fill="none" stroke="#E8C46B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          <path ref={incPathRef} d={buildPath(incVals)} fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          {totalSub > 0 && (
            <path ref={subPathRef} d={buildPath(subVals)} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          )}

          {hoverIdx !== null && (
            <>
              <line
                x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H}
                stroke="rgba(255,255,255,0.18)" strokeWidth="1"
              />
              <circle cx={toX(hoverIdx)} cy={toY(expVals[hoverIdx])} r="2.5" fill="#E8C46B"/>
              <circle cx={toX(hoverIdx)} cy={toY(incVals[hoverIdx])} r="2.5" fill="#4ADE80"/>
              {totalSub > 0 && (
                <circle cx={toX(hoverIdx)} cy={toY(subVals[hoverIdx])} r="2.5" fill="rgba(255,255,255,0.8)"/>
              )}
            </>
          )}
        </svg>
      </div>

      {/* Sparse absolute-positioned x-axis labels — no squish on any month length */}
      <div className="relative mt-1" style={{ height: 12 }}>
        {[...labelSet].sort((a, b) => a - b).map(i => {
          const p      = points[i]
          const isFirst = i === 0
          const isLast  = i === n - 1
          const pct    = n <= 1 ? 50 : (i / (n - 1)) * 100
          return (
            <span
              key={i}
              className={`absolute text-[8px] font-medium leading-none transition-colors ${
                i === hoverIdx ? 'text-ink' : isLast ? 'text-gold' : 'text-ink-faint'
              }`}
              style={{
                fontFamily: "var(--font-big-shoulders)",
                ...(isFirst
                  ? { left: 0 }
                  : isLast
                  ? { right: 0 }
                  : { left: `${pct}%`, transform: 'translateX(-50%)' }),
              }}
            >
              {p.day}
            </span>
          )
        })}
        {/* Show hovered day label even if not a landmark */}
        {hoverIdx !== null && !labelSet.has(hoverIdx) && (() => {
          const p   = points[hoverIdx]
          const pct = (hoverIdx / (n - 1)) * 100
          return (
            <span
              className="absolute text-[8px] font-medium leading-none text-ink"
              style={{ fontFamily: "var(--font-big-shoulders)", left: `${pct}%`, transform: 'translateX(-50%)' }}
            >
              {p.day}
            </span>
          )
        })()}
      </div>
    </div>
  )
}
