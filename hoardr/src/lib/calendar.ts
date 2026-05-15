// Client-side helpers for calling the /api/calendar proxy route.
// All Google API calls stay server-side; these just POST instructions.

export interface GCalEvent {
  summary:      string
  description?: string
  location?:    string
  start:        { date: string } | { dateTime: string; timeZone: string }
  end:          { date: string } | { dateTime: string; timeZone: string }
}

export async function createCalEvent(event: GCalEvent): Promise<string | null> {
  try {
    const res  = await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'create', event }),
    })
    const json = await res.json()
    return (json.googleEventId as string) ?? null
  } catch { return null }
}

export async function updateCalEvent(eventId: string, event: GCalEvent): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'update', eventId, event }),
    })
  } catch { /* best-effort */ }
}

export async function deleteCalEvent(eventId: string): Promise<void> {
  try {
    await fetch('/api/calendar', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ action: 'delete', eventId }),
    })
  } catch { /* best-effort */ }
}

// Build an all-day GCalEvent from a date string and metadata.
export function allDayEvent(summary: string, date: string, description?: string, location?: string): GCalEvent {
  return { summary, description, location, start: { date }, end: { date } }
}

// Build a timed GCalEvent (times as "HH:MM", tz = IANA name).
export function timedEvent(
  summary:   string,
  date:      string,
  startTime: string,
  endTime:   string,
  opts:      { description?: string; location?: string; timeZone?: string } = {},
): GCalEvent {
  const tz = opts.timeZone ?? 'America/Los_Angeles'
  return {
    summary,
    description: opts.description,
    location:    opts.location,
    start: { dateTime: `${date}T${startTime}:00`, timeZone: tz },
    end:   { dateTime: `${date}T${endTime}:00`,   timeZone: tz },
  }
}
