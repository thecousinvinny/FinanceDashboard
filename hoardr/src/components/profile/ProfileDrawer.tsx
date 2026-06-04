'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { X, Check, ChevronRight, CreditCard, LogOut, CalendarDays, Tag, Settings2, Palette, Camera } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, $fk } from '@/lib/utils'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { SemanticColorSheet } from '@/components/ui/SemanticColorSheet'
import { type IconColorMode, getIconColorMode, setIconColorMode } from '@/lib/category-meta'
import { getWeekStartsMonday, setWeekStartsMonday } from '@/lib/week-start'
import { applySemanticColors } from '@/lib/semantic-colors'

const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'income'], googleCalendarIds: [] }

interface SettingsCard { id: string; name: string; last4: string | null }
interface Stats { netWorth: number; monthlySpend: number; monthlyIncome: number }

export function ProfileDrawer() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])
  const [open, setOpen] = useState(false)

  // User
  const [name,         setName]         = useState<string | null>(null)
  const [email,        setEmail]        = useState<string | null>(null)
  const [googleAvatar, setGoogleAvatar] = useState<string | null>(null)
  const [customAvatar, setCustomAvatar] = useState<string | null>(null)
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Stats (loaded lazily on first open)
  const [stats,      setStats]      = useState<Stats | null>(null)
  const statsLoaded = useRef(false)

  // Settings
  const [theme,                setTheme]                = useState<Theme>('obsidian')
  const [iconMode,             setIconMode]             = useState<IconColorMode>('category')
  const [wsMon,                setWsMon]                = useState(false)
  const [prefs,                setPrefs]                = useState<CalPrefs>(DEFAULT_PREFS)
  const [googleCals,           setGoogleCals]           = useState<GCalendar[]>([])
  const [calsLoading,          setCalsLoading]          = useState(false)
  const [calsError,            setCalsError]            = useState(false)
  const [calOpen,              setCalOpen]              = useState(false)
  const [semColorsOpen,        setSemColorsOpen]        = useState(false)
  const [defaultCardOpen,      setDefaultCardOpen]      = useState(false)
  const [defaultCardId,        setDefaultCardId]        = useState<string | null>(null)
  const [defaultCardName,      setDefaultCardName]      = useState<string | null>(null)
  const [settingsCards,        setSettingsCards]        = useState<SettingsCard[]>([])
  const [settingsCardsLoading, setSettingsCardsLoading] = useState(false)

  // Init local settings on mount
  useEffect(() => {
    setTheme(readTheme())
    setIconMode(getIconColorMode())
    setWsMon(getWeekStartsMonday())
    applySemanticColors()
  }, [])

  // Load user info
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setEmail(u.email ?? null)
      setName(u.user_metadata?.full_name ?? u.user_metadata?.name ?? null)
      setGoogleAvatar(u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null)
    })
  }, [supabase])

  // Load profile (avatar + calendar prefs)
  useEffect(() => {
    supabase.from('profiles').select('avatar_url, calendar_prefs').single().then(({ data }) => {
      if (data?.avatar_url) setCustomAvatar(data.avatar_url as string)
      if (data?.calendar_prefs) setPrefs(data.calendar_prefs as CalPrefs)
    })
  }, [supabase])

  // Load default card name
  useEffect(() => {
    supabase.from('cards').select('id, name').eq('is_default', true).single()
      .then(({ data }) => { if (data) { setDefaultCardId(data.id as string); setDefaultCardName(data.name as string) } })
  }, [supabase])

  // Load stats on first open
  useEffect(() => {
    if (!open || statsLoaded.current) return
    statsLoaded.current = true
    const now = new Date()
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
    Promise.all([
      supabase.from('banks').select('balance')
        .then(({ data }) => (data ?? []).reduce((s, b) => s + ((b.balance as number) ?? 0), 0)),
      supabase.from('expenses').select('cost').gte('date', monthStart)
        .then(({ data }) => (data ?? []).reduce((s, e) => s + ((e.cost as number) ?? 0), 0)),
      supabase.from('income').select('amount').gte('date', monthStart)
        .then(({ data }) => (data ?? []).reduce((s, i) => s + ((i.amount as number) ?? 0), 0)),
    ]).then(([netWorth, monthlySpend, monthlyIncome]) => setStats({ netWorth, monthlySpend, monthlyIncome }))
  }, [open, supabase])

  // Lazy-load cards when picker opens
  useEffect(() => {
    if (!defaultCardOpen || settingsCards.length > 0) return
    setSettingsCardsLoading(true)
    supabase.from('cards').select('id, name, last4')
      .order('sort_order', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: false })
      .then(({ data }) => { setSettingsCards((data ?? []) as SettingsCard[]); setSettingsCardsLoading(false) })
  }, [defaultCardOpen, settingsCards.length, supabase])

  // Lazy-load Google calendars
  useEffect(() => {
    if (!calOpen || googleCals.length > 0) return
    setCalsLoading(true); setCalsError(false)
    fetch('/api/calendar?action=calendars')
      .then(async r => {
        const d = await r.json() as { items?: unknown[]; error?: string }
        if (!r.ok || d.error) throw new Error()
        setGoogleCals((d.items ?? []) as typeof googleCals)
      })
      .catch(() => setCalsError(true))
      .finally(() => setCalsLoading(false))
  }, [calOpen, googleCals.length])

  // Body lock when drawer open
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top      = `-${scrollY}px`
    document.body.style.width    = '100%'
    return () => {
      document.body.style.position = ''
      document.body.style.top      = ''
      document.body.style.width    = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  // Settings handlers
  function selectTheme(t: Theme)           { setTheme(t);    applyTheme(t)       }
  function selectIconMode(m: IconColorMode) { setIconMode(m); setIconColorMode(m) }
  function selectWsMon(v: boolean)          { setWsMon(v);    setWeekStartsMonday(v) }

  async function handleSetDefaultCard(cardId: string) {
    const card = settingsCards.find(c => c.id === cardId)
    setDefaultCardId(cardId); setDefaultCardName(card?.name ?? null); setDefaultCardOpen(false)
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('cards').update({ is_default: false }).eq('user_id', data.user.id)
    await supabase.from('cards').update({ is_default: true  }).eq('id', cardId)
  }

  async function savePrefs(p: CalPrefs) {
    setPrefs(p)
    const { data } = await supabase.auth.getUser()
    if (data.user?.id) await supabase.from('profiles').update({ calendar_prefs: p }).eq('id', data.user.id)
  }

  async function signOut() {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith('image/')) return
    setUploading(true)
    try {
      // Center-crop to 400×400, export JPEG
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = 400; canvas.height = 400
      const ctx = canvas.getContext('2d')!
      const s  = Math.min(bitmap.width, bitmap.height)
      const sx = (bitmap.width  - s) / 2
      const sy = (bitmap.height - s) / 2
      ctx.drawImage(bitmap, sx, sy, s, s, 0, 0, 400, 400)
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88))

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const path = `${user.id}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, {
        upsert: true,
        contentType: 'image/jpeg',
      })
      if (error) throw error

      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      // Cache-bust so the browser fetches the new image
      setCustomAvatar(`${publicUrl}?t=${Date.now()}`)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', user.id)
    } catch (e) {
      console.error('Avatar upload failed', e)
    } finally {
      setUploading(false)
    }
  }

  const avatarSrc = customAvatar || googleAvatar
  const initials  = name
    ? name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  return (
    <>
      {/* ── Avatar button (fixed top-right on every page) ─────────────────── */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Profile"
        className="fixed overflow-hidden rounded-full select-none active:scale-95 transition-transform"
        style={{
          top:       'calc(env(safe-area-inset-top, 44px) + 10px)',
          right:     16,
          width:     36,
          height:    36,
          zIndex:    45,
          boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(212,175,55,0.4)',
        }}
      >
        {avatarSrc
          ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
          : <div className="w-full h-full gradient-gold flex items-center justify-center">
              <span className="text-[13px] font-bold text-white">{initials}</span>
            </div>
        }
      </button>

      {/* ── Backdrop ──────────────────────────────────────────────────────── */}
      <div
        onClick={() => setOpen(false)}
        className={cn('fixed inset-0 transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.6)', zIndex: 54 }}
      />

      {/* ── Drawer ────────────────────────────────────────────────────────── */}
      <div
        className={cn(
          'fixed top-0 right-0 h-full bg-bg-surface flex flex-col transition-transform duration-300',
          open ? 'translate-x-0' : 'translate-x-full',
        )}
        style={{
          width:       'min(85vw, 360px)',
          zIndex:      55,
          willChange:  'transform',
          paddingTop:  'env(safe-area-inset-top, 44px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Close button */}
        <div className="flex items-center justify-between px-4 pt-3 pb-2 flex-shrink-0">
          <button
            onClick={() => setOpen(false)}
            className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:opacity-70"
          >
            <X size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Profile header */}
        <div className="px-5 pb-5 flex-shrink-0">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="relative w-20 h-20 rounded-full overflow-hidden mb-3 block active:opacity-80 transition-opacity"
            style={{ boxShadow: '0 0 0 2px rgba(212,175,55,0.5)' }}
          >
            {avatarSrc
              ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full gradient-gold flex items-center justify-center">
                  <span className="text-[28px] font-bold text-white">{initials}</span>
                </div>
            }
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <div
              className="absolute bottom-0 right-0 w-6 h-6 gradient-gold rounded-full flex items-center justify-center pointer-events-none"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              <Camera size={11} className="text-white" strokeWidth={2} />
            </div>
          </button>
          {name  && <p className="text-[18px] font-bold text-ink leading-tight">{name}</p>}
          {email && <p className="text-[12px] text-ink-muted mt-0.5">{email}</p>}
        </div>

        {/* Stats */}
        {stats && (
          <div className="px-5 mb-5 flex-shrink-0">
            <div className="grid grid-cols-3 gap-2">
              {([
                { label: 'Net Worth',  value: $fk(stats.netWorth)      },
                { label: 'Mo. Spend',  value: $fk(stats.monthlySpend)  },
                { label: 'Mo. Income', value: $fk(stats.monthlyIncome) },
              ] as const).map(s => (
                <div key={s.label} className="bg-bg-overlay rounded-[14px] p-3 text-center">
                  <p className="text-[15px] font-bold text-ink" style={{ fontFamily: 'var(--font-big-shoulders)' }}>{s.value}</p>
                  <p className="text-[9px] text-ink-faint mt-0.5 uppercase tracking-wide leading-tight">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Scrollable settings content */}
        <div className="flex-1 overflow-y-auto px-5 pb-10" style={{ overscrollBehavior: 'contain' }}>

          {/* Accounts */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Accounts</p>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04] mb-5">
            {([
              { label: 'Categories',    sub: 'Icons and colors',          icon: Tag,      route: '/settings/categories' },
              { label: 'Form Defaults', sub: 'Card, bank, category, billing', icon: Settings2, route: '/settings/defaults'    },
            ] as const).map(row => (
              <button
                key={row.label}
                onClick={() => { setOpen(false); router.push(row.route) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
              >
                <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <row.icon size={15} className="text-gold" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink">{row.label}</p>
                  <p className="text-[11px] text-ink-muted">{row.sub}</p>
                </div>
                <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
              </button>
            ))}
            <button
              onClick={() => setDefaultCardOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <CreditCard size={15} className="text-gold" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink">Default Card</p>
                <p className="text-[11px] text-ink-muted">{defaultCardName ?? 'None set'}</p>
              </div>
              <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
            </button>
          </div>

          {/* Appearance */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Appearance</p>
          <div className="grid grid-cols-2 gap-2 mb-3">
            {THEMES.map(t => {
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => selectTheme(t.id)}
                  className={cn(
                    'rounded-[14px] p-2.5 text-left border transition-colors',
                    active ? 'border-gold/50 bg-bg-overlay' : 'border-white/[0.06] bg-bg-overlay',
                  )}
                >
                  <div className="flex gap-1 mb-2">
                    {t.swatches.map((color, i) => (
                      <div key={i} className="h-5 rounded-[4px] flex-1" style={{ background: color, border: '1px solid rgba(0,0,0,0.08)' }} />
                    ))}
                  </div>
                  <div className="flex items-start justify-between gap-1">
                    <p className="text-[11px] font-semibold text-ink leading-tight">{t.label}</p>
                    {active && (
                      <div className="w-[14px] h-[14px] rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
                        <Check size={7} className="text-white" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>

          <div className="bg-bg-overlay border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04] mb-5">
            <button
              onClick={() => setSemColorsOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <Palette size={15} className="text-gold" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink">Accent Colors</p>
                <p className="text-[11px] text-ink-muted">Income, expense &amp; subs</p>
              </div>
              <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
            </button>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <Palette size={15} className="text-gold" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-medium text-ink flex-1">Icon Colors</p>
              <div className="flex rounded-[10px] overflow-hidden border border-white/[0.08] flex-shrink-0">
                {([
                  { id: 'category' as IconColorMode, label: 'Cat.' },
                  { id: 'semantic' as IconColorMode, label: 'Type' },
                ]).map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => selectIconMode(opt.id)}
                    className={cn(
                      'px-2.5 py-1.5 text-[12px] font-semibold transition-colors',
                      iconMode === opt.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted',
                    )}
                  >{opt.label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Calendar */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Calendar</p>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04] mb-5">
            <button
              onClick={() => setCalOpen(true)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-medium text-ink">Filters &amp; Google Calendars</p>
                <p className="text-[11px] text-ink-muted">Event types, linked calendars</p>
              </div>
              <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
            </button>
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-medium text-ink flex-1">Week Starts On</p>
              <div className="flex rounded-[10px] overflow-hidden border border-white/[0.08] flex-shrink-0">
                {(['Sun', 'Mon'] as const).map((label, idx) => (
                  <button
                    key={label}
                    onClick={() => selectWsMon(idx === 1)}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-semibold transition-colors',
                      (idx === 0 ? !wsMon : wsMon) ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted',
                    )}
                  >{label}</button>
                ))}
              </div>
            </div>
          </div>

          {/* Sign out */}
          <div className="bg-bg-overlay border border-white/[0.06] rounded-card overflow-hidden">
            <button
              onClick={signOut}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <LogOut size={15} className="text-ruby" strokeWidth={1.75} />
              </div>
              <span className="text-[14px] font-medium text-ink">Sign Out</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Hidden file input ─────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => {
          const f = e.target.files?.[0]
          if (f) handleAvatarFile(f)
          e.target.value = ''
        }}
      />

      {/* ── Sheets (rendered outside drawer so they sit above it) ─────────── */}
      <SemanticColorSheet open={semColorsOpen} onClose={() => setSemColorsOpen(false)} />
      <CalendarSettingsSheet
        open={calOpen}
        onClose={() => setCalOpen(false)}
        prefs={prefs}
        googleCals={googleCals}
        calsLoading={calsLoading}
        calsError={calsError}
        onSave={savePrefs}
      />

      {/* Default Card picker */}
      <div
        onClick={() => setDefaultCardOpen(false)}
        className={cn('fixed inset-0 transition-opacity duration-300',
          defaultCardOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)', zIndex: 59 }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          defaultCardOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ zIndex: 60, willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Card</h2>
          <button onClick={() => setDefaultCardOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {settingsCardsLoading ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">Loading…</div>
          ) : settingsCards.length === 0 ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">No cards yet — add one in the In tab.</div>
          ) : (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              {settingsCards.map(card => (
                <button
                  key={card.id}
                  onClick={() => handleSetDefaultCard(card.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
                >
                  <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <CreditCard size={14} className="text-gold" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink truncate">{card.name}</p>
                    {card.last4 && <p className="text-[11px] text-ink-muted">····{card.last4}</p>}
                  </div>
                  {card.id === defaultCardId && (
                    <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
                      <Check size={9} className="text-white" strokeWidth={2.5} />
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
