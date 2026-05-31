'use client'

import { SparkChart, type DayPoint } from './SparkChart'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { $fk } from '@/lib/utils'

interface Props {
  spent:       number
  saved:       number
  netPositive: boolean
  hasData:     boolean
  points:      DayPoint[]
}

function fmtInt(n: number)   { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }

export function HomeHero({ spent, saved, netPositive, hasData, points }: Props) {
  return (
    <div
      className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden"
      style={{ position: 'relative', height: 240 }}
    >
      {/* Chart fills the entire card — edge to edge, top to bottom */}
      <div className="absolute inset-0">
        <SparkChart points={points} />
      </div>

      {/* Text overlay — sits above the chart, covers only the top portion */}
      <div
        className="absolute left-0 right-0 pointer-events-none"
        style={{ top: 0, padding: 20, zIndex: 10 }}
      >
        <div className="flex items-center justify-between mb-3">
          <p className="text-[9px] font-bold tracking-[0.12em] uppercase text-ink-faint">
            This Month
          </p>
          {hasData && (
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
              netPositive ? 'text-emerald bg-emerald/10' : 'text-gold bg-gold/10'
            }`}>
              {netPositive ? '↑' : '↓'} {netPositive ? '+' : '−'}
              <SlotNumber value={Math.abs(saved)} format={$fk} /> net
            </span>
          )}
        </div>

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
