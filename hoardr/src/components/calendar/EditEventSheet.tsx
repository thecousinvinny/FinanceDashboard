'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X, ChevronDown, RefreshCw, Calendar } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import type { GCalendar } from './CalendarSettingsSheet'

export interface EditableEvent {
  id:             string
  title:          string
  allDay:         boolean
  date:           string
  endDate:        string
  startTime:      string
  endTime:        string
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
  googleEventId?: string
  instanceDate?:  string
}

export interface EventEdits {
  title:          string
  date:           string
  endDate:        string
  allDay:         boolean
  startTime:      string
  endTime:        string
  location:       string
  notes:          string
  recurrenceRule: string
  calendarId:     string
}

export type RecurrenceScope = 'this' | 'following' | 'all'

interface Props {
  open:        boolean
  event:       EditableEvent | null
  googleCals?: GCalendar[]
  onClose:     () => void
  onSave:      (edits: EventEdits, scope: RecurrenceScope) => Promise<void>
  onDelete:    (scope: RecurrenceScope) => void
}

const M    = 'var(--font-montserrat)'
const GOLD = '#C9A84C'
const MUTED = 'rgb(var(--rgb-ink-muted))'
const SEP   = 'rgba(var(--rgb-ink-faint) / 0.25)'

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const period = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 || 12
  return `${h12}:${String(m).padStart(2, '0')} ${period}`
}

function fmtDatePill(dateStr: string): string {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  return new Date(y, mo - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function addOneDay(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

function calcDuration(date: string, startTime: string, endDate: string, endTime: string): string {
  const start    = new Date(`${date}T${startTime}:00`)
  const end      = new Date(`${endDate}T${endTime}:00`)
  const totalMin = Math.round((end.getTime() - start.getTime()) / 60000)
  if (totalMin <= 0) return ''
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  if (h === 0) return `${m}m`
  if (m === 0) return `${h}h`
  return `${h}h ${m}m`
}

export function EditEventSheet({ open, event, googleCals = [], onClose, onSave, onDelete }: Props) {
  const [step, setStep]                   = useState<'scope' | 'form'>('form')
  const [scope, setScope]                 = useState<RecurrenceScope>('this')
  const [form, setForm]                   = useState<EventEdits | null>(null)
  const [saving, setSaving]               = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const [calDropOpen, setCalDropOpen]     = useState(false)
  const locationRef  = useRef<HTMLTextAreaElement>(null)
  const acRef        = useRef<unknown>(null)
  const backdropRef  = useRef<HTMLDivElement>(null)
  const dragStartY   = useRef<number | null>(null)
  const dragYRef     = useRef(0)
  const sheetRef     = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open && event) {
      setStep(event.recurrenceRule ? 'scope' : 'form')
      setScope('this')
      setSaving(false)
      setConfirmDelete(false)
      setCalDropOpen(false)
      setForm({
        title:          event.title,
        date:           event.date,
        endDate:        event.endDate || event.date,
        allDay:         event.allDay,
        startTime:      event.startTime || '09:00',
        endTime:        event.endTime   || '10:00',
        location:       event.location,
        notes:          event.notes,
        recurrenceRule: event.recurrenceRule,
        calendarId:     event.calendarId || 'primary',
      })
    } else {
      setTimeout(() => { setForm(null); setSaving(false); setConfirmDelete(false) }, 300)
    }
  }, [open, event])

  // Google Places Autocomplete
  useEffect(() => {
    if (!open || step !== 'form' || !locationRef.current) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return
    function init() {
      if (!locationRef.current) return
      const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts: unknown) => { addListener: (ev: string, fn: () => void) => void; getPlace: () => { formatted_address?: string; name?: string } } } } } | undefined
      if (!g?.maps?.places) return
      acRef.current = new g.maps.places.Autocomplete(locationRef.current as unknown as HTMLInputElement, { types: ['geocode', 'establishment'] })
      ;(acRef.current as { addListener: (ev: string, fn: () => void) => void }).addListener('place_changed', () => {
        const place = (acRef.current as { getPlace: () => { formatted_address?: string; name?: string } }).getPlace()
        const addr  = place.formatted_address || place.name || ''
        setForm(f => f ? { ...f, location: addr } : f)
        if (locationRef.current) locationRef.current.value = addr
      })
    }
    const gObj = (window as unknown as Record<string, unknown>).google as { maps?: { places?: unknown } } | undefined
    if (gObj?.maps?.places) { init() }
    else {
      const existing = document.getElementById('gmaps-script')
      if (!existing) {
        const s = document.createElement('script'); s.id = 'gmaps-script'
        s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`; s.async = true; s.onload = init
        document.head.appendChild(s)
      } else { existing.addEventListener('load', init, { once: true }) }
    }
    return () => { acRef.current = null }
  }, [open, step])

  // Lock background scroll while sheet is open
  useEffect(() => {
    const el = backdropRef.current
    if (!el || !open) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [open])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    dragYRef.current = dy
    sheetRef.current.style.transform  = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
        onClose()
      }, 280)
    } else {
      sheetRef.current.style.transform  = ''
      sheetRef.current.style.transition = ''
    }
  }

  function set(k: keyof EventEdits, v: string | boolean) {
    setForm(f => {
      if (!f) return f
      const next = { ...f, [k]: v }
      // Cross-midnight auto-advance: end time before start time on same date → +1 day
      if (k === 'endTime' && typeof v === 'string' && !next.allDay) {
        if (v < next.startTime && next.endDate === next.date) next.endDate = addOneDay(next.date)
      }
      // Start date moved past end date → clamp end date
      if (k === 'date' && typeof v === 'string' && next.endDate < v) {
        next.endDate = v
      }
      return next
    })
  }

  async function handleSave() {
    if (!form) return
    setSaving(true)
    await onSave(form, scope)
    onClose()
  }

  function handleDelete() {
    if (!event?.recurrenceRule) { onDelete('this'); onClose(); return }
    setConfirmDelete(true)
  }

  function confirmDeleteWithScope(s: RecurrenceScope) {
    onDelete(s)
    onClose()
  }

  const canSave = !!form?.title.trim() && !!form?.date && form.date.length === 10

  const selectedCal  = googleCals.find(c => (c.primary ? 'primary' : c.id) === form?.calendarId) ?? googleCals[0]
  const calDotColor  = selectedCal?.backgroundColor ?? '#4285F4'
  const calName      = selectedCal?.summary ?? 'Calendar'

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px',
    borderBottom: `0.5px solid ${SEP}`,
  }

  const pillStyle = (active?: boolean): React.CSSProperties => ({
    position: 'relative',
    display: 'inline-flex', alignItems: 'center',
    background: active ? 'rgba(201,168,76,0.12)' : 'rgba(255,255,255,0.06)',
    borderRadius: 8, padding: '5px 10px',
    fontSize: 13, fontWeight: 500, fontFamily: M,
    color: active ? GOLD : 'var(--color-ink)',
    overflow: 'hidden', cursor: 'pointer', userSelect: 'none',
  })

  const hiddenInput: React.CSSProperties = {
    position: 'absolute', inset: 0, opacity: 0,
    width: '100%', height: '100%', cursor: 'pointer',
    colorScheme: 'dark',
  }

  const labelStyle: React.CSSProperties = {
    fontSize: 9, fontWeight: 600, letterSpacing: '0.1em',
    textTransform: 'uppercase', color: MUTED, marginBottom: 4,
    fontFamily: M,
  }

  const durationStr = form && !form.allDay
    ? calcDuration(form.date, form.startTime, form.endDate, form.endTime)
    : ''

  return (
    <>
      {/* Backdrop */}
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] flex flex-col"
        style={{
          background:    'var(--color-bg-surface)',
          maxHeight:     '85vh',
          willChange:    'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform:     open ? 'translateY(0)' : 'translateY(100%)',
          transition:    'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-2 flex-shrink-0"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* ── Step 1: Scope picker (recurring events only) ── */}
        {step === 'scope' && (
          <>
            <div className="flex items-center justify-between px-4 pb-3 flex-shrink-0">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>Edit Recurring Event</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
                <X size={14} className="text-ink-muted" />
              </button>
            </div>
            <p className="px-4 pb-4 text-[13px] text-ink-muted">Which events do you want to edit?</p>
            <div className="mx-4 bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden mb-4">
              {([
                { scope: 'this'      as RecurrenceScope, label: 'This event' },
                { scope: 'following' as RecurrenceScope, label: 'This and following events' },
                { scope: 'all'       as RecurrenceScope, label: 'All events' },
              ]).map(({ scope: s, label }, i) => (
                <button key={s} onClick={() => { setScope(s); setStep('form') }}
                  className="w-full flex items-center justify-between px-4 py-4 text-left"
                  style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: 'none', cursor: 'pointer' }}>
                  <span className="text-[15px] text-ink">{label}</span>
                  <span className="text-ink-faint text-[18px]">›</span>
                </button>
              ))}
            </div>
            <div className="px-4 pb-4">
              <button onClick={onClose} className="w-full py-3.5 rounded-[14px] bg-bg-overlay border border-white/[0.08] text-[15px] font-medium text-ink-muted">Cancel</button>
            </div>
          </>
        )}

        {/* ── Step 2: Edit form ── */}
        {step === 'form' && form && (
          <>
            {/* Header — × only */}
            <div className="flex items-center justify-end px-4 pb-2 flex-shrink-0">
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
                <X size={14} className="text-ink-muted" />
              </button>
            </div>

            {/* Scrollable form */}
            <div
              className="flex-1 overflow-y-auto"
              style={{ overscrollBehavior: 'contain', overflowX: 'hidden' }}
            >

              {/* 1 — Title */}
              <input
                type="text"
                placeholder="Event name"
                value={form.title}
                onChange={e => set('title', e.target.value)}
                style={{
                  width: '100%', display: 'block',
                  padding: '12px 16px',
                  fontSize: 18, fontWeight: 500, fontFamily: M,
                  color: 'var(--color-ink)',
                  background: 'none', border: 'none', outline: 'none',
                  borderBottom: `0.5px solid ${SEP}`,
                }}
              />

              {/* 2 — All day toggle */}
              <button
                type="button"
                onClick={() => set('allDay', !form.allDay)}
                style={{ ...rowStyle, width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
              >
                <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>All day</span>
                <span style={{
                  width: 44, height: 24, borderRadius: 12, padding: 2,
                  background: form.allDay ? GOLD : 'rgba(255,255,255,0.1)',
                  display: 'inline-flex', alignItems: 'center',
                  justifyContent: form.allDay ? 'flex-end' : 'flex-start',
                  flexShrink: 0, transition: 'background 0.15s',
                }}>
                  <span style={{ width: 20, height: 20, borderRadius: 10, background: '#fff', boxShadow: '0 1px 3px rgba(0,0,0,0.3)' }} />
                </span>
              </button>

              {/* 3 — From / To dates */}
              <div style={rowStyle}>
                <Calendar size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <div style={{ display: 'flex', gap: 10, flex: 1 }}>
                  <div>
                    <p style={labelStyle}>FROM</p>
                    <div style={pillStyle()}>
                      <span>{fmtDatePill(form.date)}</span>
                      <input type="date" value={form.date} style={hiddenInput}
                        onChange={e => set('date', e.target.value)} />
                    </div>
                  </div>
                  <div>
                    <p style={labelStyle}>TO</p>
                    <div style={pillStyle(form.endDate !== form.date)}>
                      <span style={{ color: form.endDate !== form.date ? GOLD : 'var(--color-ink)' }}>
                        {fmtDatePill(form.endDate || form.date)}
                      </span>
                      <input type="date" value={form.endDate || form.date} min={form.date} style={hiddenInput}
                        onChange={e => set('endDate', e.target.value)} />
                    </div>
                  </div>
                </div>
              </div>

              {/* 4 — Start / End time + duration */}
              {!form.allDay && (
                <div style={rowStyle}>
                  <Clock size={16} color={MUTED} style={{ flexShrink: 0 }} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', flex: 1 }}>
                    <div>
                      <p style={labelStyle}>START</p>
                      <div style={pillStyle()}>
                        <span>{fmt12(form.startTime)}</span>
                        <input type="time" value={form.startTime} style={{ ...hiddenInput, colorScheme: 'dark' }}
                          onChange={e => set('startTime', e.target.value)} />
                      </div>
                    </div>
                    <div>
                      <p style={labelStyle}>END</p>
                      <div style={pillStyle()}>
                        <span>{fmt12(form.endTime)}</span>
                        <input type="time" value={form.endTime} style={{ ...hiddenInput, colorScheme: 'dark' }}
                          onChange={e => set('endTime', e.target.value)} />
                      </div>
                    </div>
                    {durationStr && (
                      <span style={{ fontSize: 12, color: MUTED, fontFamily: M, alignSelf: 'flex-end', paddingBottom: 2 }}>
                        {durationStr}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* 5 — Repeat */}
              <button
                type="button"
                onClick={() => setRecurrencePickerOpen(true)}
                style={{ ...rowStyle, width: '100%', cursor: 'pointer', background: 'none', border: 'none', textAlign: 'left' }}
              >
                <RefreshCw size={16} color={MUTED} style={{ flexShrink: 0 }} />
                <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>Repeat</span>
                <span style={{ fontSize: 13, color: MUTED, fontFamily: M, marginRight: 4 }}>
                  {form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || localToday()) : 'Never'}
                </span>
                <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />
              </button>

              {/* 6 — Location */}
              <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                <MapPin size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
                <textarea
                  ref={locationRef}
                  placeholder="Location"
                  defaultValue={form.location}
                  onChange={e => set('location', e.target.value)}
                  rows={1}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 14, color: 'var(--color-ink)', fontFamily: M,
                    lineHeight: 1.5, overflowX: 'hidden',
                  }}
                />
              </div>

              {/* 7 — Notes */}
              <div style={{ ...rowStyle, alignItems: 'flex-start' }}>
                <AlignLeft size={16} color={MUTED} style={{ flexShrink: 0, marginTop: 2 }} />
                <textarea
                  placeholder="Notes"
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={2}
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none', resize: 'none',
                    fontSize: 14, color: 'var(--color-ink)', fontFamily: M,
                    lineHeight: 1.5,
                  }}
                />
              </div>

              {/* 8 — Calendar selector */}
              {googleCals.length > 0 && (
                <div style={{ position: 'relative' }}>
                  <div style={rowStyle}>
                    <span style={{ width: 10, height: 10, borderRadius: 3, background: calDotColor, flexShrink: 0, display: 'inline-block' }} />
                    <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M }}>{calName}</span>
                    <ChevronDown size={14} color={MUTED} style={{ flexShrink: 0 }} />
                  </div>
                  <select
                    value={form.calendarId}
                    onChange={e => set('calendarId', e.target.value)}
                    style={{ position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                  >
                    {googleCals.map(cal => (
                      <option key={cal.id} value={cal.primary ? 'primary' : cal.id}>
                        {cal.summary}{cal.primary ? ' (primary)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Spacer so content clears the fixed footer */}
              <div style={{ height: 120 }} />
            </div>

            {/* Fixed footer — Delete + Save */}
            <div
              className="flex-shrink-0"
              style={{
                borderTop: `0.5px solid ${SEP}`,
                padding: '12px 16px 16px',
              }}
            >
              <button
                type="button"
                onClick={handleDelete}
                style={{
                  display: 'block', background: 'none', border: 'none', cursor: 'pointer',
                  fontSize: 14, fontFamily: M, color: '#ef4444',
                  padding: '4px 0 12px', textAlign: 'left',
                }}
              >
                Delete Event
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={!canSave || saving}
                style={{
                  width: '100%', padding: '14px',
                  background: GOLD, border: 'none', borderRadius: 14,
                  fontSize: 15, fontWeight: 700, fontFamily: M,
                  color: '#1a1200', cursor: canSave && !saving ? 'pointer' : 'not-allowed',
                  opacity: canSave && !saving ? 1 : 0.4,
                  transition: 'opacity 0.15s',
                }}
              >
                {saving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
      </div>

      {/* Delete scope picker (for recurring events) */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[24px]" style={{ background: 'var(--color-bg-elevated)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full bg-white/20" />
            </div>
            <div className="px-4 pb-4">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: 'var(--color-ink)' }}>Delete Recurring Event</h2>
              <p style={{ fontFamily: M, fontSize: 13, color: MUTED, marginTop: 4 }}>Which events do you want to delete?</p>
            </div>
            <div style={{ borderTop: `0.5px solid ${SEP}` }}>
              {([
                { s: 'this'      as RecurrenceScope, label: 'This event',                danger: false },
                { s: 'following' as RecurrenceScope, label: 'This and following events', danger: false },
                { s: 'all'       as RecurrenceScope, label: 'All events',                danger: true  },
              ]).map(({ s, label, danger }, i) => (
                <button key={s} onClick={() => confirmDeleteWithScope(s)}
                  className="w-full px-4 py-4 text-left"
                  style={{ borderBottom: i < 2 ? `0.5px solid ${SEP}` : 'none', background: 'none', cursor: 'pointer' }}>
                  <span style={{ fontFamily: M, fontSize: 15, fontWeight: 500, color: danger ? '#ef4444' : 'var(--color-ink)' }}>{label}</span>
                </button>
              ))}
            </div>
            <div className="px-4 py-4">
              <button onClick={() => setConfirmDelete(false)}
                className="w-full py-3.5 rounded-[14px] bg-white/[0.06] text-[15px] font-medium text-ink-muted">
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      <RecurrencePicker
        open={recurrencePickerOpen}
        date={form?.date || localToday()}
        value={form?.recurrenceRule ?? ''}
        onClose={() => setRecurrencePickerOpen(false)}
        onChange={rule => set('recurrenceRule', rule)}
      />
    </>
  )
}
