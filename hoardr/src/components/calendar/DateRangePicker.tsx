'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { localToday, clamp } from '@/lib/utils'
import { readTheme } from '@/lib/theme'

/**
 * Custom themed date-range picker popover for PC/iPad.
 * Replaces the native <input type="date"> on large screens; iPhone keeps its
 * native wheel picker (this component is simply not mounted there).
 *
 * Selection model: first tap sets From, second tap sets To (auto-swapped if
 * earlier), a third tap resets and starts a new range.
 */

interface Props {
  anchorRect: DOMRect     // field the picker is anchored under
  startDate:  string      // YYYY-MM-DD
  endDate:    string      // YYYY-MM-DD (single mode: pass same as startDate)
  mode?:      'range' | 'single'
  onClose:    () => void
  onApply:    (start: string, end: string) => void   // single mode: end === start
}

// ── Palette (spec) ──────────────────────────────────────────────────────────
const BG        = '#1C1F22'
const FIELD_BG  = '#141414'
const CHIP_BG   = '#21242A'
const DIV       = '#2A2D35'
const INK       = '#E2EAF0'
const MUTED     = '#556070'
const OUT_MONTH = '#3A3D42'
const GOLD      = '#C9A84C'
const GOLD_DARK = '#A8873C'
const GOLD_INK  = '#1a1200'
const RANGE_BG  = 'rgba(201,168,76,0.12)'

const W   = 320
const DOW = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa']

// ── Date helpers (string-based, no UTC drift) ───────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const iso = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

function parse(s: string): { y: number; m: number; d: number } {
  const [y, m, d] = s.split('-').map(Number)
  return { y, m, d }
}

function fmtMDY(s: string): string {
  const { y, m, d } = parse(s)
  return `${m}/${d}/${String(y).slice(2)}`
}

function monthLabel(y: number, m: number): string {
  return new Date(y, m - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
}

// Build the 42-cell (6×7) grid starting from the Sunday on/before the 1st.
function buildCells(viewY: number, viewM: number) {
  const first  = new Date(viewY, viewM - 1, 1)
  const offset = first.getDay() // 0 = Sunday
  const start  = new Date(viewY, viewM - 1, 1 - offset)
  return Array.from({ length: 42 }, (_, i) => {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i)
    const m  = dt.getMonth() + 1
    return {
      iso:     iso(dt.getFullYear(), m, dt.getDate()),
      day:     dt.getDate(),
      inMonth: m === viewM,
    }
  })
}

// Shift a YYYY-MM-DD string by a number of days (local, no UTC drift).
function shiftDays(s: string, delta: number): string {
  const { y, m, d } = parse(s)
  const dt = new Date(y, m - 1, d + delta)
  return iso(dt.getFullYear(), dt.getMonth() + 1, dt.getDate())
}

export function DateRangePicker({ anchorRect, startDate, endDate, mode = 'range', onClose, onApply }: Props) {
  const teal   = readTheme() === 'midnight-teal'
  const single = mode === 'single'

  const [from,  setFrom]    = useState<string>(startDate)
  const [to,    setTo]      = useState<string | null>(!single && endDate && endDate !== startDate ? endDate : null)
  const [phase, setPhase]   = useState<'start' | 'end'>('start')
  const [hover, setHover]   = useState<string | null>(null)
  const [focus, setFocus]   = useState<string>(startDate)
  const [visible, setVisible] = useState(false)

  const init = parse(startDate)
  const [viewY, setViewY] = useState(init.y)
  const [viewM, setViewM] = useState(init.m)

  const popRef  = useRef<HTMLDivElement>(null)
  const gridRef = useRef<HTMLDivElement>(null)
  const slideDir = useRef(0)

  const today = localToday()
  const cells = useMemo(() => buildCells(viewY, viewM), [viewY, viewM])

  // Placement — directly below the field, clamped to the viewport.
  const place = useMemo(() => {
    const vw = window.innerWidth, vh = window.innerHeight
    const H_EST = 384
    const left = clamp(anchorRect.left, 8, vw - W - 8)
    let top = anchorRect.bottom + 6
    if (top + H_EST > vh - 8) top = Math.max(8, anchorRect.top - H_EST - 6)
    return { top, left }
  }, [anchorRect])

  // Entrance animation
  useEffect(() => { requestAnimationFrame(() => setVisible(true)) }, [])

  // Outside-click closes without applying
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 60)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  // Month slide animation on view change
  useEffect(() => {
    const el = gridRef.current
    if (!el || slideDir.current === 0) return
    const dir = slideDir.current
    slideDir.current = 0
    el.style.transition = 'none'
    el.style.transform  = `translateX(${dir * 24}px)`
    el.style.opacity    = '0'
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform 0.18s ease, opacity 0.18s ease'
      el.style.transform  = 'translateX(0)'
      el.style.opacity    = '1'
    }))
  }, [viewY, viewM])

  function navMonth(delta: 1 | -1) {
    slideDir.current = delta
    let m = viewM + delta, y = viewY
    if (m < 1)  { m = 12; y-- }
    if (m > 12) { m = 1;  y++ }
    setViewY(y); setViewM(m)
  }

  function showMonthOf(dateStr: string) {
    const { y, m } = parse(dateStr)
    if (y !== viewY || m !== viewM) { slideDir.current = 0; setViewY(y); setViewM(m) }
  }

  function pick(dayIso: string) {
    if (single) {
      setFrom(dayIso); setFocus(dayIso)
      return
    }
    if (phase === 'start' || (from && to)) {
      setFrom(dayIso); setTo(null); setPhase('end')
    } else {
      let s = from, e = dayIso
      if (e < s) { s = dayIso; e = from }
      setFrom(s); setTo(e); setPhase('start')
    }
    setFocus(dayIso)
  }

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return }
      if (e.key === 'Enter')  { pick(focus); return }
      const map: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }
      const delta = map[e.key]
      if (delta === undefined) return
      e.preventDefault()
      const next = shiftDays(focus, delta)
      setFocus(next)
      showMonthOf(next)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus, phase, from, to])

  // Effective range end for live preview while choosing the To date.
  const activeEnd = to ?? (phase === 'end' && from && hover ? hover : null)

  function cellState(dayIso: string) {
    const isFrom = dayIso === from
    const isTo   = dayIso === to || (dayIso === activeEnd && dayIso !== from)
    let inRange  = false
    if (from && activeEnd) {
      const lo = from < activeEnd ? from : activeEnd
      const hi = from < activeEnd ? activeEnd : from
      inRange = dayIso > lo && dayIso < hi
    }
    return { isEndpoint: isFrom || isTo, inRange, isToday: dayIso === today }
  }

  const accentGrad = teal
    ? 'linear-gradient(135deg, #2DD4BF, #22D3EE)'
    : `linear-gradient(135deg, ${GOLD}, ${GOLD_DARK})`
  const accentInk = teal ? '#0E151D' : GOLD_INK

  // ── Sub-styles ────────────────────────────────────────────────────────────
  const chipStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, height: 36, borderRadius: 8, background: FIELD_BG,
    border: active ? `1px solid ${GOLD}` : `0.5px solid ${DIV}`,
    color: INK, fontSize: 13, fontFamily: 'var(--font-montserrat)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    cursor: 'pointer', outline: 'none',
  })

  const chevBtn: React.CSSProperties = {
    width: 28, height: 28, borderRadius: 14, background: CHIP_BG, border: 'none',
    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: INK,
  }

  return (
    <div
      ref={popRef}
      data-daterange-picker
      style={{
        position: 'fixed', top: place.top, left: place.left, width: W,
        background: BG, borderRadius: 14, padding: 16, zIndex: 210,
        border: `0.5px solid rgba(201,168,76,0.25)`,
        boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
        fontFamily: 'var(--font-montserrat)',
        opacity: visible ? 1 : 0,
        transform: visible ? 'scale(1)' : 'scale(0.95)',
        transformOrigin: 'top left',
        transition: 'opacity 0.2s ease, transform 0.2s cubic-bezier(0.2,0,0,1)',
      }}
    >
      {/* Selected date chip(s) */}
      {single ? (
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 14 }}>
          <div style={chipStyle(true)}>
            {from ? fmtMDY(from) : <span style={{ color: MUTED }}>M/D/YY</span>}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button style={chipStyle(phase === 'start')} onClick={() => setPhase('start')}>
            {from ? fmtMDY(from) : <span style={{ color: MUTED }}>M/D/YY</span>}
          </button>
          <span style={{ color: MUTED, fontSize: 13 }}>→</span>
          <button style={chipStyle(phase === 'end')} onClick={() => setPhase('end')}>
            {to ? fmtMDY(to) : <span style={{ color: MUTED }}>M/D/YY</span>}
          </button>
        </div>
      )}

      {/* Month navigation */}
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: INK }}>
          {monthLabel(viewY, viewM)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={chevBtn} onClick={() => navMonth(-1)} aria-label="Previous month">
            <ChevronLeft size={16} strokeWidth={2} />
          </button>
          <button style={chevBtn} onClick={() => navMonth(1)} aria-label="Next month">
            <ChevronRight size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      {/* Day-of-week header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 8 }}>
        {DOW.map(d => (
          <div key={d} style={{ textAlign: 'center', fontSize: 9, letterSpacing: '0.08em', textTransform: 'uppercase', color: MUTED }}>
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div ref={gridRef} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}
        onMouseLeave={() => setHover(null)}>
        {cells.map(c => {
          const { isEndpoint, inRange, isToday } = cellState(c.iso)
          let bg = 'transparent', color = c.inMonth ? INK : OUT_MONTH, radius = 6
          if (isEndpoint)      { bg = GOLD;      color = GOLD_INK; radius = 20 }
          else if (inRange)    { bg = RANGE_BG;  color = INK }
          else if (isToday)    { bg = GOLD;      color = GOLD_INK }
          return (
            <div key={c.iso} style={{ display: 'flex', justifyContent: 'center', padding: '2px 0' }}>
              <button
                onClick={() => pick(c.iso)}
                onMouseEnter={() => setHover(c.iso)}
                style={{
                  width: 36, height: 36, borderRadius: isEndpoint ? '50%' : radius,
                  background: bg, color, border: 'none', cursor: 'pointer',
                  fontSize: 14, fontFamily: 'var(--font-montserrat)',
                  outline: c.iso === focus && !isEndpoint ? `1px solid ${GOLD}` : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseOver={e => { if (bg === 'transparent') e.currentTarget.style.background = 'rgba(255,255,255,0.06)' }}
                onMouseOut={e =>  { if (bg === 'transparent') e.currentTarget.style.background = 'transparent' }}
              >
                {c.day}
              </button>
            </div>
          )
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 14 }}>
        <button
          onClick={onClose}
          style={{ background: CHIP_BG, color: INK, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--font-montserrat)' }}
        >
          Cancel
        </button>
        <button
          onClick={() => onApply(from, to ?? from)}
          style={{ background: accentGrad, color: accentInk, border: 'none', borderRadius: 8, padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--font-montserrat)' }}
        >
          Apply
        </button>
      </div>
    </div>
  )
}
