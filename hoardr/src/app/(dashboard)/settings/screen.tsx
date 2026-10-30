'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, CreditCard, LogOut, CalendarDays, Tag, Settings2, Palette, CalendarCheck, Smartphone, Monitor, Sunrise } from 'lucide-react'
import { showGreeting } from '@/components/home/GreetingOverlay'
import { createClient } from '@/lib/supabase/client'
import { connectGoogleCalendar } from '@/lib/gcal-connect'
import { showToast } from '@/lib/toast'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { SemanticColorSheet } from '@/components/ui/SemanticColorSheet'
import { getWeekStartsMonday, setWeekStartsMonday } from '@/lib/week-start'
import { applySemanticColors } from '@/lib/semantic-colors'
import { calFetch } from '@/lib/calendar'
import { useOnScreenReturn, useScreenReady } from '@/lib/tab-nav'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented } from '@/components/ui/Form'

const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'income'], googleCalendarIds: [] }
const WEEK_START = ['Sun', 'Mon'] as const

interface SettingsCard { id: string; name: string; last4: string | null }

interface AuthSession {
  id:           string
  created_at:   string
  updated_at:   string
  refreshed_at: string | null
  not_after:    string | null
  user_agent:   string | null
  ip:           string | null
  is_current:   boolean
}

// Friendly device label from a user-agent string, e.g. "Chrome · Windows".
function deviceLabel(ua: string | null): { os: string; browser: string; isPhone: boolean } {
  const s = ua ?? ''
  const isPhone = /iPhone|iPad|Android/i.test(s)
  const os =
    /iPhone/i.test(s)        ? 'iPhone'
    : /iPad/i.test(s)        ? 'iPad'
    : /Android/i.test(s)     ? 'Android'
    : /Windows/i.test(s)     ? 'Windows'
    : /Mac OS X|Macintosh/i.test(s) ? 'Mac'
    : /Linux/i.test(s)       ? 'Linux'
    : 'Unknown device'
  const browser =
    /Edg\//i.test(s)         ? 'Edge'
    : /OPR\/|Opera/i.test(s) ? 'Opera'
    : /Chrome\//i.test(s) && !/Edg\//i.test(s) ? 'Chrome'
    : /Firefox\//i.test(s)   ? 'Firefox'
    : /Safari\//i.test(s)    ? 'Safari'
    : 'Browser'
  return { os, browser, isPhone }
}

function relTime(ts: string | null): string {
  if (!ts) return 'unknown'
  // refreshed_at has no timezone suffix; treat it as UTC to match Postgres.
  const iso = /[Z+]/.test(ts) ? ts : ts.replace(' ', 'T') + 'Z'
  const then = new Date(iso).getTime()
  if (isNaN(then)) return 'unknown'
  const mins = Math.max(0, Math.round((Date.now() - then) / 60000))
  if (mins < 1)    return 'just now'
  if (mins < 60)   return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24)    return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30)   return `${days}d ago`
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export default function SettingsPage() {
  const router    = useRouter()
  const supabase  = useMemo(() => createClient(), [])

  const [theme,                setTheme]                = useState<Theme>('obsidian')
  const [email,                setEmail]                = useState<string | null>(null)
  const [wsMon,                setWsMon]                = useState(false)
  const [calOpen,              setCalOpen]              = useState(false)
  const [prefs,                setPrefs]                = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,           setGoogleCals]           = useState<GCalendar[]>([])
  const [calsLoading,          setCalsLoading]          = useState(false)
  const [calsError,            setCalsError]            = useState(false)
  const [defaultCardOpen,      setDefaultCardOpen]      = useState(false)
  const [defaultCardId,        setDefaultCardId]        = useState<string | null>(null)
  const [defaultCardName,      setDefaultCardName]      = useState<string | null>(null)
  const [settingsCards,        setSettingsCards]        = useState<SettingsCard[]>([])
  const [settingsCardsLoading, setSettingsCardsLoading] = useState(false)
  const [semColorsOpen,        setSemColorsOpen]        = useState(false)
  const [sessions,             setSessions]             = useState<AuthSession[]>([])
  const [sessionsLoading,      setSessionsLoading]      = useState(true)
  const [revokingId,           setRevokingId]           = useState<string | null>(null)

  useEffect(() => {
    setTheme(readTheme())
    setWsMon(getWeekStartsMonday())
    applySemanticColors()
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? null) })
  }, [supabase])

  // Load calendar prefs once
  useEffect(() => {
    supabase.from('profiles').select('calendar_prefs').single().then(({ data }) => {
      if (data?.calendar_prefs) setPrefs(data.calendar_prefs as CalPrefs)
    })
  }, [supabase])

  // Load current default card name on mount
  useEffect(() => {
    supabase.from('cards').select('id, name').eq('is_default', true).single()
      .then(({ data }) => { if (data) { setDefaultCardId(data.id as string); setDefaultCardName(data.name as string) } })
  }, [supabase])

  // Lazily load all cards when the picker opens
  useEffect(() => {
    if (!defaultCardOpen || settingsCards.length > 0) return
    setSettingsCardsLoading(true)
    supabase.from('cards').select('id, name, last4').order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      .then(({ data }) => {
        setSettingsCards((data ?? []) as SettingsCard[])
        setSettingsCardsLoading(false)
      })
  }, [defaultCardOpen, settingsCards.length, supabase])

  // Lazily load Google calendars when the sheet opens
  useEffect(() => {
    if (!calOpen || googleCals.length > 0) return
    setCalsLoading(true)
    setCalsError(false)
    calFetch('/api/calendar?action=calendars')
      .then(async r => {
        const d = await r.json() as { items?: unknown[]; error?: string }
        if (!r.ok || d.error) throw new Error(d.error ?? 'no_token')
        setGoogleCals((d.items ?? []) as typeof googleCals)
      })
      .catch(() => setCalsError(true))
      .finally(() => setCalsLoading(false))
  }, [calOpen, googleCals.length])

  function selectTheme(t: Theme) { setTheme(t); applyTheme(t) }

  function selectWsMon(v: boolean) { setWsMon(v); setWeekStartsMonday(v) }

  async function handleSetDefaultCard(cardId: string) {
    const card = settingsCards.find(c => c.id === cardId)
    setDefaultCardId(cardId)
    setDefaultCardName(card?.name ?? null)
    setDefaultCardOpen(false)
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('cards').update({ is_default: false }).eq('user_id', data.user.id)
    await supabase.from('cards').update({ is_default: true  }).eq('id', cardId)
  }

  async function savePrefs(p: CalPrefs) {
    setPrefs(p)
    const { data } = await supabase.auth.getUser()
    if (data.user?.id) {
      await supabase.from('profiles').update({ calendar_prefs: p }).eq('id', data.user.id)
    }
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  // Re-grant Google Calendar access without signing out (see gcal-connect.ts)
  async function reconnectCalendar() {
    await connectGoogleCalendar(email)
  }

  async function loadSessions() {
    // "Loading…" only before the first result; a refresh keeps the list up
    if (!sessions.length) setSessionsLoading(true)
    const { data, error } = await supabase.rpc('list_my_sessions')
    if (!error && data) setSessions(data as AuthSession[])
    setSessionsLoading(false)
  }

  useEffect(() => { loadSessions() }, [supabase])  // eslint-disable-line react-hooks/exhaustive-deps
  useOnScreenReturn(loadSessions)
  useScreenReady(true)   // releases the load screen once this screen has its data

  async function revokeSession(s: AuthSession) {
    setRevokingId(s.id)
    const { data, error } = await supabase.rpc('revoke_my_session', { p_session_id: s.id })
    setRevokingId(null)
    if (error || data !== true) { showToast('Could not sign out that device', { type: 'delete' }); return }
    if (s.is_current) {
      // Revoked our own session — send to login.
      await supabase.auth.signOut()
      window.location.href = '/login'
      return
    }
    setSessions(prev => prev.filter(x => x.id !== s.id))
    showToast('Device signed out', { type: 'add' })
  }

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      <div className="mx-auto w-full max-w-[640px] px-4 md:px-6">

        {/* Header */}
        <div className="flex items-center gap-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">Settings</h1>
        </div>

        {/* Account */}
        {email && (
          <FormGroup>
            <FormRow label={
              <span className="flex items-center gap-3 min-w-0">
                <span className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center flex-shrink-0 text-[15px] font-bold text-[#1a1200]">
                  {email.charAt(0).toUpperCase()}
                </span>
                <span className="flex flex-col min-w-0">
                  <span className="text-[16px] font-medium text-ink truncate">{email}</span>
                  <span className="text-[13px] text-ink-muted">Signed in with Google</span>
                </span>
              </span>
            } />
          </FormGroup>
        )}

        {/* Appearance */}
        <FormGroup header="Appearance" plain>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            {THEMES.map(t => {
              const active = theme === t.id
              const [base, surface, accent] = t.swatches
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => selectTheme(t.id)}
                  className="rounded-[14px] p-2 text-left bg-bg-surface transition-shadow"
                  style={{ boxShadow: active ? '0 0 0 2px #D4AF37' : '0 0 0 0.5px rgb(var(--rgb-ink) / 0.1)' }}
                >
                  {/* Mini preview of the theme */}
                  <div className="h-[58px] rounded-[9px] p-2 flex flex-col gap-1.5 overflow-hidden" style={{ background: base, boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.08)' }}>
                    <div className="h-[18px] rounded-[5px]" style={{ background: surface, boxShadow: '0 0 0 0.5px rgba(0,0,0,0.06)' }} />
                    <div className="h-[6px] w-1/2 rounded-full" style={{ background: accent }} />
                  </div>
                  <div className="flex items-center justify-between gap-1 px-0.5 pt-2 pb-0.5">
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold text-ink leading-tight truncate">{t.label}</p>
                      <p className="text-[11px] text-ink-muted leading-tight">{t.subtitle}</p>
                    </div>
                    {active && <Check size={15} strokeWidth={2.5} className="text-gold flex-shrink-0" />}
                  </div>
                </button>
              )
            })}
          </div>
        </FormGroup>

        <FormGroup footer="The daily brief opens once per launch. Preview shows it now. Accent colors are used for income, expenses and subscriptions throughout the app.">
          <FormRow icon={Sunrise} label="Preview daily brief" chevron onClick={showGreeting} />
          <FormRow icon={Palette} label="Accent colors" chevron onClick={() => setSemColorsOpen(true)}>
            <span className="flex items-center gap-1.5">
              {['var(--sem-income)', 'var(--sem-expense)', 'var(--sem-sub)'].map(c => (
                <span key={c} className="w-3.5 h-3.5 rounded-full" style={{ background: c, boxShadow: '0 0 0 0.5px rgb(var(--rgb-ink) / 0.15)' }} />
              ))}
            </span>
          </FormRow>
        </FormGroup>

        {/* Money */}
        <FormGroup header="Money">
          <FormRow icon={Tag} label="Categories" chevron onClick={() => router.push('/settings/categories')} />
          <FormRow icon={CreditCard} label="Default card" chevron onClick={() => setDefaultCardOpen(true)}>
            <span className="truncate">{defaultCardName ?? 'None'}</span>
          </FormRow>
          <FormRow icon={Settings2} label="Form defaults" chevron onClick={() => router.push('/settings/defaults')}>
            <span className="truncate">Bank, category, billing</span>
          </FormRow>
        </FormGroup>

        {/* Calendar */}
        <FormGroup header="Calendar" footer="Reconnect if events stop syncing — you stay signed in.">
          <FormRow icon={CalendarDays} label="Calendars & filters" chevron onClick={() => setCalOpen(true)} />
          <FormRow icon={CalendarCheck} label="Connect Google Calendar" chevron onClick={reconnectCalendar} />
          <FormRow label="Week starts on">
            <div className="w-[128px]">
              <Segmented options={WEEK_START} value={wsMon ? 'Mon' : 'Sun'} onChange={v => selectWsMon(v === 'Mon')} />
            </div>
          </FormRow>
        </FormGroup>

        {/* Devices */}
        <FormGroup header="Devices & sessions" footer="Sign out any device you don’t recognize. Your other devices stay signed in.">
          {sessionsLoading ? (
            <FormRow label={<span className="text-ink-muted">Loading…</span>} />
          ) : sessions.length === 0 ? (
            <FormRow label={<span className="text-ink-muted">No sessions</span>} />
          ) : (
            sessions.map(s => {
              const { os, browser, isPhone } = deviceLabel(s.user_agent)
              return (
                <FormRow key={s.id} icon={isPhone ? Smartphone : Monitor} label={
                  <span className="flex flex-col min-w-0">
                    <span className="truncate">{browser} · {os}</span>
                    <span className="text-[13px] text-ink-muted">
                      {s.is_current ? 'This device' : `Active ${relTime(s.refreshed_at ?? s.updated_at)}`}
                    </span>
                  </span>
                }>
                  {!s.is_current && (
                    <button
                      type="button"
                      onClick={() => revokeSession(s)}
                      disabled={revokingId === s.id}
                      className="sheet-nav-btn text-[15px] text-ruby px-1 disabled:opacity-40"
                    >
                      Sign out
                    </button>
                  )}
                </FormRow>
              )
            })
          )}
        </FormGroup>

        {/* Sign out */}
        <FormGroup>
          <FormRow onClick={signOut} label={<span className="flex items-center gap-2 text-ruby"><LogOut size={17} strokeWidth={1.9} />Sign out</span>} />
        </FormGroup>

      </div>
    </div>

      <SemanticColorSheet
        open={semColorsOpen}
        onClose={() => setSemColorsOpen(false)}
      />

      <CalendarSettingsSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        prefs={prefs}
        googleCals={googleCals}
        calsLoading={calsLoading}
        calsError={calsError}
        onSave={savePrefs}
      />

      {/* Default card picker */}
      <Sheet open={defaultCardOpen} onClose={() => setDefaultCardOpen(false)} title="Default Card" cancelLabel="Done">
        <FormGroup footer="New expenses start on this card.">
          {settingsCardsLoading ? (
            <FormRow label={<span className="text-ink-muted">Loading…</span>} />
          ) : settingsCards.length === 0 ? (
            <FormRow label={<span className="text-ink-muted">No cards yet — add one in the In tab</span>} />
          ) : (
            settingsCards.map(card => (
              <FormRow key={card.id} icon={CreditCard} onClick={() => handleSetDefaultCard(card.id)} label={
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{card.name}</span>
                  {card.last4 && <span className="text-[13px] text-ink-muted tabular-nums">•••• {card.last4}</span>}
                </span>
              }>
                {card.id === defaultCardId && <Check size={18} strokeWidth={2.5} className="text-gold" />}
              </FormRow>
            ))
          )}
        </FormGroup>
      </Sheet>
    </>
  )
}
