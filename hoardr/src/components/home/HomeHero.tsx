'use client'

import { useState } from 'react'
import { SparkChart, type DayPoint } from './SparkChart'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { $fc, $fk } from '@/lib/utils'

interface Props {
  spent:  number
  points: DayPoint[]
}

function fmtInt(n: number)   { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }

export function HomeHero({ spent, points }: Props) {
  const [hoveredPoint, setHoveredPoint] = useState<DayPoint | null>(null)

  const totalInc = points.reduce((s, p) => s + p.inc, 0)
  const totalExp = points.reduce((s, p) => s + p.exp, 0)
  const totalSub = points.reduce((s, p) => s + p.sub, 0)

  return (
    <div
      className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden"
      style={{ position: 'relative', height: 240 }}
    >
      {/* Chart fills the entire card — edge to edge, top to bottom */}
      <div className="absolute inset-0">
        <SparkChart points={points} onHover={setHoveredPoint} />
      </div>

      {/* Text overlay — hero number + compact legend on top of chart */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ top: 0, padding: 20, zIndex: 10 }}
      >
        {/* THIS MONTH label */}
        <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-ink-faint mb-1">
          This Month
        </p>

        {/* Compact legend row — updates on hover */}
        <div className="flex items-center gap-2.5 mb-3">
          <span className="flex items-center gap-1 text-[10px] font-medium text-emerald" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
            <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'var(--sem-income, #4ADE80)' }}/>
            {hoveredPoint ? $fc(hoveredPoint.inc) : $fk(totalInc)}
          </span>
          <span className="flex items-center gap-1 text-[10px] font-medium text-gold" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
            <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'var(--sem-expense, #D4AF37)' }}/>
            {hoveredPoint ? $fc(hoveredPoint.exp) : $fk(totalExp)}
          </span>
          {totalSub > 0 && (
            <span className="flex items-center gap-1 text-[10px] font-medium" style={{ fontFamily: 'var(--font-big-shoulders)', color: 'rgba(180,185,200,0.8)' }}>
              <span className="w-2 h-2 rounded-[2px] inline-block flex-shrink-0" style={{ background: 'rgba(180,185,200,0.7)' }}/>
              {hoveredPoint ? $fc(hoveredPoint.sub) : $fk(totalSub)}
            </span>
          )}
        </div>

        {/* Hero number */}
        <div className="flex items-start" style={{ fontFamily: 'var(--font-big-shoulders)' }}>
          <span className="text-[22px] font-light text-ink-muted mt-[7px] mr-0.5">$</span>
          <span className="text-[52px] font-bold leading-none tracking-[-0.04em] text-ink">
            <SlotNumber value={Math.floor(spent)} format={fmtInt} />
            <span className="text-[32px] text-ink-muted font-light">
              .{fmtCents(spent)}
            </span>
          </span>
        </div>
      </div>
    </div>
  )
}
