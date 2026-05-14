'use client'

import { SparkChart, type DayPoint } from './SparkChart'
import { SlotNumber } from '@/components/ui/SlotNumber'
import { $fk } from '@/lib/utils'

interface Props {
  earned:      number
  spent:       number
  saved:       number
  netPositive: boolean
  hasData:     boolean
  points:      DayPoint[]
}

function fmtInt(n: number)  { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }

export function HomeHero({ earned, spent, saved, netPositive, hasData, points }: Props) {
  return (
    <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
      <div className="flex items-start justify-between mb-3">
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

      <div className="flex items-start mb-5">
        <span className="font-mono text-[22px] font-light text-ink-muted mt-[7px] mr-0.5">$</span>
        <span className={`font-mono text-[52px] font-bold leading-none tracking-[-0.04em] text-ink ${netPositive ? 'glow-green' : 'glow-gold'}`}>
          <SlotNumber value={Math.floor(earned)} format={fmtInt} />
          <span className="text-[32px] text-ink-muted font-light">
            .{fmtCents(earned)}
          </span>
        </span>
      </div>

      <SparkChart points={points} />

      <div className="flex border-t border-white/[0.06] pt-4 -mx-1">
        {[
          { label: 'Income', value: earned,          color: 'text-emerald' },
          { label: 'Spent',  value: spent,            color: 'text-gold'    },
          { label: 'Saved',  value: Math.abs(saved),  color: netPositive ? 'text-ink' : 'text-gold' },
        ].map(({ label, value, color }) => (
          <div key={label} className="flex-1 px-1">
            <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
            <p className={`text-[16px] font-semibold font-mono tracking-tight ${color}`}>
              <SlotNumber value={value} format={$fk} duration={700} />
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
