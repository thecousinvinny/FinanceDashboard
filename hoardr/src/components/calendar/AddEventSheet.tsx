'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, AlignLeft, X } from 'lucide-react'
import type { GCalendar } from './CalendarSettingsSheet'

export interface NewCalEvent {
  title:      string
  date:       string
  allDay:     boolean
  startTime:  string
  endTime:    string
  location:   string
  notes:      string
  calendarId: string
}

interface Props {
  open:         boolean
  defaultDate?: string
  googleCals?:  GCalendar[]
  onClose:      () => void
  onAdd:        (ev: NewCalEvent) => Promise<void>
}

const EMPTY: NewCalEvent = {
  title: '', date: '', allDay: true,
  startTime: '09:00', endTime: '10:00',
  location: '', notes: '', calendarId: 'primary',
}

export function AddEventSheet({ open, defaultDate, googleCals = [], onClose, onAdd }: Props) {
  const [form,   setForm]   = useState<NewCalEvent>(EMPTY)
  const [saving, setSaving] = useState(false)
  const locationRef = useRef<HTMLInputElement>(null)
  const acRef       = useRef<unknown>(null)

  useEffect(() => {
    if (open) {
      setForm({ ...EMPTY, date: defaultDate ?? '' })
    } else {
      setTimeout(() => { setForm(EMPTY); setSaving(false) }, 300)
    }
  }, [open, defaultDate])

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [open])

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
        if (locationRef.current) locationRef.current.value = addr
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
      <div
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      <div className={`fixed inset-x-0 bottom-0 z-50 transition-transform duration-300 ${open ? 'translate-y-0' : 'translate-y-full'}`}>
        <div className="bg-bg-surface rounded-t-[24px] max-h-[90dvh] overflow-y-auto overscroll-contain px-5 pt-3 pb-10">

          <div className="w-9 h-1 rounded-full bg-white/20 mx-auto mb-5" />

          <div className="flex items-center justify-between mb-5">
            <h2 className="text-[18px] font-bold text-ink">New Event</h2>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
              <X size={14} className="text-ink-muted" />
            </button>
          </div>

          <div className="space-y-3">
            {/* Title */}
            <input
              type="text"
              placeholder="Event title"
              value={form.title}
              onChange={e => set('title', e.target.value)}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"
              autoFocus
            />

            {/* Date */}
            <input
              type="date"
              value={form.date}
              onChange={e => set('date', e.target.value)}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none focus:border-gold/40 [color-scheme:dark]"
            />

            {/* Calendar picker */}
            {googleCals.length > 0 && (
              <div>
                <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-2 pl-1">Calendar</p>
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
                  {googleCals.map(cal => {
                    const calId  = cal.primary ? 'primary' : cal.id
                    const active = form.calendarId === calId
                    return (
                      <button
                        key={cal.id}
                        onClick={() => set('calendarId', calId)}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[12px] font-medium border transition-colors ${
                          active
                            ? 'gradient-gold text-white border-transparent'
                            : 'bg-bg-overlay border-white/10 text-ink-muted'
                        }`}
                      >
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: cal.backgroundColor }} />
                        {cal.summary}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            {/* All-day toggle */}
            <div className="flex items-center justify-between bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5">
              <div className="flex items-center gap-2.5">
                <Clock size={15} className="text-ink-muted" />
                <span className="text-[14px] text-ink">All day</span>
              </div>
              <button
                onClick={() => set('allDay', !form.allDay)}
                className={`w-11 h-6 rounded-full transition-colors relative overflow-hidden ${form.allDay ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}
              >
                <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${form.allDay ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
              </button>
            </div>

            {/* Time pickers (hidden when all-day) */}
            {!form.allDay && (
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">Start</p>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={e => set('startTime', e.target.value)}
                    className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink outline-none focus:border-gold/40 [color-scheme:dark]"
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1.5 pl-1">End</p>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={e => set('endTime', e.target.value)}
                    className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink outline-none focus:border-gold/40 [color-scheme:dark]"
                  />
                </div>
              </div>
            )}

            {/* Location */}
            <div className="relative">
              <MapPin size={15} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              <input
                ref={locationRef}
                type="text"
                placeholder="Add location"
                defaultValue={form.location}
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
          </div>

          <button
            onClick={handleSubmit}
            disabled={!canSave || saving}
            className="mt-5 w-full gradient-gold rounded-[14px] py-4 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Saving…' : 'Add to Calendar'}
          </button>
        </div>
      </div>
    </>
  )
}
