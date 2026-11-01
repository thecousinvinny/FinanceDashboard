'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Repeat, AlignLeft, Copy, Trash2, Sun } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { rruleLabel } from '@/lib/rrule'
import { RecurrencePicker } from './RecurrencePicker'
import { LocationPickerSheet } from './LocationPickerSheet'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { ActionSheet } from '@/components/ui/ActionSheet'
import { FormGroup, FormRow, Toggle } from '@/components/ui/Form'
import { DateRangePicker } from './DateRangePicker'
import { useIsLargeScreen } from '@/lib/use-large-screen'
import type { GCalendar } from './CalendarSettingsSheet'
import type { RecurScope } from '@/lib/calendar'
import { pushLocRecent } from '@/lib/location-prefs'

export interface EditableEvent {
  id?:            string
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
  recurringEventId?: string   // Google master id — set when editing a recurring instance
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

export type RecurrenceScope = RecurScope

interface Props {
  open:        boolean
  event:       EditableEvent | null
  googleCals?: GCalendar[]
  onClose:     () => void
  // Resolves false when the write failed — the sheet then stays open so the
  // user's edits survive. void/undefined is treated as success.
  onSave:      (edits: EventEdits, scope: RecurrenceScope) => Promise<boolean | void>
  onDelete:    (scope: RecurrenceScope) => void
  onDuplicate?: (edits: EventEdits) => void
}

function fmt12(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function fmtDate(dateStr: string): string {
  if (!dateStr) return ''
  const [y, mo, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, mo - 1, d)
  const sameYear = y === new Date().getFullYear()
  return dt.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) })
}

function addOneDay(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d + 1)
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`
}

function calcDuration(date: string, startTime: string, endDate: string, endTime: string): string {
  const totalMin = Math.round((new Date(`${endDate}T${endTime}:00`).getTime() - new Date(`${date}T${startTime}:00`).getTime()) / 60000)
  if (totalMin <= 0) return ''
  const h = Math.floor(totalMin / 60), m = totalMin % 60
  return h === 0 ? `${m} min` : m === 0 ? `${h} hr` : `${h} hr ${m} min`
}

/** A tappable value chip in a row: a hidden native picker sits on top of it on phone. */
function Chip({ children, active, onClick, picker }: {
  children: React.ReactNode; active?: boolean; onClick?: (e: React.MouseEvent) => void; picker?: React.ReactNode
}) {
  return (
    <span
      onClick={onClick}
      className="relative inline-flex items-center h-[34px] px-3 rounded-[8px] text-[15px] tabular-nums cursor-pointer select-none overflow-hidden"
      style={{
        background: active ? 'rgb(212 175 55 / 0.16)' : 'rgb(var(--rgb-ink) / 0.08)',
        color: active ? '#D4AF37' : 'rgb(var(--rgb-ink))',
      }}
    >
      {children}
      {picker}
    </span>
  )
}

const hiddenInput: React.CSSProperties = {
  position: 'absolute', inset: 0, opacity: 0, width: '100%', height: '100%', cursor: 'pointer',
}

/** iPhone event sheet for create and edit (PC uses CalendarPopover). */
export function EditEventSheet({ open, event, googleCals = [], onClose, onSave, onDelete, onDuplicate }: Props) {
  const [form, setForm]                   = useState<EventEdits | null>(null)
  const [saving, setSaving]               = useState(false)
  const [confirmScope, setConfirmScope]   = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recurOpen, setRecurOpen]         = useState(false)
  const [locOpen,   setLocOpen]           = useState(false)
  const [rangeAnchor, setRangeAnchor]     = useState<DOMRect | null>(null)
  const isLargeScreen = useIsLargeScreen()
  const notesRef = useRef<HTMLTextAreaElement>(null)

  // `event` identity changes again shortly after open when the master's RRULE
  // arrives from Google. Only a genuinely different event resets the form —
  // a late-arriving rule just patches that one field, so edits made in the
  // meantime survive.
  const prevEvent = useRef<EditableEvent | null>(null)
  useEffect(() => {
    if (open && event) {
      const prev = prevEvent.current
      prevEvent.current = event
      // The ONLY case that should skip a full re-init is the master's rule
      // landing on the event we already initialized. Comparing ids alone was
      // wrong: a create has no id, so `undefined !== undefined` was false and
      // the form never initialized at all — a blank sheet.
      const onlyRuleArrived = !!prev && prev !== event
        && prev.id === event.id && prev.date === event.date && prev.title === event.title
        && prev.recurrenceRule !== event.recurrenceRule
      if (onlyRuleArrived) {
        setForm(f => f ? { ...f, recurrenceRule: event.recurrenceRule } : f)
        return
      }
      setSaving(false)
      setConfirmDelete(false)
      setConfirmScope(false)
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
      prevEvent.current = null
      // After the sheet's close animation, so the form doesn't blank mid-slide
      const t = setTimeout(() => { setForm(null); setSaving(false); setConfirmDelete(false); setConfirmScope(false) }, 400)
      return () => clearTimeout(t)
    }
  }, [open, event])

  // Notes grow with their text
  useEffect(() => {
    const el = notesRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }, [form?.notes])

  function set(k: keyof EventEdits, v: string | boolean) {
    setForm(f => {
      if (!f) return f
      const next = { ...f, [k]: v }
      // Cross-midnight: an end before the start means the next day
      if (k === 'endTime' && typeof v === 'string' && !next.allDay) {
        if (v < next.startTime && next.endDate === next.date) next.endDate = addOneDay(next.date)
      }
      if (k === 'date' && typeof v === 'string' && next.endDate < v) next.endDate = v
      return next
    })
  }

  // Ask about scope at the moment of saving rather than up front, so a simple
  // edit doesn't open with a question before you've even seen the event.
  async function handleSave() {
    if (!form) return
    const isRecurring = !!event?.recurrenceRule && !!event.id
    if (!isRecurring) { await commitSave('this'); return }
    // Rewriting the rule can't apply to a single instance — no point asking.
    if (form.recurrenceRule !== event.recurrenceRule) { await commitSave('following'); return }
    setConfirmScope(true)
  }

  async function commitSave(s: RecurrenceScope) {
    if (!form) return
    setConfirmScope(false)
    setSaving(true)
    // Remember the location (typed text included) for next time's suggestions
    if (form.location.trim()) pushLocRecent(form.location)
    // On failure the sheet stays open with the form intact; the caller's
    // toast explains why.
    const ok = await onSave(form, s)
    if (ok === false) { setSaving(false); return }
    onClose()
  }

  function handleDelete() {
    if (!event?.recurrenceRule) { onDelete('this'); onClose(); return }
    setConfirmDelete(true)
  }

  const canSave = !!form?.title.trim() && !!form?.date && form.date.length === 10
  const isEdit  = !!event?.id

  const selectedCal = googleCals.find(c => (c.primary ? 'primary' : c.id) === form?.calendarId) ?? googleCals[0]
  const duration = form && !form.allDay ? calcDuration(form.date, form.startTime, form.endDate, form.endTime) : ''
  const multiDay = !!form && form.endDate !== form.date

  // PC: either date opens the range picker; phone: each chip has its own wheel
  const openRange = (e: React.MouseEvent) => {
    if (!isLargeScreen) return
    setRangeAnchor((e.currentTarget as HTMLElement).closest('.form-row')?.getBoundingClientRect() ?? null)
  }
  const dateChip = (key: 'date' | 'endDate', active?: boolean) => form && (
    <Chip active={active} onClick={openRange} picker={!isLargeScreen && (
      <input type="date" value={key === 'date' ? form.date : (form.endDate || form.date)}
        min={key === 'endDate' ? form.date : undefined}
        onChange={e => e.target.value && set(key, e.target.value)} style={hiddenInput} />
    )}>
      {fmtDate(key === 'date' ? form.date : (form.endDate || form.date))}
    </Chip>
  )
  const timeChip = (key: 'startTime' | 'endTime') => form && (
    <Chip picker={
      <input type="time" value={form[key]} onChange={e => e.target.value && set(key, e.target.value)} style={hiddenInput} />
    }>
      {fmt12(form[key])}
    </Chip>
  )

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title={isEdit ? 'Edit Event' : 'New Event'}
        action={{ label: saving ? 'Saving…' : isEdit ? 'Save' : 'Add', onClick: () => { void handleSave() }, disabled: !canSave || saving }}
      >
        {form && (
          <>
            <FormGroup>
              <FormRow>
                <input
                  type="text" placeholder="Title" value={form.title}
                  onChange={e => set('title', e.target.value)}
                  className="w-full bg-transparent text-[17px] font-medium text-ink placeholder:text-ink-faint outline-none"
                />
              </FormRow>
              <FormRow icon={MapPin} onClick={() => setLocOpen(true)} chevron>
                <span className={`flex-1 min-w-0 truncate text-left ${form.location ? 'text-ink' : 'text-ink-faint'}`}>
                  {form.location || 'Location'}
                </span>
              </FormRow>
            </FormGroup>

            <FormGroup footer={duration ? `Lasts ${duration}` : undefined}>
              <FormRow icon={Sun} label="All-day">
                <Toggle checked={form.allDay} onChange={v => set('allDay', v)} label="All-day" />
              </FormRow>
              <FormRow label="Starts">
                {dateChip('date')}
                {!form.allDay && timeChip('startTime')}
              </FormRow>
              <FormRow label="Ends">
                {dateChip('endDate', multiDay)}
                {!form.allDay && timeChip('endTime')}
              </FormRow>
            </FormGroup>

            <FormGroup>
              <FormRow icon={Repeat} label="Repeat" onClick={() => setRecurOpen(true)} chevron>
                <span className="truncate">{form.recurrenceRule ? rruleLabel(form.recurrenceRule, form.date || localToday()) : 'Never'}</span>
              </FormRow>
              {googleCals.length > 0 && (
                <Select
                  value={form.calendarId}
                  onChange={e => set('calendarId', e.target.value)}
                  aria-label="Calendar"
                  className="w-full text-left"
                  trigger={
                    <FormRow label={
                      <span className="flex items-center gap-3">
                        <span className="w-[22px] flex justify-center flex-shrink-0">
                          <span className="w-[11px] h-[11px] rounded-[3px]" style={{ background: selectedCal?.backgroundColor ?? '#4285F4' }} />
                        </span>
                        Calendar
                      </span>
                    } chevron>
                      <span className="truncate">{selectedCal?.summary ?? 'Calendar'}</span>
                    </FormRow>
                  }
                >
                  {googleCals.map(cal => (
                    <option key={cal.id} value={cal.primary ? 'primary' : cal.id}>
                      {cal.summary}{cal.primary ? ' (primary)' : ''}
                    </option>
                  ))}
                </Select>
              )}
            </FormGroup>

            <FormGroup>
              <FormRow icon={AlignLeft} alignTop>
                <textarea
                  ref={notesRef}
                  placeholder="Notes"
                  value={form.notes}
                  onChange={e => set('notes', e.target.value)}
                  rows={3}
                  className="w-full bg-transparent text-[16px] leading-[1.45] text-ink placeholder:text-ink-faint outline-none resize-none overflow-hidden"
                />
              </FormRow>
            </FormGroup>

            {isEdit && (
              <FormGroup>
                {onDuplicate && (
                  <FormRow icon={Copy} label={<span className="text-gold">Duplicate</span>} onClick={() => onDuplicate(form)} />
                )}
                <FormRow icon={Trash2} label={<span className="text-ruby">Delete Event</span>} onClick={handleDelete} />
              </FormGroup>
            )}
          </>
        )}
      </Sheet>

      {/* Scope questions — asked on Save / Delete, not before the form is shown */}
      <ActionSheet
        open={confirmScope}
        title="This is a repeating event."
        message="Save the change for this event only, or for this and the ones after it?"
        onClose={() => setConfirmScope(false)}
        options={[
          { label: 'Save for this event only', onSelect: () => { void commitSave('this') } },
          { label: 'Save for this and future events', onSelect: () => { void commitSave('following') } },
        ]}
      />
      <ActionSheet
        open={confirmDelete}
        title="This is a repeating event."
        onClose={() => setConfirmDelete(false)}
        options={[
          { label: 'Delete this event only', destructive: true, onSelect: () => { setConfirmDelete(false); onDelete('this'); onClose() } },
          { label: 'Delete this and future events', destructive: true, onSelect: () => { setConfirmDelete(false); onDelete('following'); onClose() } },
        ]}
      />

      <RecurrencePicker
        open={recurOpen}
        date={form?.date || localToday()}
        value={form?.recurrenceRule ?? ''}
        onClose={() => setRecurOpen(false)}
        onChange={rule => set('recurrenceRule', rule)}
      />

      <LocationPickerSheet
        open={locOpen}
        initial={form?.location ?? ''}
        onClose={() => setLocOpen(false)}
        onSelect={loc => set('location', loc)}
      />

      {/* App-themed date range picker (PC / iPad) */}
      {rangeAnchor && form && (
        <DateRangePicker
          anchorRect={rangeAnchor}
          startDate={form.date}
          endDate={form.endDate || form.date}
          onClose={() => setRangeAnchor(null)}
          onApply={(start, end) => {
            setForm(f => f ? { ...f, date: start, endDate: end } : f)
            setRangeAnchor(null)
          }}
        />
      )}
    </>
  )
}
