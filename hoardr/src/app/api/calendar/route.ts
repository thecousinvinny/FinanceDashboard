import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient, type User } from '@supabase/supabase-js'

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

// Surface Google's own reason ("Invalid recurrence rule", "The specified time
// range is empty", …) instead of a generic string — a bad RRULE is otherwise
// indistinguishable from a network failure on the client.
function gcalMessage(error: { message?: string } | undefined, fallback: string): string {
  const msg = error?.message
  return typeof msg === 'string' && msg ? `${fallback}: ${msg}` : fallback
}

// ── Caller auth ─────────────────────────────────────────────────────────────

// Authenticate from the Bearer access token the client sends (calFetch), not
// the session cookie. Reading the cookie session let this route rotate the
// Supabase refresh token; if the response carrying the new cookie was lost
// (iOS suspending the PWA mid-request) the browser kept the revoked token and
// the session died on its next use. Here nothing is ever refreshed — an
// expired token is simply a 401, and the browser refreshes its own.
async function authFromRequest(req: NextRequest): Promise<{ supabase: SupabaseClient; user: User } | null> {
  const jwt = req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1]
  if (!jwt) return null
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },   // RLS queries run as the caller
      auth:   { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    },
  )
  const { data: { user } } = await supabase.auth.getUser(jwt)
  return user ? { supabase, user } : null
}

// ── Token management ─────────────────────────────────────────────────────────

// Google access tokens live ~1h. Minting a new one on every request added a
// full round trip to Google before every calendar load and save; reuse them
// while this server instance is warm. In-flight refreshes are shared so a
// burst of parallel requests (one per calendar) mints a single token.
const tokenCache = new Map<string, { token: string; exp: number }>()
const tokenInFlight = new Map<string, Promise<string>>()

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const hit = tokenCache.get(refreshToken)
  if (hit && hit.exp > Date.now()) return hit.token
  const pending = tokenInFlight.get(refreshToken)
  if (pending) return pending
  const p = mintAccessToken(refreshToken)
    .then(({ token, expiresIn }) => {
      // 5 min margin so a token never expires mid-request
      tokenCache.set(refreshToken, { token, exp: Date.now() + (expiresIn - 300) * 1000 })
      return token
    })
    .finally(() => tokenInFlight.delete(refreshToken))
  tokenInFlight.set(refreshToken, p)
  return p
}

async function mintAccessToken(refreshToken: string): Promise<{ token: string; expiresIn: number }> {
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
  const json = await res.json() as { access_token?: string; expires_in?: number; error?: string }
  if (!json.access_token) {
    console.error('[calendar] token refresh failed:', json.error)
    throw new Error('token_refresh_failed')
  }
  return { token: json.access_token, expiresIn: json.expires_in ?? 3600 }
}

// Fetch and validate the caller's refresh token from their profile.
async function getCallerToken(supabase: SupabaseClient, userId: string): Promise<string | null> {
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
    const auth = await authFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    if (!action || !VALID_ACTIONS_GET.has(action)) {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

    const refreshToken = await getCallerToken(supabase, user.id)
    if (!refreshToken) {
      return NextResponse.json({ error: 'No Google Calendar access. Tap “Connect Google Calendar” in Settings to grant access.' }, { status: 403 })
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

    // timeZone: report every dateTime in the app's zone — the client reads the
    // wall-clock time straight off the string. Page through results: Google
    // caps a page, and a wide scrolled range silently lost everything past it.
    const base = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events`
              + `?timeMin=${encodeURIComponent(timeMin ?? '')}`
              + `&timeMax=${encodeURIComponent(timeMax ?? '')}`
              + `&singleEvents=true&orderBy=startTime&maxResults=2500`
              + `&timeZone=${encodeURIComponent('America/Los_Angeles')}`
    const items: unknown[] = []
    let pageToken: string | undefined
    for (let page = 0; page < 10; page++) {
      const res  = await fetch(pageToken ? `${base}&pageToken=${encodeURIComponent(pageToken)}` : base, { headers })
      const json = await res.json() as { items?: unknown[]; nextPageToken?: string; error?: unknown }
      if (!res.ok) {
        console.error('[calendar GET events] upstream error:', json.error)
        return NextResponse.json({ error: 'Failed to fetch events' }, { status: 502 })
      }
      items.push(...(json.items ?? []))
      pageToken = json.nextPageToken
      if (!pageToken) break
    }
    return NextResponse.json({ items })

  } catch (err) {
    // A stale/revoked refresh token can no longer mint an access token — tell the
    // user to reconnect rather than surfacing a generic error.
    if (err instanceof Error && err.message === 'token_refresh_failed') {
      return NextResponse.json({ error: 'Google Calendar access expired. Tap “Connect Google Calendar” in Settings to reconnect.' }, { status: 403 })
    }
    console.error('[calendar GET]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}

// ── POST: create / update / delete ──────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const auth = await authFromRequest(req)
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    const { supabase, user } = auth

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
        { error: 'No Google Calendar access. Tap “Connect Google Calendar” in Settings to grant access.' },
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
      const json = await res.json() as { id?: string; error?: { message?: string } }
      if (!res.ok) {
        console.error('[calendar POST create] upstream error:', json.error)
        return NextResponse.json({ error: gcalMessage(json.error, 'Failed to create event') }, { status: 502 })
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
      const json = await res.json() as { id?: string; error?: { message?: string } }
      if (!res.ok) {
        console.error('[calendar POST update] upstream error:', json.error)
        return NextResponse.json({ error: gcalMessage(json.error, 'Failed to update event') }, { status: 502 })
      }
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'delete') {
      const res = await fetch(`${calBase}/${eventId as string}`, { method: 'DELETE', headers })
      // 404/410 mean it's already gone — that's the desired end state, not a failure.
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        const json = await res.json().catch(() => ({})) as { error?: { message?: string } }
        console.error('[calendar POST delete] upstream status:', res.status, json.error)
        return NextResponse.json({ error: gcalMessage(json.error, 'Failed to delete event') }, { status: 502 })
      }
      return NextResponse.json({ success: true })
    }

    if (action === 'move') {
      const destId = typeof destination === 'string' && destination ? destination : 'primary'
      if (destId !== 'primary' && !isSafeId(destId)) {
        return NextResponse.json({ error: 'Invalid destination' }, { status: 400 })
      }
      const res  = await fetch(`${calBase}/${eventId as string}/move?destination=${encodeURIComponent(destId)}`, { method: 'POST', headers })
      const json = await res.json() as { id?: string; error?: { message?: string } }
      if (!res.ok) {
        console.error('[calendar POST move] upstream error:', json.error)
        return NextResponse.json({ error: gcalMessage(json.error, 'Failed to move event') }, { status: 502 })
      }
      return NextResponse.json({ googleEventId: json.id })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err) {
    if (err instanceof Error && err.message === 'token_refresh_failed') {
      return NextResponse.json({ error: 'Google Calendar access expired. Tap “Connect Google Calendar” in Settings to reconnect.' }, { status: 403 })
    }
    console.error('[calendar POST]', err)
    return NextResponse.json({ error: 'Something went wrong' }, { status: 500 })
  }
}
