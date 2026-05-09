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

/** A pill toggle group — only one active at a time */
interface PillGroupProps<T extends string> {
  options:  T[]
  value:    T
  onChange: (v: T) => void
}

export function PillGroup<T extends string>({ options, value, onChange }: PillGroupProps<T>) {
  return (
    <div className="flex bg-bg-surface border border-white/[0.06] rounded-pill p-1 gap-1">
      {options.map(opt => (
        <button
          key={opt}
          onClick={() => onChange(opt)}
          className={cn(
            'flex-1 py-2 rounded-pill text-[12px] font-semibold transition-all select-none',
            value === opt ? 'gradient-gold text-white' : 'text-ink-muted',
          )}
        >
          {opt}
        </button>
      ))}
    </div>
  )
}
