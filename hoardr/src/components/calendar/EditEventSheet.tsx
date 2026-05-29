'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X, ChevronDown, RefreshCw, Trash2 } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import type { GCalendar } from './CalendarSettingsSheet'

export interface EditableEvent {
  id:             string
  title:          string
  allDay:         boolean
  date:           string
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

const M = 'var(--font-montserrat)'

export function EditEventSheet({ open, event, googleCals = [], onClose, onSave, onDelete }: Props) {
  const [step, setStep]             = useState<'scope' | 'form'>('form')
  const [scope, setScope]           = useState<RecurrenceScope>('this')
  const [form, setForm]             = useState<EventEdits | null>(null)
  const [saving, setSaving]         = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const [dragY,              setDragY]              = useState(0)
  const locationRef  = useRef<HTMLTextAreaElement>(null)
  const acRef        = useRef<unknown>(null)
  const backdropRef  = useRef<HTMLDivElement>(null)
  const dragStartY   = useRef<number | null>(null)

  useEffect(() => {
    if (open && event) {
      setStep(event.recurrenceRule ? 'scope' : 'form')
      setScope('this')
      setSaving(false)
      setConfirmDelete(false)
      setForm({
        title:          event.title,
        date:           event.date,
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

  useEffect(() => { if (!open) setDragY(0) }, [open])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current))
  }
  function onDragEnd() {
    const dy = dragY; dragStartY.current = null; setDragY(0)
    if (dy > 80) onClose()
  }

  function set(k: keyof EventEdits, v: string | boolean) {
    setForm(f => f ? { ...f, [k]: v } : f)
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
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface"
        style={{
          willChange: 'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Handle — drag target */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* ── Step 1: Scope picker (recurring events only) ── */}
        {step === 'scope' && (
          <>
            <div className="flex items-center justify-between px-5 mb-4">
              <h2 className="text-[18px] font-bold text-ink">Edit Recurring Event</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
                <X size={14} className="text-ink-muted" />
              </button>
            </div>
            <p className="px-5 text-[13px] text-ink-muted mb-4">Which events do you want to edit?</p>
            <div className="mx-5 bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden mb-5">
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
            <div className="px-5 pb-4">
              <button onClick={onClose} className="w-full py-3.5 rounded-[14px] bg-bg-overlay border border-white/[0.08] text-[15px] font-medium text-ink-muted">Cancel</button>
            </div>
          </>
        )}

        {/* ── Step 2: Edit form ── */}
        {step === 'form' && form && (
          <>
            <div className="flex items-center justify-between px-5 mb-4">
              <h2 className="text-[18px] font-bold text-ink">Edit Event</h2>
              <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
                <X size={14} className="text-ink-muted" />
              </button>
            </div>

            <div className="px-5 space-y-3 overflow-y-auto"
              style={{ maxHeight: '70vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

              {/* Title */}
              <input type="text" placeholder="Event title" value={form.title} onChange={e => set('title', e.target.value)}
                className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40" />

              {/* Date */}
              <div className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                <input type="date" value={form.date} onChange={e => set('date', e.target.value)}
                  className="w-full px-4 py-3 text-[15px] text-ink bg-transparent outline-none"
                  style={{ colorScheme: 'dark' }} />
              </div>

              {/* Calendar dropdown */}
              {googleCals.length > 0 && (
                <div>
                  <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-2 pl-1">Calendar</p>
                  <div className="relative w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                    <select value={form.calendarId} onChange={e => set('calendarId', e.target.value)}
                      className="w-full px-4 py-3 pr-10 text-[15px] text-ink bg-transparent outline-none appearance-none"
                      style={{ colorScheme: 'dark' }}>
                      {googleCals.map(cal => (
                        <option key={cal.id} value={cal.primary ? 'primary' : cal.id}>
                          {cal.summary}{cal.primary ? ' (primary)' : ''}
                        </option>
                      ))}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                  </div>
                </div>
              )}

              {/* All-day toggle */}
              <button type="button" onClick={() => set('allDay', !form.allDay)}
                className="w-full flex items-center justify-between bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-left">
                <div className="flex items-center gap-2.5 pointer-events-none">
                  <Clock size={15} className="text-ink-muted" />
                  <span className="text-[14px] text-ink">All day</span>
                </div>
                <span className={`w-11 h-6 rounded-full relative flex-shrink-0 inline-block transition-colors pointer-events-none ${form.allDay ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}>
                  <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.allDay ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                </span>
              </button>

              {/* Time pickers */}
              {!form.allDay && (
                <div className="flex gap-2">
                  <div className="flex-1">
                    <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">Start</p>
                    <div className="bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                      <input type="time" value={form.startTime} onChange={e => set('startTime', e.target.value)}
                        className="w-full px-4 py-3 text-[15px] text-ink bg-transparent outline-none" style={{ colorScheme: 'dark' }} />
                    </div>
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">End</p>
                    <div className="bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                      <input type="time" value={form.endTime} onChange={e => set('endTime', e.target.value)}
                        className="w-full px-4 py-3 text-[15px] text-ink bg-transparent outline-none" style={{ colorScheme: 'dark' }} />
                    </div>
                  </div>
                </div>
              )}

              {/* Repeat */}
              <button type="button" onClick={() => setRecurrencePickerOpen(true)}
                className="w-full flex items-center justify-between bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-left">
                <div className="flex items-center gap-2.5 pointer-events-none">
                  <RefreshCw size={15} className="text-ink-muted" />
                  <span className="text-[14px] text-ink">Repeat</span>
                </div>
                <span className="text-[13px] text-ink-muted">
                  {form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || localToday()) : 'Never'}
                </span>
              </button>

              {/* Location */}
              <div className="relative">
                <MapPin size={15} className="absolute left-4 top-3.5 text-ink-muted pointer-events-none" />
                <textarea ref={locationRef} placeholder="Add location" defaultValue={form.location}
                  onChange={e => set('location', e.target.value)}
                  rows={2}
                  className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] pl-10 pr-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40 resize-none" />
              </div>

              {/* Notes */}
              <div className="relative">
                <AlignLeft size={15} className="absolute left-4 top-4 text-ink-muted pointer-events-none" />
                <textarea placeholder="Notes" value={form.notes} onChange={e => set('notes', e.target.value)} rows={3}
                  className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] pl-10 pr-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40 resize-none" />
              </div>

              {/* Save */}
              <button type="button" onClick={handleSave} disabled={!canSave || saving}
                className="w-full gradient-gold rounded-[14px] py-3.5 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity">
                {saving ? 'Saving…' : 'Save'}
              </button>

              {/* Delete */}
              <button type="button" onClick={handleDelete}
                className="w-full bg-bg-overlay border border-ruby/30 rounded-[14px] py-3.5 text-[15px] font-medium text-ruby flex items-center justify-center gap-2">
                <Trash2 size={15} />
                Delete Event
              </button>

            </div>
          </>
        )}
      </div>

      {/* Delete scope picker (for recurring events) */}
      {confirmDelete && (
        <>
          <div className="fixed inset-0 z-[60]" style={{ background: 'rgba(0,0,0,0.6)' }} onClick={() => setConfirmDelete(false)} />
          <div className="fixed inset-x-0 bottom-0 z-[70] rounded-t-[24px]" style={{ background: '#1a1a1a', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
            <div className="flex justify-center pt-3 pb-2">
              <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
            </div>
            <div className="px-5 mb-4">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: '#fff' }}>Delete Recurring Event</h2>
              <p style={{ fontFamily: M, fontSize: 13, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Which events do you want to delete?</p>
            </div>
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
              {([
                { s: 'this'      as RecurrenceScope, label: 'This event',                  danger: false },
                { s: 'following' as RecurrenceScope, label: 'This and following events',   danger: false },
                { s: 'all'       as RecurrenceScope, label: 'All events',                  danger: true  },
              ]).map(({ s, label, danger }, i) => (
                <button key={s} onClick={() => confirmDeleteWithScope(s)}
                  className="w-full px-5 py-4 text-left"
                  style={{ borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.06)' : 'none', background: 'none', cursor: 'pointer' }}>
                  <span style={{ fontFamily: M, fontSize: 15, fontWeight: 500, color: danger ? '#ef4444' : '#fff' }}>{label}</span>
                </button>
              ))}
            </div>
            <div className="px-5 py-4">
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
