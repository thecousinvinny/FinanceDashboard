import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const TOKEN_URL = 'https://oauth2.googleapis.com/token'
const CAL_BASE  = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { action, event, eventId } = await req.json() as {
      action:   'create' | 'update' | 'delete'
      event?:   Record<string, unknown>
      eventId?: string
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
      const res  = await fetch(CAL_BASE, { method: 'POST', headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status })
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'update' && eventId) {
      const res  = await fetch(`${CAL_BASE}/${eventId}`, { method: 'PUT', headers, body: JSON.stringify(event) })
      const json = await res.json() as { id?: string; error?: unknown }
      if (!res.ok) return NextResponse.json({ error: json.error }, { status: res.status })
      return NextResponse.json({ googleEventId: json.id })
    }

    if (action === 'delete' && eventId) {
      const res = await fetch(`${CAL_BASE}/${eventId}`, { method: 'DELETE', headers })
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
