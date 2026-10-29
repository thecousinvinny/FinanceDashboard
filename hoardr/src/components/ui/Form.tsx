'use client'

import { ChevronRight, type LucideIcon } from 'lucide-react'
import { categoryMeta } from '@/lib/category-meta'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { cn, haptic } from '@/lib/utils'

/**
 * iOS "inset grouped" form building blocks for sheets. Colors come from the
 * theme's ink channel at low alpha, so they read correctly in every theme,
 * light or dark.
 */

/** Text input/textarea inside a FormRow — right-aligned like iOS value fields. */
export const rowInput =
  'flex-1 min-w-0 bg-transparent outline-none text-[16px] text-ink placeholder:text-ink-faint text-right'

/** A titled card of rows. Hairline separators are drawn by `.form-group` in globals.css. */
export function FormGroup({ header, footer, children, className, plain }: {
  header?: React.ReactNode
  footer?: React.ReactNode
  children: React.ReactNode
  className?: string
  /** No card behind the content — for a control that has its own surface (Segmented) */
  plain?: boolean
}) {
  return (
    <section className={cn('mt-6 first:mt-2', className)}>
      {header && (
        <h3 className="px-4 mb-[6px] text-[12.5px] uppercase tracking-[0.03em] text-ink-muted font-normal">{header}</h3>
      )}
      {plain ? children : (
        <div className="form-group rounded-[12px] overflow-hidden" style={{ background: 'rgb(var(--rgb-ink) / 0.055)' }}>
          {children}
        </div>
      )}
      {footer && <p className="px-4 mt-[6px] text-[12.5px] leading-snug text-ink-muted">{footer}</p>}
    </section>
  )
}

/** iOS Settings-style tinted icon square. */
export function RowIcon({ icon: Icon, color = '#D4AF37' }: { icon: LucideIcon; color?: string }) {
  return (
    <span
      className="flex items-center justify-center w-[29px] h-[29px] rounded-[7px] flex-shrink-0"
      style={{ background: color }}
    >
      <Icon size={17} strokeWidth={2} color="#fff" />
    </span>
  )
}

export function FormRow({ icon, iconColor, label, children, onClick, chevron, alignTop, className }: {
  icon?:      LucideIcon
  iconColor?: string
  label?:     React.ReactNode
  children?:  React.ReactNode
  onClick?:   () => void
  chevron?:   boolean
  alignTop?:  boolean
  className?: string
}) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={cn(
        'form-row relative flex w-full gap-3 px-4 min-h-[50px] text-left',
        alignTop ? 'items-start py-3' : 'items-center py-[7px]',
        onClick && 'active:bg-[rgb(var(--rgb-ink)/0.06)] transition-colors',
        className,
      )}
      style={{ ['--sep-inset' as string]: icon ? '58px' : '16px' }}
    >
      {icon && <RowIcon icon={icon} color={iconColor} />}
      {label !== undefined && <span className="text-[16px] text-ink flex-shrink-0">{label}</span>}
      <div className="flex-1 min-w-0 flex items-center justify-end gap-1.5 text-[16px] text-ink-muted">
        {children}
      </div>
      {chevron && <ChevronRight size={16} strokeWidth={2.25} className="flex-shrink-0 text-ink-faint" />}
    </Tag>
  )
}

/** iOS switch, in the app's gold. */
export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => { haptic('tap'); onChange(!checked) }}
      className="relative flex-shrink-0 w-[51px] h-[31px] rounded-full"
      style={{
        background: checked ? '#D4AF37' : 'rgb(var(--rgb-ink) / 0.16)',
        transition: 'background 0.25s ease',
      }}
    >
      <span
        className="absolute top-[2px] left-[2px] w-[27px] h-[27px] rounded-full bg-white"
        style={{
          boxShadow: '0 3px 8px rgba(0,0,0,0.15), 0 1px 1px rgba(0,0,0,0.16)',
          transform: checked ? 'translateX(20px)' : 'none',
          transition: 'transform 0.3s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />
    </button>
  )
}

/** iOS segmented control with a sliding thumb. */
export function Segmented<T extends string>({ options, value, onChange, labels }: {
  options:  readonly T[]
  value:    T
  onChange: (v: T) => void
  labels?:  Partial<Record<T, string>>
}) {
  const idx = Math.max(0, options.indexOf(value))
  const n   = options.length
  return (
    <div
      role="tablist"
      className="relative grid h-[34px] p-[2px] rounded-[10px] select-none"
      style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))`, background: 'rgb(var(--rgb-ink) / 0.08)' }}
    >
      <span
        aria-hidden
        className="absolute top-[2px] bottom-[2px] left-[2px] rounded-[8px]"
        style={{
          width: `calc((100% - 4px) / ${n})`,
          transform: `translateX(${idx * 100}%)`,
          background: 'var(--seg-thumb, rgb(var(--rgb-ink) / 0.16))',   // white in light themes, like iOS
          boxShadow: '0 3px 8px rgba(0,0,0,0.12), 0 0 0 0.5px rgba(0,0,0,0.04)',
          transition: 'transform 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
      />
      {options.map(o => (
        <button
          key={o}
          type="button"
          role="tab"
          aria-selected={o === value}
          onClick={() => { if (o !== value) { haptic('tap'); onChange(o) } }}
          className={cn('relative z-[1] text-[13px] transition-colors', o === value ? 'font-semibold text-ink' : 'font-medium text-ink-muted')}
        >
          {labels?.[o] ?? o}
        </button>
      ))}
    </div>
  )
}

/**
 * The big centered amount at the top of money sheets (Apple Pay / Wallet
 * style). The input sizes itself to its content so the "$" stays snug.
 */
export function AmountHero({ value, onChange, inputRef, onEnter, caption, autoFocus, muted }: {
  value:     string
  onChange:  (v: string) => void
  inputRef?: React.Ref<HTMLInputElement>
  onEnter?:  () => void
  caption?:  React.ReactNode
  autoFocus?: boolean
  muted?:    boolean
}) {
  const shown = value || '0'
  return (
    <div className="flex flex-col items-center pt-3 pb-1">
      <label className="flex items-baseline justify-center max-w-full cursor-text">
        <span className={cn('text-[30px] font-medium mr-[2px]', value ? 'text-ink-muted' : 'text-ink-faint')}>$</span>
        <input
          ref={inputRef}
          type="text"
          inputMode="decimal"
          autoFocus={autoFocus}
          placeholder="0"
          value={value}
          onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) onChange(v) }}
          enterKeyHint="next"
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); onEnter?.() } }}
          className={cn(
            'amount-hero bg-transparent outline-none text-center font-semibold tracking-[-0.03em] tabular-nums',
            muted ? 'text-ink-muted' : 'text-ink',
          )}
          style={{ fontSize: 52, lineHeight: 1.1, width: `${Math.max(1, shown.length) * 0.64 + 0.2}em`, maxWidth: '80vw', caretColor: '#D4AF37' }}
        />
      </label>
      {caption && <div className="mt-1 text-[13px] text-ink-muted">{caption}</div>}
    </div>
  )
}

/** Category chooser: tinted icon circles, like Apple's category pickers. */
export function CategoryPicker({ categories, value, onChange, type, optional }: {
  categories: { name: string }[]
  value:      string | null
  /** null when an optional category is tapped again to clear it */
  onChange:   (name: string | null) => void
  type:       'Expense' | 'Income'
  optional?:  boolean
}) {
  return (
    <div className="grid grid-cols-4 gap-y-3 gap-x-1 px-2 py-4">
      {categories.map(cat => {
        const Icon   = getCategoryIcon(cat.name, type)
        const color  = categoryMeta[cat.name]?.color ?? (type === 'Income' ? '#22c55e' : '#D4AF37')
        const active = value === cat.name
        return (
          <button
            key={cat.name}
            type="button"
            onClick={() => { haptic('tap'); onChange(active && optional ? null : cat.name) }}
            className="flex flex-col items-center gap-1.5 select-none active:scale-95 transition-transform"
          >
            <span
              className="flex items-center justify-center w-[46px] h-[46px] rounded-full"
              style={{
                background: active ? color : `${color}26`,
                boxShadow: active ? `0 0 0 2px var(--color-bg-surface), 0 0 0 4px ${color}` : 'none',
                transition: 'background 0.2s ease, box-shadow 0.2s ease',
              }}
            >
              <Icon size={20} strokeWidth={active ? 2.25 : 1.9} color={active ? '#fff' : color} />
            </span>
            <span className={cn('text-[11px] leading-tight truncate max-w-full', active ? 'text-ink font-semibold' : 'text-ink-muted')}>
              {cat.name}
            </span>
          </button>
        )
      })}
    </div>
  )
}

/** Choice chips for short option sets (billing cycle, source, frequency). */
export function ChoiceChips<T extends string>({ options, value, onChange }: {
  options:  readonly T[]
  value:    T | null
  onChange: (v: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2 px-4 py-3">
      {options.map(o => {
        const active = o === value
        return (
          <button
            key={o}
            type="button"
            onClick={() => { haptic('tap'); onChange(o) }}
            className={cn(
              'h-[32px] px-3.5 rounded-full text-[14px] transition-colors select-none',
              active ? 'bg-gold text-[#1a1200] font-semibold' : 'text-ink',
            )}
            style={active ? undefined : { background: 'rgb(var(--rgb-ink) / 0.08)' }}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}
