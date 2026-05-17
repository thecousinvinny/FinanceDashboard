'use client'

import { useState, useRef } from 'react'
import { $fc, $fk } from '@/lib/utils'

export interface DayPoint {
  day:   string  // "29", "1", "12"
  label: string  // "Apr 29", "May 12"
  exp:   number
  inc:   number
  sub:   number
}

export function SparkChart({ points }: { points: DayPoint[] }) {
  const [hoverIdx, setHoverIdx] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const W = 300, H = 64, n = points.length
  const maxVal = Math.max(...points.map(p => Math.max(p.exp, p.inc, p.sub)), 1)

  function toY(v: number) { return H - (v / maxVal) * (H - 10) - 5 }
  function toX(i: number) { return (i / (n - 1)) * W }

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
  const totalExp = expVals.reduce((s, v) => s + v, 0)
  const totalInc = incVals.reduce((s, v) => s + v, 0)
  const totalSub = subVals.reduce((s, v) => s + v, 0)

  function pickIdx(clientX: number) {
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const idx = Math.round(((clientX - rect.left) / rect.width) * (n - 1))
    setHoverIdx(Math.max(0, Math.min(n - 1, idx)))
  }

  const hovered = hoverIdx !== null ? points[hoverIdx] : null

  return (
    <div className="mb-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint">
          {hovered ? hovered.label : '14 days'}
        </p>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald" style={{ fontFamily: "'Big Shoulders Display', sans-serif" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald inline-block" />
            {hovered ? $fc(hovered.inc) : $fk(totalInc)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-gold" style={{ fontFamily: "'Big Shoulders Display', sans-serif" }}>
            <span className="w-1.5 h-1.5 rounded-full bg-gold inline-block" />
            {hovered ? $fc(hovered.exp) : $fk(totalExp)}
          </span>
          {totalSub > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium text-white/60" style={{ fontFamily: "'Big Shoulders Display', sans-serif" }}>
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
        <svg viewBox="0 0 300 64" className="w-full h-full" preserveAspectRatio="none">
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

          <path d={buildArea(expVals)} fill="url(#exp-grad)"/>
          <path d={buildArea(incVals)} fill="url(#inc-grad)"/>
          {totalSub > 0 && <path d={buildArea(subVals)} fill="url(#sub-grad)"/>}
          <path d={buildPath(expVals)} fill="none" stroke="#E8C46B" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          <path d={buildPath(incVals)} fill="none" stroke="#4ADE80" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
          {totalSub > 0 && (
            <path d={buildPath(subVals)} fill="none" stroke="rgba(255,255,255,0.65)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/>
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

      <div className="flex justify-between mt-1">
        {points.map((p, i) => (
          <span
            key={i}
            className={`text-[8px] font-medium leading-none transition-colors ${
              i === hoverIdx ? 'text-ink' : i === n - 1 ? 'text-gold' : 'text-ink-faint'
            }`}
            style={{ fontFamily: "'Big Shoulders Display', sans-serif" }}
          >
            {p.day}
          </span>
        ))}
      </div>
    </div>
  )
}
