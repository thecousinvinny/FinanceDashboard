'use client'

import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const GOLD_GRADIENT = 'linear-gradient(135deg,#F7DF9E,#D4AF37,#A47F23)'
const GOLD = '#D4AF37'

interface Props {
  open:     boolean
  year:     number   // currently selected year
  month:    number   // currently selected month (0-11)
  onClose:  () => void
  onSelect: (year: number, month: number) => void
}

export function MonthYearPicker({ open, year, month, onClose, onSelect }: Props) {
  const today = new Date()
  const curY = today.getFullYear()
  const curM = today.getMonth()

  const [viewYear, setViewYear] = useState(year)
  const [mode,     setMode]     = useState<'month' | 'year'>('month')
  const [yearPage, setYearPage] = useState(year - 6)  // first year shown in the 12-year grid

  // Re-sync to the calendar's current month each time the picker opens
  useEffect(() => {
    if (open) { setViewYear(year); setMode('month'); setYearPage(year - 6) }
  }, [open, year])

  // Close on Escape (desktop / keyboard)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const years = Array.from({ length: 12 }, (_, i) => yearPage + i)

  const cellBase = 'py-3 rounded-[12px] text-[13px] font-semibold transition-all select-none active:scale-95'

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[64] transition-opacity duration-200',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.6)' }}
      />

      {/* Card */}
      <div
        role="dialog"
        aria-modal="true"
        className={cn(
          'fixed left-1/2 top-1/2 z-[65] w-[300px] -translate-x-1/2 -translate-y-1/2 rounded-[20px] bg-bg-surface border border-white/[0.08] transition-all duration-200',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none',
        )}
        style={{ boxShadow: '0 20px 60px rgba(0,0,0,0.5)', fontFamily: 'var(--font-montserrat)' }}
      >
        {/* Header: ‹  year / year-range  › */}
        <div className="flex items-center justify-between px-3 pt-3 pb-2">
          <button
            onClick={() => mode === 'month' ? setViewYear(y => y - 1) : setYearPage(p => p - 12)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/[0.06]"
            style={{ color: GOLD }}
            aria-label={mode === 'month' ? 'Previous year' : 'Previous years'}
          ><ChevronLeft size={18} /></button>

          <button
            onClick={() => setMode(m => (m === 'month' ? 'year' : 'month'))}
            className="text-[15px] font-bold tracking-tight text-ink px-3 py-1 rounded-lg active:bg-white/[0.06]"
          >
            {mode === 'month' ? viewYear : `${years[0]} – ${years[years.length - 1]}`}
          </button>

          <button
            onClick={() => mode === 'month' ? setViewYear(y => y + 1) : setYearPage(p => p + 12)}
            className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/[0.06]"
            style={{ color: GOLD }}
            aria-label={mode === 'month' ? 'Next year' : 'Next years'}
          ><ChevronRight size={18} /></button>
        </div>

        {/* Body */}
        <div className="px-3 pb-3">
          {mode === 'month' ? (
            <div className="grid grid-cols-3 gap-2">
              {MONTHS_SHORT.map((mn, i) => {
                const selected  = viewYear === year && i === month
                const isCurrent = viewYear === curY && i === curM
                return (
                  <button
                    key={mn}
                    onClick={() => { onSelect(viewYear, i); onClose() }}
                    className={cn(cellBase, selected ? 'text-black' : 'bg-bg-overlay text-ink-muted')}
                    style={
                      selected   ? { background: GOLD_GRADIENT }
                      : isCurrent ? { boxShadow: `inset 0 0 0 1px ${GOLD}`, color: GOLD }
                      : undefined
                    }
                  >
                    {mn}
                  </button>
                )
              })}
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {years.map(y => {
                const selected  = y === viewYear
                const isCurrent = y === curY
                return (
                  <button
                    key={y}
                    onClick={() => { setViewYear(y); setMode('month') }}
                    className={cn(cellBase, selected ? 'text-black' : 'bg-bg-overlay text-ink-muted')}
                    style={
                      selected   ? { background: GOLD_GRADIENT }
                      : isCurrent ? { boxShadow: `inset 0 0 0 1px ${GOLD}`, color: GOLD }
                      : undefined
                    }
                  >
                    {y}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
