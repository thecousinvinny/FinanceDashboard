// Client-side helpers for calling the /api/calendar proxy route.
// All Google API calls stay server-side; these just POST instructions.

export interface GCalEvent {
  summary:      string
  description?: string
  location?:    string
  start:        { date: string } | { dateTime: string; timeZone: string }
  end:          { date: string } | { dateTime: string; timeZone: string }
  recurrence?:  string[]   // e.g. ['RRULE:FREQ=WEEKLY;BYDAY=FR']
}

// Which occurrences an edit/delete on a recurring event applies to.
// There is deliberately no 'all' — choosing 'following' on the first
// occurrence is already "all events", so a third option would be redundant.
export type RecurScope = 'this' | 'following'

export interface GCalFetchedEvent {
  id:          string
  summary?:    string
  recurrence?: string[]
  start:       { date?: string; dateTime?: string }
  end:         { date?: string; dateTime?: string }
}

// Fetch a single event by id. Expanded instances (singleEvents=true) don't
// carry `recurrence` — only the master does — so editing a series' repeat rule
// requires fetching the master via its recurringEventId.
export async function getCalEvent(eventId: string, calendarId?: string): Promise<GCalFetchedEvent | null> {
  try {
    const res = await fetch(
      `/api/calendar?action=event&eventId=${encodeURIComponent(eventId)}`
      + `&calendarId=${encodeURIComponent(calendarId ?? 'primary')}`,
    )
    if (!res.ok) return null
    const json = await res.json() as GCalFetchedEvent & { error?: string }
    return json.error ? null : json
  } catch { return null }
}

// Pull the bare RRULE (no "RRULE:" prefix) out of a fetched event's recurrence array.
export function extractRRule(ev: GCalFetchedEvent | null): string {
  const line = ev?.recurrence?.find(r => r.startsWith('RRULE:'))
  return line ? line.slice(6) : ''
}

// Cap a series so it ends immediately before `beforeDate` (a local YYYY-MM-DD).
// Strips any existing UNTIL/COUNT first — they're mutually exclusive with the
// new UNTIL and Google rejects a rule carrying both.
export function rruleUntilBefore(rule: string, beforeDate: string, allDay: boolean): string {
  const parts = rule.split(';').filter(p => p && !/^(UNTIL|COUNT)=/i.test(p))
  const [y, m, d] = beforeDate.split('-').map(Number)
  let until: string
  if (allDay) {
    // DATE form: the day before the split point
    const prev = new Date(y, m - 1, d - 1)
    until = `${prev.getFullYear()}${String(prev.getMonth() + 1).padStart(2, '0')}${String(prev.getDate()).padStart(2, '0')}`
  } else {
    // UTC datetime form: one second before local midnight of the split point,
    // so every occurrence strictly earlier than the split instance is kept.
    const cut = new Date(y, m - 1, d, 0, 0, 0)
    cut.setSeconds(cut.getSeconds() - 1)
    until = cut.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  }
  return [...parts, `UNTIL=${until}`].join(';')
}

export async function createCalEvent(event: GCalEvent, calendarId?: string): Promise<string | null> {
  try {
    const res  = await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create', event, calendarId }),
    })
    const json = await res.json()
    return (json.googleEventId as string) ?? null
  } catch { return null }
}

export async function updateCalEvent(
  eventId: string,
  event: Partial<GCalEvent>,
  calendarId?: string,
  opts?: { patch?: boolean },   // patch = merge (preserves recurrence on a series); default is full replace
): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'update', eventId, event, calendarId, patch: opts?.patch ?? false }),
    })
  } catch { /* best-effort */ }
}

export async function moveCalEvent(eventId: string, fromCalendarId: string, toCalendarId: string): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'move', eventId, calendarId: fromCalendarId, destination: toCalendarId }),
    })
  } catch { /* best-effort */ }
}

export async function deleteCalEvent(eventId: string, calendarId?: string): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', eventId, calendarId }),
    })
  } catch { /* best-effort */ }
}

// Build an all-day GCalEvent from a date string and metadata.
export function allDayEvent(summary: string, date: string, description?: string, location?: string): GCalEvent {
  return { summary, description, location, start: { date }, end: { date } }
}

// Build a timed GCalEvent (times as "HH:MM", tz = IANA name).
// Handles cross-midnight: if endTime < startTime, end is placed on the next calendar day.
export function timedEvent(
  summary:   string,
  date:      string,
  startTime: string,
  endTime:   string,
  opts:      { description?: string; location?: string; timeZone?: string } = {},
): GCalEvent {
  const tz = opts.timeZone ?? 'America/Los_Angeles'
  let endDate = date
  if (endTime && startTime && endTime < startTime) {
    const [y, m, d] = date.split('-').map(Number)
    const next = new Date(y, m - 1, d + 1)
    endDate = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-${String(next.getDate()).padStart(2, '0')}`
  }
  return {
    summary,
    description: opts.description,
    location:    opts.location,
    start: { dateTime: `${date}T${startTime}:00`,   timeZone: tz },
    end:   { dateTime: `${endDate}T${endTime}:00`,  timeZone: tz },
  }
}
