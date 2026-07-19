import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GCAL_API  = 'https://www.googleapis.com/calendar/v3'

// ── Input validation helpers ─────────────────────────────────────────────────

const VALID_ACTIONS_GET  = new Set(['calendars', 'events', 'event'])
const VALID_ACTIONS_POST = new Set(['create', 'update', 'delete', 'move'])

// Google Calendar event/calendar IDs are alphanumeric + a small set of chars
const SAFE_ID_RE     = /^[a-zA-Z0-9_@.\-]{1,256}$/
// ISO 8601 datetime (Google uses RFC 3339 subset)
const ISO_DATE_RE    = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?(\.\d+)?(Z|[+-]\d{2}:?\d{2})?)?$/

function isSafeId(v: unknown): v is string {
  return typeof v === 'string' && SAFE_ID_RE.test(v)
}
function isIsoDate(v: unknown): v is string {
  return typeof v === 'string' && ISO_DATE_RE.test(v)
}

// ── Token management ─────────────────────────────────────────────────────────

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const res  = await fetch(TOKEN_URL, {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body:    new URLSearchParams({
      grant_type:    'refresh_token',
      refresh_token: refreshToken,
      client_id:     process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  })
  const json = await res.json() as { access_token?: string; error?: string }
  if (!json.access_token) {
    console.error('[calendar] token refresh failed:', json.error)
    throw new Error('token_refresh_failed')
  }
  return json.access_token
}

// Fetch and validate the caller's refresh token from their profile.
async function getCallerToken(supabase: Awaited<ReturnType<typeof createClient>>, userId: string): Promise<string | null> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('google_refresh_token')
    .eq('id', userId)
    .single()
  return (profile?.google_refresh_token as string | null) ?? null
}

// ── GET: list calendars or fetch events ─────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (!action || !VALID_ACTIONS_GET.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const refreshToken = await getCallerToken(supabase, user.id)
    if (!refreshToken) {
      return NextResponse.json({ error: 'No Google Calendar access. Sign out and back in to grant calendar permissions.' }, { status: 403 })
    }

    const token   = await refreshAccessToken(refreshToken)
    const headers = { Authorization: `Bearer ${token}` }

    if (action === 'calendars') {
      const res  = await fetch(`${GCAL_API}/users/me/calendarList?minAccessRole=reader`, { headers })
      const json = await res.json() as { items?: unknown[]; error?: unknown }
      if (!res.ok) {
        console.error('[calendar GET calendars] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to fetch calendar list' }, { status: 502 })
      }
      return NextResponse.json({ items: json.items ?? [] })
    }

    // action === 'event' — fetch one event by id (used to read a recurring
    // master's RRULE + DTSTART, which expanded instances don't carry)
    if (action === 'event') {
      const calendarId = searchParams.get('calendarId') ?? 'primary'
      const eventId    = searchParams.get('eventId')
      if (calendarId !== 'primary' && !isSafeId(calendarId)) {
        return NextResponse.json({ error: 'Invalid calendarId' }, { status: 400 })
      }
      if (!isSafeId(eventId)) {
        return NextResponse.json({ error: 'Invalid or missing eventId' }, { status: 400 })
      }
      const res  = await fetch(
        `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        { headers },
      )
      const json = await res.json() as { error?: unknown }
      if (!res.ok) {
        console.error('[calendar GET event] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to fetch event' }, { status: 502 })
      }
      return NextResponse.json(json)
    }

    // action === 'events'
    const calendarId = searchParams.get('calendarId') ?? 'primary'
    const timeMin    = searchParams.get('timeMin')
    const timeMax    = searchParams.get('timeMax')

    if (calendarId !== 'primary' && !isSafeId(calendarId)) {
      return NextResponse.json({ error: 'Invalid calendarId' }, { status: 400 })
    }
    if (timeMin && !isIsoDate(timeMin)) {
      return NextResponse.json({ error: 'Invalid timeMin' }, { status: 400 })
    }
    if (timeMax && !isIsoDate(timeMax)) {
      return NextResponse.json({ error: 'Invalid timeMax' }, { status: 400 })
    }

    const url = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events`
              + `?timeMin=${encodeURIComponent(timeMin ?? '')}`
              + `&timeMax=${encodeURIComponent(timeMax ?? '')}`
              + `&singleEvents=true&orderBy=startTime&maxResults=250`
    const res  = await fetch(url, { headers })
    const json = await res.json()
    if (!res.ok) {
      console.error('[calendar GET events] upstream error:', json.error)
      return NextResponse.json({ error: 'Failed to fetch events' }, { status: 502 })
    }
    return NextResponse.json(json)

  } catch (err) {
    console.error('[calendar GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ── POST: create / update / delete ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    let body: { action?: unknown; event?: unknown; eventId?: unknown; calendarId?: unknown; destination?: unknown; patch?: unknown }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
    }

    const { action, event, eventId, calendarId, destination, patch } = body

    if (typeof action !== 'string' || !VALID_ACTIONS_POST.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    // eventId required for update/delete/move
    if ((action === 'update' || action === 'delete' || action === 'move') && !isSafeId(eventId)) {
      return NextResponse.json({ error: 'Invalid or missing eventId' }, { status: 400 })
    }

    // calendarId must be safe if provided
    const calId = typeof calendarId === 'string' && calendarId ? calendarId : 'primary'
    if (calId !== 'primary' && !isSafeId(calId)) {
      return NextResponse.json({ error: 'Invalid calendarId' }, { status: 400 })
    }

    const refreshToken = await getCallerToken(supabase, user.id)
    if (!refreshToken) {
      return NextResponse.json(
        { error: 'No Google Calendar access. Sign out and back in to grant calendar permissions.' },
        { status: 403 },
      )
    }

    const token   = await refreshAccessToken(refreshToken)
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    const calBase = `${GCAL_API}/calendars/${encodeURIComponent(calId)}/events`

    if (action === 'create') {
      if (!event || typeof event !== 'object') {
        return NextResponse.json({ error: 'Missing event body' }, { status: 400 })
      }
      const res  = await fetch(calBase, { method: 'POST', headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) {
        console.error('[calendar POST create] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to create event' }, { status: 502 })
      }
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'update') {
      if (!event || typeof event !== 'object') {
        return NextResponse.json({ error: 'Missing event body' }, { status: 400 })
      }
      // PATCH merges (preserves a series' recurrence when editing all instances); PUT is a full replace.
      const method = patch === true ? 'PATCH' : 'PUT'
      const res  = await fetch(`${calBase}/${eventId as string}`, { method, headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) {
        console.error('[calendar POST update] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to update event' }, { status: 502 })
      }
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'delete') {
      const res = await fetch(`${calBase}/${eventId as string}`, { method: 'DELETE', headers })
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        console.error('[calendar POST delete] upstream status:', res.status)
        return NextResponse.json({ error: 'Failed to delete event' }, { status: 502 })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'move') {
      const destId = typeof destination === 'string' && destination ? destination : 'primary'
      if (destId !== 'primary' && !isSafeId(destId)) {
        return NextResponse.json({ error: 'Invalid destination' }, { status: 400 })
      }
      const res  = await fetch(`${calBase}/${eventId as string}/move?destination=${encodeURIComponent(destId)}`, { method: 'POST', headers })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) {
        console.error('[calendar POST move] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to move event' }, { status: 502 })
      }
      return NextResponse.json({ googleEventId: json.id })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err) {
    console.error('[calendar POST]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
