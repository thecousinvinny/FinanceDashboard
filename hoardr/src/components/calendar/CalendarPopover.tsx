'use client'

import { useState, useEffect, useRef } from 'react'
import { X, MapPin, AlignLeft, RefreshCw, Clock, ChevronDown } from 'lucide-react'
import type { GCalendar } from './CalendarSettingsSheet'

export interface PopoverFormData {
  eventId?:       string
  title:          string
  date:           string      // YYYY-MM-DD
  endDate:        string
  allDay:         boolean
  startTime:      string      // HH:MM
  endTime:        string      // HH:MM
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
}

interface Props {
  anchorRect: DOMRect | null   // null → centered modal (iPhone)
  mode:       'create' | 'edit'
  initial:    PopoverFormData
  googleCals: GCalendar[]
  googleCalendarColors?: Record<string, string>
  onClose:   () => void
  onSave:    (data: PopoverFormData) => void
  onDelete?: () => void
  saving?:   boolean
}

const W      = 320
const MAX_H  = 500
const ARROW  = 9
const GAP    = 8

type Side = 'right' | 'left' | 'bottom'

function calcPlacement(rect: DOMRect): { side: Side; top: number; left: number; arrowAt: number } {
  const vw = window.innerWidth, vh = window.innerHeight
  let side: Side = 'right', top = 0, left = 0, arrowAt = 0

  if (vw - rect.right - GAP >= W + ARROW) {
    side = 'right'
    left = rect.right + GAP + ARROW
    top  = Math.max(8, Math.min(vh - MAX_H - 8, rect.top + rect.height / 2 - MAX_H / 2))
    arrowAt = (rect.top + rect.height / 2) - top
  } else if (rect.left - GAP >= W + ARROW) {
    side = 'left'
    left = rect.left - GAP - ARROW - W
    top  = Math.max(8, Math.min(vh - MAX_H - 8, rect.top + rect.height / 2 - MAX_H / 2))
    arrowAt = (rect.top + rect.height / 2) - top
  } else {
    side = 'bottom'
    top  = Math.min(vh - MAX_H - 8, rect.bottom + GAP + ARROW)
    left = Math.max(8, Math.min(vw - W - 8, rect.left + rect.width / 2 - W / 2))
    arrowAt = (rect.left + rect.width / 2) - left
  }

  top     = Math.max(8, top)
  left    = Math.max(8, Math.min(vw - W - 8, left))
  arrowAt = Math.max(20, Math.min(MAX_H - 20, arrowAt))
  return { side, top, left, arrowAt }
}

const BG    = '#21242A'
const DIV   = '#2E3240'
const MUTED = '#6B7280'
const GOLD  = '#C9A84C'

const REPEAT_OPTIONS = [
  { label: 'No repeat',   value: '' },
  { label: 'Every day',   value: 'FREQ=DAILY' },
  { label: 'Every week',  value: 'FREQ=WEEKLY' },
  { label: 'Every month', value: 'FREQ=MONTHLY' },
  { label: 'Every year',  value: 'FREQ=YEARLY' },
]

function repeatLabel(rule: string): string {
  if (!rule) return 'Repeat'
  return REPEAT_OPTIONS.find(o => o.value === rule)?.label ?? rule
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDateLabel(dateStr: string): string {
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function defaultTimes(): { startTime: string; endTime: string } {
  const now        = new Date()
  const totalMins  = now.getHours() * 60 + now.getMinutes()
  const rounded    = Math.round(totalMins / 30) * 30
  const sm         = rounded % (24 * 60)
  const sh         = Math.floor(sm / 60)
  const smin       = sm % 60
  const eh         = (sh + 1) % 24
  return {
    startTime: `${String(sh).padStart(2, '0')}:${String(smin).padStart(2, '0')}`,
    endTime:   `${String(eh).padStart(2, '0')}:${String(smin).padStart(2, '0')}`,
  }
}

const TIMES  = Array.from({ length: 48 }, (_, i) =>
  `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
)
const ITEM_H = 36

export function CalendarPopover({
  anchorRect, mode, initial, googleCals, googleCalendarColors,
  onClose, onSave, onDelete, saving,
}: Props) {
  const [form, setForm]             = useState<PopoverFormData>(initial)
  const [repeatOpen, setRepeatOpen] = useState(false)
  const [startOpen, setStartOpen]   = useState(false)
  const [endOpen, setEndOpen]       = useState(false)
  const [calDropOpen, setCalDropOpen] = useState(false)
  const [calDropRect, setCalDropRect] = useState<{ top: number; left: number; width: number } | null>(null)
  const [visible, setVisible]       = useState(false)

  const titleRef     = useRef<HTMLInputElement>(null)
  const popRef       = useRef<HTMLDivElement>(null)
  const startListRef = useRef<HTMLDivElement>(null)
  const endListRef   = useRef<HTMLDivElement>(null)
  const calBtnRef    = useRef<HTMLButtonElement>(null)
  const calDropRef   = useRef<HTMLDivElement>(null)

  const isModal   = anchorRect === null
  const placement = anchorRect ? calcPlacement(anchorRect) : null
  const origin    = placement
    ? placement.side === 'right' ? 'left center'
    : placement.side === 'left'  ? 'right center'
    : 'top center'
    : 'center'

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true))
    setTimeout(() => titleRef.current?.focus(), 80)
  }, [])

  // Main outside-click — close popover unless clicking the calendar dropdown
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        !calDropRef.current?.contains(e.target as Node)
      ) onClose()
    }
    const t = setTimeout(() => document.addEventListener('mousedown', onDown), 60)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', onDown) }
  }, [onClose])

  // Calendar dropdown outside-click — close dropdown only
  useEffect(() => {
    if (!calDropOpen) return
    const onDown = (e: MouseEvent) => {
      if (
        !calDropRef.current?.contains(e.target as Node) &&
        !calBtnRef.current?.contains(e.target as Node)
      ) setCalDropOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [calDropOpen])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (calDropOpen) { setCalDropOpen(false); return }
        onClose()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, calDropOpen])

  function setField<K extends keyof PopoverFormData>(key: K, val: PopoverFormData[K]) {
    setForm(f => {
      const next = { ...f, [key]: val }
      if (key === 'startTime' && typeof val === 'string' && !next.allDay) {
        const [h, m] = val.split(':').map(Number)
        const eh = (h + 1) % 24
        next.endTime = `${String(eh).padStart(2, '0')}:${String(m).padStart(2, '0')}`
      }
      return next
    })
  }

  function openStartPicker() {
    setStartOpen(true)
    setEndOpen(false)
    setTimeout(() => {
      if (!startListRef.current) return
      const idx = TIMES.indexOf(form.startTime)
      if (idx >= 0) startListRef.current.scrollTop = Math.max(0, idx * ITEM_H - startListRef.current.clientHeight / 2 + ITEM_H / 2)
    }, 10)
  }

  function openEndPicker() {
    setEndOpen(true)
    setStartOpen(false)
    setTimeout(() => {
      if (!endListRef.current) return
      const idx = TIMES.indexOf(form.endTime)
      if (idx >= 0) endListRef.current.scrollTop = Math.max(0, idx * ITEM_H - endListRef.current.clientHeight / 2 + ITEM_H / 2)
    }, 10)
  }

  function openCalDrop() {
    const r = calBtnRef.current?.getBoundingClientRect()
    if (r) setCalDropRect({ top: r.top, left: r.left, width: r.width })
    setCalDropOpen(o => !o)
  }

  const calList   = googleCals
  const activeCal = calList.find(c => c.id === form.calendarId) ?? calList[0]
  const calColor  = googleCalendarColors?.[form.calendarId] ?? activeCal?.backgroundColor ?? '#4285F4'
  const canSave   = !!form.title.trim()

  const endDateDiffers = !form.allDay && form.date !== form.endDate

  const inputStyle: React.CSSProperties = {
    background: 'none', border: 'none', outline: 'none',
    color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)',
    fontSize: 13, caretColor: GOLD, colorScheme: 'dark',
  }

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 14px', borderBottom: `0.5px solid ${DIV}`,
  }

  const timeBtnStyle = (active: boolean): React.CSSProperties => ({
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.05)',
    border: 'none', cursor: 'pointer', borderRadius: 6,
    fontSize: 13, color: active ? GOLD : 'var(--color-ink)',
    fontFamily: 'var(--font-montserrat)', padding: '3px 7px',
    transition: 'background 0.1s', flexShrink: 0,
  })

  const dateLabelWrapper: React.CSSProperties = {
    position: 'relative', display: 'inline-flex', alignItems: 'center', flexShrink: 0,
  }

  const hiddenDateInput: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0,
    cursor: 'pointer', width: '100%', height: '100%', colorScheme: 'dark',
  }

  const popoverStyle: React.CSSProperties = {
    position: 'fixed',
    width: W, maxHeight: MAX_H,
    background: BG,
    borderRadius: 14,
    boxShadow: '0 8px 40px rgba(0,0,0,0.55), 0 0 0 1px rgba(255,255,255,0.06)',
    zIndex: 200,
    display: 'flex', flexDirection: 'column', overflow: 'hidden',
    opacity: visible ? 1 : 0,
    transition: 'transform 0.14s cubic-bezier(0.2,0,0,1), opacity 0.1s ease',
    transformOrigin: origin,
    fontFamily: 'var(--font-montserrat)',
    ...(isModal ? {
      top: '50%', left: '50%',
      transform: visible ? 'translate(-50%,-50%) scale(1)' : 'translate(-50%,-50%) scale(0.93)',
    } : {
      top: placement!.top, left: placement!.left,
      transform: visible ? 'scale(1)' : 'scale(0.93)',
    }),
  }

  return (
    <>
      {/* Backdrop (modal/iPhone mode) */}
      {isModal && (
        <div
          style={{ position: 'fixed', inset: 0, zIndex: 199, background: 'rgba(0,0,0,0.5)', opacity: visible ? 1 : 0, transition: 'opacity 0.15s' }}
          onMouseDown={onClose}
        />
      )}

      {/* Arrow (anchored mode) */}
      {!isModal && placement && (() => {
        const a = placement.arrowAt
        const s = placement.side
        const base: React.CSSProperties = { position: 'fixed', zIndex: 199, width: 0, height: 0 }
        if (s === 'right') return <div style={{ ...base, top: placement.top + a - ARROW, left: placement.left - ARROW * 2, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderRight: `${ARROW * 2}px solid ${BG}` }} />
        if (s === 'left')  return <div style={{ ...base, top: placement.top + a - ARROW, left: placement.left + W, borderTop: `${ARROW}px solid transparent`, borderBottom: `${ARROW}px solid transparent`, borderLeft: `${ARROW * 2}px solid ${BG}` }} />
        return <div style={{ ...base, top: placement.top - ARROW * 2, left: placement.left + a - ARROW, borderLeft: `${ARROW}px solid transparent`, borderRight: `${ARROW}px solid transparent`, borderBottom: `${ARROW * 2}px solid ${BG}` }} />
      })()}

      {/* Calendar dropdown — fixed above button, z-201 */}
      {calDropOpen && calDropRect && (
        <div
          ref={calDropRef}
          style={{
            position: 'fixed',
            bottom: window.innerHeight - calDropRect.top,
            left: calDropRect.left,
            minWidth: Math.max(calDropRect.width, 200),
            background: BG,
            border: `1px solid ${DIV}`,
            borderRadius: 10,
            overflow: 'hidden',
            zIndex: 201,
            boxShadow: '0 4px 20px rgba(0,0,0,0.55)',
          }}
        >
          {calList.map(cal => {
            const color      = googleCalendarColors?.[cal.id] ?? cal.backgroundColor
            const isSelected = cal.id === (form.calendarId || calList[0]?.id)
            return (
              <button key={cal.id}
                onClick={() => { setField('calendarId', cal.id); setCalDropOpen(false) }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 14px', width: '100%', background: isSelected ? 'rgba(201,168,76,0.08)' : 'none', border: 'none', cursor: 'pointer' }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 5, background: color, flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                  {cal.summary}{cal.primary ? ' (primary)' : ''}
                </span>
                {isSelected && <span style={{ color: GOLD, fontSize: 15, lineHeight: 1 }}>✓</span>}
              </button>
            )
          })}
        </div>
      )}

      {/* Popover card */}
      <div ref={popRef} style={popoverStyle}>

        {/* Title row */}
        <div style={{ padding: '13px 14px 11px', borderBottom: `0.5px solid ${DIV}`, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <input
            ref={titleRef}
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={e => setField('title', e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && canSave && !saving) onSave(form) }}
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', fontSize: 18, fontWeight: 500, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', caretColor: GOLD }}
          />
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: MUTED, display: 'flex', alignItems: 'center', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex: 1, overflowY: 'auto', overscrollBehavior: 'contain' }}>

          {/* Date / time row */}
          {form.allDay ? (
            /* All-day: [start date] → [end date] */
            <div style={rowStyle}>
              <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
              <div style={dateLabelWrapper}>
                <span style={{ fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
                  {fmtDateLabel(form.date)}
                </span>
                <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} style={hiddenDateInput} />
              </div>
              <span style={{ color: MUTED, fontSize: 13 }}>→</span>
              <div style={dateLabelWrapper}>
                <span style={{ fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
                  {fmtDateLabel(form.endDate)}
                </span>
                <input type="date" value={form.endDate} onChange={e => setField('endDate', e.target.value)} style={hiddenDateInput} />
              </div>
            </div>
          ) : (
            /* Timed: [date] [clock] [start] → [end date if diff] [end] */
            <div style={{ borderBottom: `0.5px solid ${DIV}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', flexWrap: 'wrap' }}>
                <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <div style={dateLabelWrapper}>
                  <span style={{ fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
                    {fmtDateLabel(form.date)}
                  </span>
                  <input type="date" value={form.date} onChange={e => setField('date', e.target.value)} style={hiddenDateInput} />
                </div>
                <button onClick={() => startOpen ? setStartOpen(false) : openStartPicker()} style={timeBtnStyle(startOpen)}>
                  {fmt12(form.startTime)}
                </button>
                <span style={{ color: MUTED, fontSize: 13 }}>→</span>
                {endDateDiffers && (
                  <div style={dateLabelWrapper}>
                    <span style={{ fontSize: 13, color: 'var(--color-ink)', cursor: 'pointer', userSelect: 'none' }}>
                      {fmtDateLabel(form.endDate)}
                    </span>
                    <input type="date" value={form.endDate} onChange={e => setField('endDate', e.target.value)} style={hiddenDateInput} />
                  </div>
                )}
                <button onClick={() => endOpen ? setEndOpen(false) : openEndPicker()} style={timeBtnStyle(endOpen)}>
                  {fmt12(form.endTime)}
                </button>
              </div>
              {/* Start time picker (inline expand) */}
              {startOpen && (
                <div ref={startListRef} style={{ maxHeight: 160, overflowY: 'auto', borderTop: `0.5px solid ${DIV}`, background: 'rgba(0,0,0,0.18)' }}>
                  {TIMES.map(t => {
                    const sel = t === form.startTime
                    return (
                      <button key={t}
                        onClick={() => { setField('startTime', t); setStartOpen(false) }}
                        style={{ display: 'block', width: '100%', height: ITEM_H, padding: '0 14px 0 42px', background: sel ? 'rgba(201,168,76,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: sel ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', fontWeight: sel ? 600 : 400 }}>
                        {fmt12(t)}
                      </button>
                    )
                  })}
                </div>
              )}
              {/* End time picker (inline expand) */}
              {endOpen && (
                <div ref={endListRef} style={{ maxHeight: 160, overflowY: 'auto', borderTop: `0.5px solid ${DIV}`, background: 'rgba(0,0,0,0.18)' }}>
                  {TIMES.map(t => {
                    const sel = t === form.endTime
                    return (
                      <button key={t}
                        onClick={() => { setField('endTime', t); setEndOpen(false) }}
                        style={{ display: 'block', width: '100%', height: ITEM_H, padding: '0 14px 0 42px', background: sel ? 'rgba(201,168,76,0.1)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: sel ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', fontWeight: sel ? 600 : 400 }}>
                        {fmt12(t)}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* All-day toggle */}
          <div style={rowStyle}>
            <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)' }}>All day</span>
            <button
              onClick={() => { setField('allDay', !form.allDay); setStartOpen(false); setEndOpen(false) }}
              style={{ width: 44, height: 24, borderRadius: 12, padding: '2px', background: form.allDay ? GOLD : 'rgba(255,255,255,0.1)', border: 'none', cursor: 'pointer', transition: 'background 0.15s', display: 'flex', alignItems: 'center', justifyContent: form.allDay ? 'flex-end' : 'flex-start', flexShrink: 0 }}
            >
              <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
            </button>
          </div>

          {/* Repeat */}
          <div style={{ borderBottom: `0.5px solid ${DIV}` }}>
            <button
              onClick={() => setRepeatOpen(o => !o)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <RefreshCw size={16} color={MUTED} style={{ flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: form.recurrenceRule ? 'var(--color-ink)' : MUTED, fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                {repeatLabel(form.recurrenceRule)}
              </span>
            </button>
            {repeatOpen && (
              <div style={{ borderTop: `0.5px solid ${DIV}` }}>
                {REPEAT_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => { setField('recurrenceRule', opt.value); setRepeatOpen(false) }}
                    style={{ display: 'block', width: '100%', padding: '8px 14px 8px 40px', background: form.recurrenceRule === opt.value ? 'rgba(201,168,76,0.08)' : 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, color: form.recurrenceRule === opt.value ? GOLD : 'var(--color-ink)', fontFamily: 'var(--font-montserrat)' }}>
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Location */}
          <div style={rowStyle}>
            <MapPin size={16} color={MUTED} style={{ flexShrink: 0 }} />
            <input type="text" placeholder="Location" value={form.location} onChange={e => setField('location', e.target.value)} style={{ ...inputStyle, flex: 1 }} />
          </div>

          {/* Description */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderBottom: `0.5px solid ${DIV}` }}>
            <AlignLeft size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
            <textarea
              placeholder="Description"
              value={form.notes}
              onChange={e => setField('notes', e.target.value)}
              rows={2}
              style={{ ...inputStyle, flex: 1, resize: 'none', lineHeight: 1.5 }}
            />
          </div>

          {/* Calendar selector */}
          {calList.length > 0 && (
            <button
              ref={calBtnRef}
              onClick={openCalDrop}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', width: '100%', background: 'none', border: 'none', cursor: calList.length > 1 ? 'pointer' : 'default' }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 5, background: calColor, flexShrink: 0 }} />
              <span style={{ flex: 1, fontSize: 13, color: 'var(--color-ink)', fontFamily: 'var(--font-montserrat)', textAlign: 'left' }}>
                {activeCal?.summary ?? 'Calendar'}{activeCal?.primary ? ' (primary)' : ''}
              </span>
              {calList.length > 1 && <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />}
            </button>
          )}
        </div>

        {/* Footer */}
        <div style={{ borderTop: `0.5px solid ${DIV}`, padding: '8px 14px', display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center', flexShrink: 0 }}>
          {mode === 'edit' && onDelete && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, color: '#ef4444', fontFamily: 'var(--font-montserrat)', padding: '6px 10px', borderRadius: 8, marginRight: 'auto' }}>
              Delete
            </button>
          )}
          <button
            onClick={() => canSave && !saving && onSave(form)}
            disabled={!canSave || saving}
            style={{ background: canSave ? GOLD : 'rgba(255,255,255,0.08)', border: 'none', cursor: canSave ? 'pointer' : 'default', color: canSave ? '#fff' : MUTED, fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-montserrat)', padding: '6px 18px', borderRadius: 8, transition: 'all 0.12s' }}
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create' : 'Save'}
          </button>
        </div>
      </div>
    </>
  )
}
