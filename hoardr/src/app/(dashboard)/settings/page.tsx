'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, CreditCard, LogOut, CalendarDays, Tag, Landmark, LayoutGrid } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'
import { CalendarSettingsSheet, type CalPrefs, type GCalendar } from '@/components/calendar/CalendarSettingsSheet'
import { type IconColorMode, getIconColorMode, setIconColorMode } from '@/lib/category-meta'
import { getWeekStartsMonday, setWeekStartsMonday } from '@/lib/week-start'
import { getAppPrefs, setAppPrefs } from '@/lib/app-prefs'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { BillingCycle } from '@/types'

const DEFAULT_PREFS: CalPrefs = { visibleTypes: ['sub', 'custom', 'google'], googleCalendarIds: [] }

interface SettingsCard { id: string; name: string; last4: string | null }
interface SettingsBank { id: string; name: string }

const BILLING_OPTIONS: BillingCycle[] = ['Weekly', 'BiWeekly', 'Monthly', 'Quarterly', 'Annual']
const BILLING_LABELS: Record<BillingCycle, string> = {
  Weekly: 'Weekly', BiWeekly: 'Bi-wk', Monthly: 'Monthly', Quarterly: 'Qtrly', Annual: 'Annual',
}

export default function SettingsPage() {
  const router    = useRouter()
  const supabase  = useMemo(() => createClient(), [])

  const [theme,                setTheme]                = useState<Theme>('obsidian')
  const [iconMode,             setIconMode]             = useState<IconColorMode>('category')
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

  const [defaultBankOpen,      setDefaultBankOpen]      = useState(false)
  const [defaultBankId,        setDefaultBankId]        = useState<string | null>(null)
  const [defaultBankName,      setDefaultBankName]      = useState<string | null>(null)
  const [settingsBanks,        setSettingsBanks]        = useState<SettingsBank[]>([])
  const [settingsBanksLoading, setSettingsBanksLoading] = useState(false)

  const [defaultCatOpen,     setDefaultCatOpen]     = useState(false)
  const [defaultExpCat,      setDefaultExpCat]      = useState<string | null>(null)
  const [defaultBillingOpen, setDefaultBillingOpen] = useState(false)
  const [defaultBilling,     setDefaultBilling]     = useState<BillingCycle>('Monthly')

  useEffect(() => {
    setTheme(readTheme())
    setIconMode(getIconColorMode())
    setWsMon(getWeekStartsMonday())
    const prefs = getAppPrefs()
    setDefaultBankId(prefs.defaultBankId)
    setDefaultBankName(prefs.defaultBankName)
    setDefaultExpCat(prefs.defaultExpCat)
    setDefaultBilling((prefs.defaultBilling as BillingCycle) ?? 'Monthly')
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

  // Lazily load all banks when the picker opens
  useEffect(() => {
    if (!defaultBankOpen || settingsBanks.length > 0) return
    setSettingsBanksLoading(true)
    supabase.from('banks').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => {
        setSettingsBanks((data ?? []) as SettingsBank[])
        setSettingsBanksLoading(false)
      })
  }, [defaultBankOpen, settingsBanks.length, supabase])

  // Lazily load Google calendars when the sheet opens
  useEffect(() => {
    if (!calOpen || googleCals.length > 0) return
    setCalsLoading(true)
    setCalsError(false)
    fetch('/api/calendar?action=calendars')
      .then(async r => {
        const d = await r.json() as { calendars?: unknown[]; error?: string }
        if (!r.ok || d.error) throw new Error(d.error ?? 'no_token')
        setGoogleCals((d.calendars ?? []) as typeof googleCals)
      })
      .catch(() => setCalsError(true))
      .finally(() => setCalsLoading(false))
  }, [calOpen, googleCals.length])

  function selectTheme(t: Theme) { setTheme(t); applyTheme(t) }

  function selectIconMode(m: IconColorMode) { setIconMode(m); setIconColorMode(m) }

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

  function handleSetDefaultBank(bankId: string) {
    const bank = settingsBanks.find(b => b.id === bankId)
    setDefaultBankId(bankId)
    setDefaultBankName(bank?.name ?? null)
    setDefaultBankOpen(false)
    setAppPrefs({ defaultBankId: bankId, defaultBankName: bank?.name ?? null })
  }

  function handleSetDefaultCat(cat: string) {
    setDefaultExpCat(cat)
    setDefaultCatOpen(false)
    setAppPrefs({ defaultExpCat: cat })
  }

  function handleSetDefaultBilling(cycle: BillingCycle) {
    setDefaultBilling(cycle)
    setDefaultBillingOpen(false)
    setAppPrefs({ defaultBilling: cycle })
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

          <button
            onClick={() => setDefaultCardOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CreditCard size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Card</p>
              <p className="text-[11px] text-ink-muted">{defaultCardName ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Defaults ───────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Defaults</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">

          {/* Default Bank */}
          <button
            onClick={() => setDefaultBankOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Landmark size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Bank</p>
              <p className="text-[11px] text-ink-muted">{defaultBankName ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>

          {/* Default Expense Category */}
          <button
            onClick={() => setDefaultCatOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              {defaultExpCat
                ? <CategoryIcon category={defaultExpCat} type="Expense" size={15} className="text-gold" />
                : <LayoutGrid size={15} className="text-gold" strokeWidth={1.75} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Category</p>
              <p className="text-[11px] text-ink-muted">{defaultExpCat ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>

          {/* Default Billing Cycle */}
          <button
            onClick={() => setDefaultBillingOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Billing</p>
              <p className="text-[11px] text-ink-muted">{defaultBilling}</p>
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
              { id: 'semantic' as IconColorMode, label: 'Type',     sub: 'Green / White / Gold'  },
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
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
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

          {/* Week starts on */}
          <div className="px-4 py-3.5 flex items-center gap-3">
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Week Starts On</p>
            </div>
            <div className="flex rounded-[10px] overflow-hidden border border-white/[0.08] flex-shrink-0">
              {(['Sun', 'Mon'] as const).map((label, idx) => {
                const active = idx === 0 ? !wsMon : wsMon
                return (
                  <button
                    key={label}
                    onClick={() => selectWsMon(idx === 1)}
                    className={cn(
                      'px-3 py-1.5 text-[12px] font-semibold transition-colors',
                      active ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted'
                    )}
                  >{label}</button>
                )
              })}
            </div>
          </div>
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
        calsError={calsError}
        onSave={savePrefs}
      />

      {/* ── Default Billing picker ─────────────────────────────────────────── */}
      <div
        onClick={() => setDefaultBillingOpen(false)}
        className={cn('fixed inset-0 z-40 transition-opacity duration-300', defaultBillingOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300', defaultBillingOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Billing</h2>
          <button onClick={() => setDefaultBillingOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
            {BILLING_OPTIONS.map(opt => (
              <button key={opt} onClick={() => handleSetDefaultBilling(opt)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left active:opacity-70 transition-opacity">
                <p className="text-[14px] font-medium text-ink">{BILLING_LABELS[opt]}</p>
                {opt === defaultBilling && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Default Bank picker ────────────────────────────────────────────── */}
      <div
        onClick={() => setDefaultBankOpen(false)}
        className={cn('fixed inset-0 z-40 transition-opacity duration-300', defaultBankOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300', defaultBankOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Bank</h2>
          <button onClick={() => setDefaultBankOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {settingsBanksLoading ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">Loading…</div>
          ) : settingsBanks.length === 0 ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">No banks yet — add one in the In tab.</div>
          ) : (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              <button
                onClick={() => { setDefaultBankId(null); setDefaultBankName(null); setDefaultBankOpen(false); setAppPrefs({ defaultBankId: null, defaultBankName: null }) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
              >
                <div className="flex-1"><p className="text-[14px] font-medium text-ink-muted">None</p></div>
                {defaultBankId === null && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
              {settingsBanks.map(bank => (
                <button key={bank.id} onClick={() => handleSetDefaultBank(bank.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity">
                  <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0 text-base">🏦</div>
                  <div className="flex-1 min-w-0"><p className="text-[14px] font-medium text-ink truncate">{bank.name}</p></div>
                  {bank.id === defaultBankId && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Default Category picker ─────────────────────────────────────────── */}
      <div
        onClick={() => setDefaultCatOpen(false)}
        className={cn('fixed inset-0 z-40 transition-opacity duration-300', defaultCatOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300', defaultCatOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Category</h2>
          <button onClick={() => setDefaultCatOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
            <button
              onClick={() => handleSetDefaultCat('')}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
            >
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <LayoutGrid size={14} className="text-ink-faint" strokeWidth={1.75} />
              </div>
              <div className="flex-1"><p className="text-[14px] font-medium text-ink-muted">None</p></div>
              {!defaultExpCat && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
            </button>
            {EXPENSE_CATEGORIES.map(cat => (
              <button key={cat.name} onClick={() => handleSetDefaultCat(cat.name)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity">
                <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <CategoryIcon category={cat.name} type="Expense" size={14} className="text-gold" />
                </div>
                <div className="flex-1 min-w-0"><p className="text-[14px] font-medium text-ink truncate">{cat.name}</p></div>
                {cat.name === defaultExpCat && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Default Card picker ─────────────────────────────────────────────── */}
      <div
        onClick={() => setDefaultCardOpen(false)}
        className={cn('fixed inset-0 z-40 transition-opacity duration-300', defaultCardOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300', defaultCardOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
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
    </div>
  )
}
