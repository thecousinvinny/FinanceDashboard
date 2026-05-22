'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, CreditCard, LogOut, CalendarDays, Tag } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { type IconColorMode, getIconColorMode, setIconColorMode } from '@/lib/category-meta'

const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'custom', 'google'], googleCalendarIds: [] }

export default function SettingsPage() {
  const router    = useRouter()
  const supabase  = useMemo(() => createClient(), [])

  const [theme,          setTheme]          = useState<Theme>('obsidian')
  const [iconMode,       setIconMode]       = useState<IconColorMode>('category')
  const [email,          setEmail]          = useState<string | null>(null)
  const [calOpen,        setCalOpen]        = useState(false)
  const [prefs,          setPrefs]          = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,     setGoogleCals]     = useState<GCalendar[]>([])
  const [calsLoading,    setCalsLoading]    = useState(false)

  useEffect(() => { setTheme(readTheme()); setIconMode(getIconColorMode()) }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => { setEmail(data.user?.email ?? null) })
  }, [supabase])

  // Load calendar prefs once
  useEffect(() => {
    supabase.from('profiles').select('calendar_prefs').single().then(({ data }) => {
      if (data?.calendar_prefs) setPrefs(data.calendar_prefs as CalPrefs)
    })
  }, [supabase])

  // Lazily load Google calendars when the sheet opens
  useEffect(() => {
    if (!calOpen || googleCals.length > 0) return
    setCalsLoading(true)
    fetch('/api/calendar?action=calendars')
      .then(r => r.json())
      .then(d => setGoogleCals(d.calendars ?? []))
      .catch(() => {})
      .finally(() => setCalsLoading(false))
  }, [calOpen, googleCals.length])

  function selectTheme(t: Theme) { setTheme(t); applyTheme(t) }

  function selectIconMode(m: IconColorMode) { setIconMode(m); setIconColorMode(m) }

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

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Hoardr</p>
        <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Settings</h1>
      </div>

      {/* ── Accounts ───────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Accounts</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          <button
            onClick={() => router.push('/wallet')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CreditCard size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Cards &amp; Banks</p>
              <p className="text-[11px] text-ink-muted">Manage payment methods</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
          <button
            onClick={() => router.push('/settings/categories')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Tag size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Categories</p>
              <p className="text-[11px] text-ink-muted">Icons and colors</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Appearance</p>
        <div className="grid grid-cols-3 gap-2.5">
          {THEMES.map(t => {
            const active = theme === t.id
            return (
              <button
                key={t.id}
                onClick={() => selectTheme(t.id)}
                className={cn(
                  'rounded-[14px] p-2.5 text-left border transition-colors',
                  active
                    ? 'border-gold/50 bg-bg-overlay'
                    : 'border-white/[0.06] bg-bg-overlay'
                )}
              >
                <div className="flex gap-1 mb-2">
                  {t.swatches.map((color, i) => (
                    <div
                      key={i}
                      className="h-6 rounded-[5px] flex-1"
                      style={{ backgroundColor: color, border: '1px solid rgba(0,0,0,0.08)' }}
                    />
                  ))}
                </div>
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <p className="text-[11px] font-semibold text-ink leading-tight">{t.label}</p>
                    <p className="text-[9px] text-ink-muted leading-tight mt-0.5">{t.subtitle}</p>
                  </div>
                  {active && (
                    <div className="w-[15px] h-[15px] rounded-full gradient-gold flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={8} className="text-white" strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              </button>
            )
          })}
        </div>

        {/* Icon color mode */}
        <div className="mt-4">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Icon Colors</p>
          <div className="flex gap-2">
            {([
              { id: 'category' as IconColorMode, label: 'Category', sub: 'Custom per-category' },
              { id: 'semantic' as IconColorMode, label: 'Type',     sub: 'Green / White / Red'  },
            ]).map(opt => (
              <button
                key={opt.id}
                onClick={() => selectIconMode(opt.id)}
                className={cn(
                  'flex-1 rounded-[14px] p-3 text-left border transition-colors',
                  iconMode === opt.id ? 'border-gold/50 bg-bg-overlay' : 'border-white/[0.06] bg-bg-overlay'
                )}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <p className="text-[12px] font-semibold text-ink leading-tight">{opt.label}</p>
                    <p className="text-[10px] text-ink-muted leading-tight mt-0.5">{opt.sub}</p>
                  </div>
                  {iconMode === opt.id && (
                    <div className="w-[15px] h-[15px] rounded-full gradient-gold flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Check size={8} className="text-white" strokeWidth={2.5} />
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Calendar ───────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Calendar</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden">
          <button
            onClick={() => setCalOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Filters &amp; Google Calendars</p>
              <p className="text-[11px] text-ink-muted">Event types, linked calendars</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── App ────────────────────────────────────────────────────────────── */}
      <div className="px-5">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">App</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {email && (
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-white">
                  {email.charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-[13px] text-ink-muted truncate">{email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <LogOut size={15} className="text-ruby" strokeWidth={1.75} />
            </div>
            <span className="text-[14px] font-medium text-ink">Sign Out</span>
          </button>
        </div>
      </div>

      <CalendarSettingsSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        prefs={prefs}
        googleCals={googleCals}
        calsLoading={calsLoading}
        onSave={savePrefs}
      />
    </div>
  )
}
