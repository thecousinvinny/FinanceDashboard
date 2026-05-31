'use client'

import { useState, useRef } from 'react'
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
  const totalExp = expVals[n - 1] ?? 0
  const totalInc = incVals[n - 1] ?? 0
  const totalSub = subVals[n - 1] ?? 0

  // Changes when real data arrives — used to restart the clip animation
  const animKey = `${n}-${Math.round(totalExp + totalInc)}`

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

      {/*
        key={animKey} remounts this div when data changes, restarting the CSS animation.
        clip-path: inset(0 X% 0 0) clips from the right — animating X from 100→0
        reveals the chart left-to-right. Pure CSS, no path length math.
      */}
      <div key={animKey} style={{ animation: 'spark-clip-reveal 0.9s ease-out forwards' }}>
        <div
          ref={containerRef}
          className="h-16 w-full"
          onMouseMove={e => pickIdx(e.clientX)}
          onMouseLeave={() => setHoverIdx(null)}
          onTouchMove={e => { e.preventDefault(); pickIdx(e.touches[0].clientX) }}
          onTouchEnd={() => setHoverIdx(null)}
        >
          <svg viewBox="0 0 300 64" className="w-full h-full" preserveAspectRatio="none" overflow="visible" style={{ filter: 'blur(1px)' }}>
            <defs>
              <linearGradient id="inc-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0.6 }}/>
                <stop offset="100%" style={{ stopColor: 'var(--sem-income,  #4ADE80)', stopOpacity: 0   }}/>
              </linearGradient>
              <linearGradient id="exp-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0.6 }}/>
                <stop offset="100%" style={{ stopColor: 'var(--sem-expense, #D4AF37)', stopOpacity: 0   }}/>
              </linearGradient>
              <linearGradient id="sub-grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="rgba(226,234,240,1)" stopOpacity="0.3"/>
                <stop offset="100%" stopColor="rgba(226,234,240,1)" stopOpacity="0"/>
              </linearGradient>
            </defs>

            <path d={buildArea(expVals)} fill="url(#exp-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
            <path d={buildArea(incVals)} fill="url(#inc-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>
            {totalSub > 0 && <path d={buildArea(subVals)} fill="url(#sub-grad)" stroke="none" style={{ mixBlendMode: 'screen' }}/>}

            {hoverIdx !== null && (
              <>
                <line x1={toX(hoverIdx)} y1={0} x2={toX(hoverIdx)} y2={H} stroke="rgba(255,255,255,0.18)" strokeWidth="1"/>
                <circle cx={toX(hoverIdx)} cy={toY(expVals[hoverIdx])} r="2.5" fill="#E8C46B"/>
                <circle cx={toX(hoverIdx)} cy={toY(incVals[hoverIdx])} r="2.5" fill="#4ADE80"/>
                {totalSub > 0 && <circle cx={toX(hoverIdx)} cy={toY(subVals[hoverIdx])} r="2.5" fill="rgba(255,255,255,0.8)"/>}
              </>
            )}
          </svg>
        </div>

        {/* Sparse absolute-positioned x-axis labels — no squish on any month length */}
        <div className="relative mt-1" style={{ height: 12 }}>
          {[...labelSet].sort((a, b) => a - b).map(i => {
            const p       = points[i]
            const isFirst = i === 0
            const isLast  = i === n - 1
            const pct     = n <= 1 ? 50 : (i / (n - 1)) * 100
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
    </div>
  )
}
