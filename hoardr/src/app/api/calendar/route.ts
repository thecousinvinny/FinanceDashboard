import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TOKEN_URL  = 'https://oauth2.googleapis.com/token'
const CAL_BASE   = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
const GCAL_API   = 'https://www.googleapis.com/calendar/v3'

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
  if (!json.access_token) throw new Error(`Token refresh failed: ${json.error ?? 'unknown'}`)
  return json.access_token
}

// ── GET: list calendars or fetch events ─────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const action = searchParams.get('action')

    const { data: profile } = await supabase
      .from('profiles').select('google_refresh_token').eq('id', user.id).single()

    if (!profile?.google_refresh_token) {
      return NextResponse.json({ error: 'No token' }, { status: 403 })
    }

    const token   = await refreshAccessToken(profile.google_refresh_token as string)
    const headers = { Authorization: `Bearer ${token}` }

    if (action === 'calendars') {
      const res  = await fetch(`${GCAL_API}/users/me/calendarList?minAccessRole=reader`, { headers })
      const json = await res.json()
      return NextResponse.json(json)
    }

    if (action === 'events') {
      const calendarId = searchParams.get('calendarId') ?? 'primary'
      const timeMin    = searchParams.get('timeMin')
      const timeMax    = searchParams.get('timeMax')
      const url        = `${GCAL_API}/calendars/${encodeURIComponent(calendarId)}/events`
                       + `?timeMin=${encodeURIComponent(timeMin ?? '')}`
                       + `&timeMax=${encodeURIComponent(timeMax ?? '')}`
                       + `&singleEvents=true&orderBy=startTime&maxResults=250`
      const res  = await fetch(url, { headers })
      const json = await res.json()
      return NextResponse.json(json)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err) {
    console.error('[calendar GET]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

// ── POST: create / update / delete ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action, event, eventId, calendarId } = await req.json() as {
      action:      'create' | 'update' | 'delete'
      event?:      Record<string, unknown>
      eventId?:    string
      calendarId?: string
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('google_refresh_token')
      .eq('id', user.id)
      .single()

    if (!profile?.google_refresh_token) {
      return NextResponse.json(
        { error: 'No Google Calendar access. Sign out and back in to grant calendar permissions.' },
        { status: 403 },
      )
    }

    const token   = await refreshAccessToken(profile.google_refresh_token as string)
    const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

    if (action === 'create') {
      const calBase = `${GCAL_API}/calendars/${encodeURIComponent(calendarId ?? 'primary')}/events`
      const res  = await fetch(calBase, { method: 'POST', headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status })
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'update' && eventId) {
      const calBase = `${GCAL_API}/calendars/${encodeURIComponent(calendarId ?? 'primary')}/events`
      const res  = await fetch(`${calBase}/${eventId}`, { method: 'PUT', headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status })
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'delete' && eventId) {
      const calBase = `${GCAL_API}/calendars/${encodeURIComponent(calendarId ?? 'primary')}/events`
      const res = await fetch(`${calBase}/${eventId}`, { method: 'DELETE', headers })
      if (!res.ok && res.status !== 404 && res.status !== 410) {
        return NextResponse.json({ error: 'Delete failed' }, { status: res.status })
      }
      return NextResponse.json({ success: true })
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })

  } catch (err) {
    console.error('[calendar route]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
