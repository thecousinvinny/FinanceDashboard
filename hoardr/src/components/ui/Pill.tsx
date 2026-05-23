import { useRef } from 'react'
import { cn } from '@/lib/utils'

interface PillProps {
  label:    string
  active?:  boolean
  onClick?: () => void
  className?: string
}

export function Pill({ label, active, onClick, className }: PillProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'px-4 py-2 rounded-pill text-[12px] font-semibold transition-all select-none',
        active
          ? 'gradient-gold text-white'
          : 'bg-bg-surface border border-white/[0.06] text-ink-muted hover:text-ink',
        className,
      )}
    >
      {label}
    </button>
  )
}

/** A pill toggle group — liquid sliding indicator between options */
interface PillGroupProps<T extends string> {
  options:  T[]
  value:    T
  onChange: (v: T) => void
}

export function PillGroup<T extends string>({ options, value, onChange }: PillGroupProps<T>) {
  const n           = options.length
  const activeIndex = options.indexOf(value)

  // Track direction of last value change (ref = no re-render, no animation interruption)
  const prevValueRef = useRef(value)
  const dirRef       = useRef(0)

  if (prevValueRef.current !== value) {
    const prevIdx = options.indexOf(prevValueRef.current)
    dirRef.current = Math.sign(activeIndex - prevIdx)
    prevValueRef.current = value
  }

  const dir = dirRef.current

  return (
    <div className="relative flex bg-bg-surface border border-white/[0.06] rounded-pill p-1">
      {/*
        Liquid bubble indicator.
        Uses left + right (not width) with offset transition durations:
        - Moving right: right edge snaps first (leading), left follows slowly (trailing) → stretches then contracts
        - Moving left:  left edge snaps first, right follows slowly
        The spring cubic-bezier adds a satisfying overshoot on the trailing edge.
      */}
      <div
        className="absolute gradient-gold pointer-events-none"
        style={{
          top:    4,
          bottom: 4,
          left:   `calc(4px + ${activeIndex} * (100% - 8px) / ${n})`,
          right:  `calc(4px + ${n - activeIndex - 1} * (100% - 8px) / ${n})`,
          borderRadius: 9999,
          transition: dir > 0
            ? 'right 0.13s ease-out, left 0.44s cubic-bezier(0.34,1.56,0.64,1)'
            : dir < 0
            ? 'left 0.13s ease-out, right 0.44s cubic-bezier(0.34,1.56,0.64,1)'
            : 'none',
        }}
      />
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className="relative z-10 flex-1 py-2 rounded-pill text-[12px] font-semibold select-none"
          style={{
            color:      opt === value ? '#ffffff' : '#7a7a9a',
            transition: 'color 0.2s ease',
          }}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
