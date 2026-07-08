'use client'

import { useRef, useState } from 'react'
import { DateRangePicker } from '@/components/calendar/DateRangePicker'
import { useIsLargeScreen } from '@/lib/use-large-screen'
import { localToday } from '@/lib/utils'

/**
 * Drop-in replacement for a single native <input type="date">.
 * Phone (< 768px): renders the native date input unchanged.
 * PC / iPad (>= 768px): renders a button showing the formatted date that
 * opens the app-themed single-date picker (DateRangePicker in single mode).
 *
 * Pass the same className/style you'd give the native input so the field
 * looks identical on both branches.
 */
interface Props {
  value:        string                  // YYYY-MM-DD
  onChange:     (v: string) => void
  className?:   string
  style?:       React.CSSProperties
  min?:         string
  max?:         string
  placeholder?: string
}

function fmt(v: string): string {
  if (!v) return ''
  const [y, m, d] = v.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' })
}

export function CustomDateInput({ value, onChange, className, style, min, max, placeholder = 'Select date' }: Props) {
  const large = useIsLargeScreen()
  const [open, setOpen]     = useState(false)
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  if (!large) {
    return (
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={e => onChange(e.target.value)}
        className={className}
        style={{ colorScheme: 'dark', ...style }}
      />
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => { setAnchor(btnRef.current?.getBoundingClientRect() ?? null); setOpen(true) }}
        className={className}
        style={{ textAlign: 'left', cursor: 'pointer', ...style }}
      >
        {value ? fmt(value) : <span style={{ opacity: 0.5 }}>{placeholder}</span>}
      </button>
      {open && anchor && (
        <DateRangePicker
          anchorRect={anchor}
          mode="single"
          startDate={value || localToday()}
          endDate={value || localToday()}
          onClose={() => setOpen(false)}
          onApply={start => { onChange(start); setOpen(false) }}
        />
      )}
    </>
  )
}
