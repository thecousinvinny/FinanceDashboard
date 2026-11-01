'use client'

import type { LucideIcon } from 'lucide-react'
import { CalendarCheck, Cloud, MapPin, CloudSun } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { calFetch } from '@/lib/calendar'
import { connectGoogleCalendar } from '@/lib/gcal-connect'

/**
 * Every outside service the app talks to, for Settings → Connections. Each
 * one checks itself live and, when something's wrong, offers the one action
 * that fixes it. **To add a service, add an entry to CONNECTIONS** — the
 * Settings section renders whatever is here.
 */
export type ConnState = 'ok' | 'action' | 'off' | 'error'

export interface ConnStatus {
  state:   ConnState
  /** Short line under the name: "3 calendars", "Access expired", … */
  detail:  string
  /** The fix, when there is one. `run` may leave the app (OAuth). */
  action?: { label: string; run: () => Promise<void> | void }
}

export interface Connection {
  id:          string
  name:        string
  icon:        LucideIcon
  /** What it's used for, shown when you open the row's details */
  purpose:     string
  check:       (ctx: { email: string | null }) => Promise<ConnStatus>
}

const offline = (): ConnStatus | null =>
  typeof navigator !== 'undefined' && !navigator.onLine
    ? { state: 'error', detail: 'You’re offline' }
    : null

export const CONNECTIONS: Connection[] = [
  {
    id: 'hoardr-cloud',
    name: 'Hoardr account',
    icon: Cloud,
    purpose: 'Your data and settings, synced across every device (Supabase).',
    async check({ email }) {
      const off = offline(); if (off) return off
      const supabase = createClient()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) return {
        state: 'action', detail: 'Signed out on this device',
        action: { label: 'Sign in', run: () => { location.href = '/login' } },
      }
      const { error } = await supabase.from('profiles').select('id').eq('id', session.user.id).maybeSingle()
      if (error) return {
        state: 'error', detail: 'Can’t reach your data',
        action: { label: 'Sign in again', run: () => connectGoogleCalendar(email ?? session.user.email) },
      }
      return { state: 'ok', detail: session.user.email ?? 'Signed in' }
    },
  },
  {
    id: 'google-calendar',
    name: 'Google Calendar',
    icon: CalendarCheck,
    purpose: 'Shows, creates and edits your Google events in the calendar and the daily brief.',
    async check({ email }) {
      const off = offline(); if (off) return off
      const reconnect = { label: 'Reconnect', run: () => connectGoogleCalendar(email) }
      try {
        const r = await calFetch('/api/calendar?action=calendars')
        if (r.status === 403) return { state: 'action', detail: 'Access expired — reconnect to sync events', action: reconnect }
        if (r.status === 401) return { state: 'action', detail: 'Session expired', action: reconnect }
        if (!r.ok) return { state: 'error', detail: 'Google didn’t respond — try again', action: reconnect }
        const d = await r.json() as { items?: unknown[] }
        const n = d.items?.length ?? 0
        return { state: 'ok', detail: `${n} calendar${n === 1 ? '' : 's'}`, action: { label: 'Reconnect', run: reconnect.run } }
      } catch {
        return { state: 'error', detail: 'Couldn’t check — try again' }
      }
    },
  },
  {
    id: 'google-places',
    name: 'Google Places',
    icon: MapPin,
    purpose: 'Address suggestions when you add a location to an event.',
    async check() {
      return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
        ? { state: 'ok', detail: 'Address search on' }
        : { state: 'off', detail: 'Not set up — locations are typed by hand' }
    },
  },
  {
    id: 'weather',
    name: 'Weather',
    icon: CloudSun,
    purpose: 'The forecast on calendar days (Open-Meteo), using your location.',
    async check() {
      const ask = {
        label: 'Allow',
        run: () => new Promise<void>(res => navigator.geolocation.getCurrentPosition(() => res(), () => res())),
      }
      if (!('geolocation' in navigator)) return { state: 'off', detail: 'Location isn’t available here' }
      try {
        const p = await navigator.permissions?.query({ name: 'geolocation' as PermissionName })
        if (p?.state === 'denied') return { state: 'action', detail: 'Location blocked — allow it in your browser’s site settings' }
        if (p?.state === 'prompt') return { state: 'action', detail: 'Needs your location', action: ask }
      } catch { /* Safari without the Permissions API: fall through */ }
      return { state: 'ok', detail: 'Forecast on' }
    },
  },
]
