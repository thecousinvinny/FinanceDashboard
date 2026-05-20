'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X, ChevronDown, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import type { GCalendar } from './CalendarSettingsSheet'

export interface NewCalEvent {
  title:          string
  date:           string
  allDay:         boolean
  startTime:      string
  endTime:        string
  location:       string
  notes:          string
  calendarId:     string
  recurrenceRule: string
}

interface Props {
  open:               boolean
  defaultDate?:       string
  defaultCalendarId?: string
  googleCals?:        GCalendar[]
  onClose:            () => void
  onAdd:              (ev: NewCalEvent) => Promise<void>
}

const EMPTY: NewCalEvent = {
  title: '', date: '', allDay: false,
  startTime: '09:00', endTime: '10:00',
  location: '', notes: '', calendarId: 'primary', recurrenceRule: '',
}

export function AddEventSheet({ open, defaultDate, defaultCalendarId, googleCals = [], onClose, onAdd }: Props) {
  const [form,               setForm]               = useState<NewCalEvent>(EMPTY)
  const [saving,             setSaving]             = useState(false)
  const [recurrencePickerOpen, setRecurrencePickerOpen] = useState(false)
  const locationRef = useRef<HTMLInputElement>(null)
  const acRef       = useRef<unknown>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, date: defaultDate ?? '', calendarId: defaultCalendarId ?? 'primary' })
    } else {
      setTimeout(() => { setForm(EMPTY); setSaving(false) }, 300)
    }
  }, [open, defaultDate, defaultCalendarId])

  // Google Places Autocomplete — loads the Maps JS API on demand
  useEffect(() => {
    if (!open || !locationRef.current) return
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return

    function init() {
      if (!locationRef.current) return
      const g = (window as unknown as Record<string, unknown>).google as {
        maps?: { places?: { Autocomplete: new (el: HTMLInputElement, opts: unknown) => {
          addListener: (ev: string, fn: () => void) => void
          getPlace:    () => { formatted_address?: string; name?: string }
        } } }
      } | undefined
      if (!g?.maps?.places) return
      acRef.current = new g.maps.places.Autocomplete(locationRef.current, {
        types: ['geocode', 'establishment'],
      })
      ;(acRef.current as { addListener: (ev: string, fn: () => void) => void }).addListener('place_changed', () => {
        const place = (acRef.current as { getPlace: () => { formatted_address?: string; name?: string } }).getPlace()
        const addr  = place.formatted_address || place.name || ''
        setForm(f => ({ ...f, location: addr }))
      })
    }

    const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: unknown } } | undefined
    if (g?.maps?.places) {
      init()
    } else {
      const existing = document.getElementById('gmaps-script')
      if (!existing) {
        const s    = document.createElement('script')
        s.id       = 'gmaps-script'
        s.src      = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`
        s.async    = true
        s.onload   = init
        document.head.appendChild(s)
      } else {
        existing.addEventListener('load', init, { once: true })
      }
    }
    return () => { acRef.current = null }
  }, [open])

  function set(k: keyof NewCalEvent, v: string | boolean) {
    setForm(f => ({ ...f, [k]: v }))
  }

  async function handleSubmit() {
    if (!form.title.trim() || !form.date) return
    setSaving(true)
    await onAdd(form)
    onClose()
  }

  const canSave = form.title.trim().length > 0 && form.date.length === 10

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">New Event</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="px-5 space-y-3 overflow-y-auto"
          style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}
        >
          {/* Title */}
          <input
            type="text"
            placeholder="Event title"
            value={form.title}
            onChange={e => set('title', e.target.value)}
            className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"
          />

          {/* Date — wrapper clips iOS native control to border-radius */}
          <div className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full px-4 py-3.5 text-[15px] text-ink bg-transparent outline-none"
              style={{ colorScheme: 'dark' }}
            />
          </div>

          {/* Calendar dropdown */}
          {googleCals.length > 0 && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-2 pl-1">Calendar</p>
              <div className="relative w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                <select
                  value={form.calendarId}
                  onChange={e => set('calendarId', e.target.value)}
                  className="w-full px-4 py-3.5 pr-10 text-[15px] text-ink bg-transparent outline-none appearance-none"
                  style={{ colorScheme: 'dark' }}
                >
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

          {/* All-day toggle — whole row is clickable; toggle visual uses span, not nested button */}
          <button
            type="button"
            onClick={() => set('allDay', !form.allDay)}
            className="w-full flex items-center justify-between bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-left"
          >
            <div className="flex items-center gap-2.5 pointer-events-none">
              <Clock size={15} className="text-ink-muted" />
              <span className="text-[14px] text-ink">All day</span>
            </div>
            <span
              className={`w-11 h-6 rounded-full relative flex-shrink-0 inline-block transition-colors pointer-events-none ${form.allDay ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}
            >
              <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.allDay ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
            </span>
          </button>

          {/* Time pickers — wrapper clips iOS native time control */}
          {!form.allDay && (
            <div className="flex gap-2">
              <div className="flex-1">
                <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">Start</p>
                <div className="bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => set('startTime', e.target.value)}
                    className="w-full px-4 py-3 text-[15px] text-ink bg-transparent outline-none"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
              <div className="flex-1">
                <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">End</p>
                <div className="bg-bg-overlay border border-white/[0.08] rounded-[14px] overflow-hidden">
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => set('endTime', e.target.value)}
                    className="w-full px-4 py-3 text-[15px] text-ink bg-transparent outline-none"
                    style={{ colorScheme: 'dark' }}
                  />
                </div>
              </div>
            </div>
          )}

          {/* Repeat */}
          <button
            type="button"
            onClick={() => setRecurrencePickerOpen(true)}
            className="w-full flex items-center justify-between bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-left"
          >
            <div className="flex items-center gap-2.5 pointer-events-none">
              <RefreshCw size={15} className="text-ink-muted" />
              <span className="text-[14px] text-ink">Repeat</span>
            </div>
            <span className="text-[13px] text-ink-muted">
              {form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || new Date().toISOString().slice(0,10)) : 'Never'}
            </span>
          </button>

          {/* Location */}
          <div className="relative">
            <MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
            <input
              ref={locationRef}
              type="text"
              placeholder="Add location"
              value={form.location}
              onChange={e => set('location', e.target.value)}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] pl-10 pr-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"
            />
          </div>

          {/* Notes */}
          <div className="relative">
            <AlignLeft size={15} className="absolute left-4 top-4 text-ink-muted pointer-events-none" />
            <textarea
              placeholder="Notes"
              value={form.notes}
              onChange={e => set('notes', e.target.value)}
              rows={3}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] pl-10 pr-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40 resize-none"
            />
          </div>

          {/* Save */}
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!canSave || saving}
            className="w-full gradient-gold rounded-[14px] py-4 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Saving…' : 'Add to Calendar'}
          </button>
        </div>
      </div>
      <RecurrencePicker
        open={recurrencePickerOpen}
        date={form.date || new Date().toISOString().slice(0, 10)}
        value={form.recurrenceRule}
        onClose={() => setRecurrencePickerOpen(false)}
        onChange={rule => set('recurrenceRule', rule)}
      />
    </>
  )
}
