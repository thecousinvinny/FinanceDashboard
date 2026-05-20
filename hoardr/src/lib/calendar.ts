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

export async function updateCalEvent(eventId: string, event: GCalEvent, calendarId?: string): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'update', eventId, event, calendarId }),
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
