'use client'

import { hiResGoogle } from '@/lib/image'
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Settings2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { $f, $fk, haptic } from '@/lib/utils'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { afterSlideTimeout, useOnScreenReturn, useScreenReady, useScreenVisit, navigateTab } from '@/lib/tab-nav'
import { sameAsLast } from '@/lib/same-data'
import { CashflowCard } from '@/components/profile/CashflowCard'
import { profileStats, breakdown, BREAK_RANGES, type BreakRange, type ProfExp, type ProfInc, type ProfSub } from '@/lib/profile-stats'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpRow = ProfExp
type IncRow = ProfInc
type SubRow = ProfSub
interface PillItem { name: string; value: number; display: string; note?: string; icon?: boolean }

const MINUS    = '−'
const RED      = '#ef4444'
const sgn = (n: number) => `${n < 0 ? MINUS : '+'}${$fk(Math.abs(n))}`
const MONTH_ABBR = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const shortDate = (d: string) => `${MONTH_ABBR[Number(d.slice(5, 7)) - 1]} ’${d.slice(2, 4)}`

// ─── Shared: grow-in trigger for the bars ─────────────────────────────────────

/**
 * False → true shortly after the bars are shown (each screen visit). Layout
 * effect, so the reset to zero lands before paint instead of after a frame at
 * full size.
 */
function useGrowIn() {
  const visit = useScreenVisit()
  const [grown, setGrown] = useState(false)
  useLayoutEffect(() => {
    setGrown(false)
    if (visit === 0) return
    return afterSlideTimeout(() => setGrown(true), 60)
  }, [visit])
  return grown
}

// ─── Shared: ranked pill bars (categories / subscriptions / income sources) ──

function RankPills({ items, tone }: { items: PillItem[]; tone: 'expense' | 'income' }) {
  // Grow when shown; new data eases to the new width instead of collapsing
  const grown  = useGrowIn()
  const maxVal = Math.max(...items.map(i => i.value), 1)
  const rgb    = tone === 'income' ? 'var(--sem-income-rgb)' : 'var(--sem-expense-rgb)'

  if (items.length === 0) return <p className="text-[12px] text-ink-faint text-center py-4">No data yet</p>

  return (
    <div className="space-y-2">
      {items.map((item, i) => {
        const Icon = item.icon ? getCategoryIcon(item.name, 'Expense') : null
        return (
          <div key={item.name + i} className="flex items-center gap-2">
            <div className="relative flex-1 min-w-0 flex items-center rounded-[8px] overflow-hidden"
              style={{ height: 32, background: 'var(--color-bg-overlay)' }}>
              <div className="absolute inset-y-0 left-0 rounded-[8px]" style={{
                width: '100%',
                background: `linear-gradient(90deg, rgba(${rgb},0.35), rgba(${rgb},0.08))`,
                transform: `scaleX(${grown ? item.value / maxVal : 0})`,
                transformOrigin: 'left',
                transition: grown ? `transform 600ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 70}ms` : 'none',
              }} />
              <div className="relative flex items-center gap-2 px-2.5 z-10 min-w-0">
                {Icon && <Icon size={13} className="text-gold flex-shrink-0" strokeWidth={1.75} />}
                <span className="text-[12px] font-medium text-ink truncate">{item.name}</span>
              </div>
              {item.note && <span className="relative ml-auto pr-2.5 z-10 text-[10.5px] text-ink-muted whitespace-nowrap">{item.note}</span>}
            </div>
            <span className="text-[12px] font-semibold font-mono text-ink-muted w-14 text-right flex-shrink-0">{item.display}</span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Card({ label, stat, children }: { label: string; stat?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="px-5 mb-5">
      <div className="bg-bg-surface border border-ink/[0.06] rounded-card p-4">
        <div className="flex items-baseline gap-2 mb-3.5">
          <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gold">{label}</p>
          {stat && <div className="ml-auto text-[11px] text-ink-muted text-right">{stat}</div>}
        </div>
        {children}
      </div>
    </div>
  )
}

function Record({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-bg-overlay rounded-[14px] p-3 min-w-0">
      <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-1">{label}</p>
      <p className="text-[22px] font-bold leading-none" style={{ fontFamily: 'var(--font-big-shoulders)', color: color ?? 'rgb(var(--rgb-ink))' }}>{value}</p>
      {sub && <p className="text-[10.5px] text-ink-muted mt-1 truncate">{sub}</p>}
    </div>
  )
}

/** This mo · 6 mo · This yr · All — a breakdown card's range, in its header */
function RangePills({ value, onChange }: { value: BreakRange; onChange: (r: BreakRange) => void }) {
  return (
    <div className="flex gap-1">
      {BREAK_RANGES.map(r => (
        <button key={r.id} onClick={() => { haptic('tap'); onChange(r.id) }}
          className={`px-2 py-[3px] rounded-full text-[10.5px] font-semibold whitespace-nowrap transition-colors ${value === r.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted'}`}>
          {r.label}
        </button>
      ))}
    </div>
  )
}
function Empty({ children }: { children: React.ReactNode }) {
  return <p className="text-[13px] text-ink-muted py-3 text-center">{children}</p>
}
const rangeWords = (r: BreakRange) => ({ mo: 'this month', '6m': 'in the last 6 months', yr: 'this year', all: 'so far' })[r]
const vsWords = (r: BreakRange) => BREAK_RANGES.find(x => x.id === r)!.vs

const trendNote = (t: number | null) => t === null ? undefined : `${t >= 0 ? '↑' : '↓'} ${Math.abs(Math.round(t * 100))}%`

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // User
  const [userId,       setUserId]       = useState<string | null>(null)
  const [email,        setEmail]        = useState<string | null>(null)
  const [googleAvatar, setGoogleAvatar] = useState<string | null>(null)
  const [customAvatar, setCustomAvatar] = useState<string | null>(null)
  const [displayName,  setDisplayName]  = useState<string | null>(null)
  const [editingName,  setEditingName]  = useState(false)
  const [nameInput,    setNameInput]    = useState('')
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Data
  const [expenses, setExpenses] = useState<ExpRow[]>([])
  const [income,   setIncome]   = useState<IncRow[]>([])
  const [subs,     setSubs]     = useState<SubRow[]>([])
  const [loading,  setLoading]  = useState(true)

  // ── Load user ──────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setUserId(u.id)
      setEmail(u.email ?? null)
      const g = (u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null) as string | null
      setGoogleAvatar(g ? hiResGoogle(g, 1600) : null)   // the banner is wide on desktop
      const metaName = u.user_metadata?.full_name ?? u.user_metadata?.name ?? null
      setDisplayName(prev => prev ?? metaName)
    })
  }, [supabase])

  useEffect(() => {
    supabase.from('profiles').select('display_name, avatar_url').single().then(({ data }) => {
      if (data?.display_name) setDisplayName(data.display_name as string)
      if (data?.avatar_url)   setCustomAvatar(data.avatar_url as string)
    })
  }, [supabase])

  // ── Load financial data ────────────────────────────────────────────────────

  const loadGen  = useRef(0)
  const dataSigRef = useRef('')
  const abortRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const gen = ++loadGen.current
    try {
      const [eRes, iRes, sRes] = await Promise.all([
        supabase.from('expenses').select('cost, savings, date, name, categories(name)').limit(5000).abortSignal(ctrl.signal),
        supabase.from('income').select('amount, source, date, name').limit(5000).abortSignal(ctrl.signal),
        supabase.from('subscriptions').select('name, monthly_cost, annual_cost').eq('status', 'Active').limit(200).abortSignal(ctrl.signal),
      ])
      if (gen !== loadGen.current) return
      if (eRes.error) console.error('[Profile] expenses:', eRes.error)
      if (iRes.error) console.error('[Profile] income:',  iRes.error)
      if (sRes.error) console.error('[Profile] subs:',    sRes.error)
      // Nothing changed since the last load: skip the re-render (and the
      // analytics recompute over thousands of rows) mid tab-transition
      if (!sameAsLast(dataSigRef, [eRes.data, iRes.data, sRes.data])) {
        setExpenses((eRes.data ?? []) as ExpRow[])
        setIncome((iRes.data ?? []) as IncRow[])
        setSubs((sRes.data ?? []) as SubRow[])
      }
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[Profile] loadData:', err)
      setLoading(false)
    }
  }, [supabase])

  // Kept alive across tabs — refresh quietly whenever this screen is shown again
  // (and move "now" forward, in case it was left open past midnight)
  useOnScreenReturn(() => { setNow(new Date()); loadData() })
  useScreenReady(!loading)   // releases the load screen once this screen has its data

  useEffect(() => {
    loadData()
    return () => { loadGen.current++; abortRef.current?.abort() }
  }, [loadData])

  // ── Name editing ───────────────────────────────────────────────────────────

  function startEditName() {
    setNameInput(displayName ?? '')
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }

  async function saveName() {
    const trimmed = nameInput.trim()
    setEditingName(false)
    if (!trimmed || trimmed === displayName || !userId) return
    setDisplayName(trimmed)
    await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId)
  }

  // ── Avatar upload ──────────────────────────────────────────────────────────

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith('image/') || !userId) return
    setUploading(true)
    try {
      // The photo is the Profile banner and the greeting's hero, up to ~630px
      // wide on desktop at 2x: keep it whole (no square crop — every place it
      // shows crops it itself) and up to 2000px on the long side. It used to be
      // a 400px square, which pixelated on desktop.
      const bitmap = await createImageBitmap(file)
      const MAX = 2000
      const k = Math.min(1, MAX / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * k); canvas.height = Math.round(bitmap.height * k)
      const ctx = canvas.getContext('2d')!
      ctx.imageSmoothingQuality = 'high'
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.9))
      const path = `${userId}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      setCustomAvatar(`${publicUrl}?t=${Date.now()}`)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
    } catch (e) { console.error('Avatar upload failed', e) }
    finally    { setUploading(false) }
  }

  // ── History ────────────────────────────────────────────────────────────────
  // Everything below is historical and shown once: "this month" lives on Home.

  const [now, setNow] = useState(() => new Date())
  const stats = useMemo(() => profileStats(expenses, income, subs, now), [expenses, income, subs, now])
  const { records: rec, allTime } = stats
  // Each breakdown card has its own range
  const [catRange, setCatRange] = useState<BreakRange>('mo')
  const [subRange, setSubRange] = useState<BreakRange>('mo')
  const [srcRange, setSrcRange] = useState<BreakRange>('mo')
  const catBreak = useMemo(() => breakdown(expenses, income, subs, now, catRange), [expenses, income, subs, now, catRange])
  const subBreak = useMemo(() => breakdown(expenses, income, subs, now, subRange), [expenses, income, subs, now, subRange])
  const srcBreak = useMemo(() => breakdown(expenses, income, subs, now, srcRange), [expenses, income, subs, now, srcRange])

  // ── Render ────────────────────────────────────────────────────────────────

  const avatarSrc = customAvatar || googleAvatar
  const hasPhoto  = !!avatarSrc
  const initials  = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      {/* One centered column on desktop, the same as Settings: its 640px less
          its 24px gutters is 592px of content, and the cards here have 20px
          gutters, so 632px lines the two pages up exactly. Full width on a phone. */}
      <div className="mx-auto w-full max-w-[632px]">

      {/* ── Header: your photo full-bleed, fading into the page ──────────────── */}
      {/* Tap the photo to change it, the name to edit it */}
      <div
        className="relative overflow-hidden select-none"
        style={{ height: 'calc(env(safe-area-inset-top, 44px) + 232px)', cursor: uploading ? 'default' : 'pointer' }}
        onClick={() => { if (!uploading && !editingName) fileInputRef.current?.click() }}
      >
        {avatarSrc
          ? <img src={avatarSrc} alt="" draggable={false} className="absolute inset-0 w-full h-full object-cover" style={{ objectPosition: 'center 30%' }} />
          : <div className="absolute inset-0 gradient-gold flex items-center justify-center">
              <span className="text-[64px] font-bold text-white/90" style={{ fontFamily: 'var(--font-big-shoulders)' }}>{initials}</span>
            </div>
        }
        {/* Dark wash for legibility, fading into the page */}
        <div className="absolute inset-0 pointer-events-none" style={{
          background: 'linear-gradient(180deg, rgba(6,6,9,0.35) 0%, rgba(6,6,9,0) 26%, rgba(6,6,9,0) 40%, rgba(6,6,9,0.55) 70%, var(--color-bg-base) 100%)',
        }} />
        {uploading && (
          <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-gold border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {/* Floating glass buttons */}
        <div className="absolute left-4 right-4 flex items-center justify-between" style={{ top: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
          {([
            [() => router.back(), <ArrowLeft key="b" size={18} strokeWidth={2} />, 'Back'],
            [() => navigateTab('/settings', 'push'), <Settings2 key="s" size={18} strokeWidth={1.75} />, 'Settings'],
          ] as const).map(([fn, icon, label]) => (
            <button key={label} aria-label={label} onClick={e => { e.stopPropagation(); fn() }}
              className="w-9 h-9 flex items-center justify-center rounded-full text-white"
              style={{ background: 'rgba(10,10,11,0.38)', WebkitBackdropFilter: 'blur(12px)', backdropFilter: 'blur(12px)' }}>
              {icon}
            </button>
          ))}
        </div>

        {/* Name over the photo */}
        <div className="absolute left-5 right-5 bottom-3" onClick={e => e.stopPropagation()}>
          {allTime.since && (
            <p className="text-[10px] font-semibold tracking-[0.12em] uppercase" style={{ color: 'rgba(255,255,255,0.65)' }}>
              Since {allTime.since}
            </p>
          )}
          {editingName ? (
            <div className="flex items-center gap-2 mt-1">
              <input ref={nameInputRef} value={nameInput} onChange={e => setNameInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') saveName() }} onBlur={saveName}
                className="rounded-[10px] px-3 py-1.5 text-[22px] font-bold text-white outline-none border border-gold/50 min-w-0 flex-1"
                style={{ maxWidth: 260, background: 'rgba(10,10,11,0.45)', colorScheme: 'dark' }} />
              <button onClick={saveName} className="w-8 h-8 gradient-gold rounded-full flex items-center justify-center flex-shrink-0">
                <Check size={13} className="text-white" strokeWidth={2.5} />
              </button>
            </div>
          ) : (
            <button onClick={startEditName} className="flex items-center gap-2 mt-0.5 group select-none text-left max-w-full">
              <span className="text-[30px] font-bold text-white tracking-[-0.02em] leading-tight truncate"
                style={{ textShadow: '0 2px 14px rgba(0,0,0,0.4)' }}>
                {displayName ?? 'Set your name'}
              </span>
              <Pencil size={14} className="text-white/55 group-active:text-gold transition-colors flex-shrink-0" strokeWidth={1.75} />
            </button>
          )}
          {email && <p className="text-[12px] truncate" style={{ color: 'rgba(255,255,255,0.6)' }}>{email}</p>}
        </div>

        {!hasPhoto && (
          <div className="absolute right-5 bottom-4 w-8 h-8 gradient-gold rounded-full flex items-center justify-center pointer-events-none"
            style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
            <Camera size={14} className="text-white" strokeWidth={2} />
          </div>
        )}
      </div>
      <div className="h-4" />

      {!loading && (
        <>
          {/* ── Cashflow: every month, tap one to read it ─────────────────────── */}
          <div className="px-5 mb-5">
            <CashflowCard months={stats.months} />
          </div>

          {/* ── Records ───────────────────────────────────────────────────────── */}
          <Card label="Records">
            <div className="grid grid-cols-2 gap-2">
              {rec.best && (
                <Record label="Best month" value={sgn(rec.best.inc - rec.best.exp)} sub={rec.best.long}
                  color={rec.best.inc - rec.best.exp >= 0 ? 'var(--sem-income)' : RED} />
              )}
              {rec.worst && (
                <Record label="Toughest month" value={sgn(rec.worst.inc - rec.worst.exp)} sub={rec.worst.long}
                  color={rec.worst.inc - rec.worst.exp >= 0 ? 'var(--sem-income)' : RED} />
              )}
              {rec.topIncome && (
                <Record label="Biggest payday month" value={$fk(rec.topIncome.inc)} sub={rec.topIncome.long} color="var(--sem-income)" />
              )}
              {rec.biggest && (
                <Record label="Biggest purchase" value={$fk(rec.biggest.cost)}
                  sub={`${rec.biggest.name} · ${shortDate(rec.biggest.date)}`}
                  color="var(--sem-expense)" />
              )}
              <Record label="Green streak" value={`${rec.streak.current} mo`}
                sub={`Longest ${rec.streak.longest} ${rec.streak.longest === 1 ? 'month' : 'months'}`}
                color={rec.streak.current > 0 ? 'var(--sem-income)' : undefined} />
              <Record label="Average month" value={$fk(rec.avgSpend)} sub={`spent · ${$fk(rec.avgIncome)} earned`} />
            </div>
          </Card>

          {/* ── Categories ────────────────────────────────────────────────────── */}
          <Card label="Categories" stat={<RangePills value={catRange} onChange={setCatRange} />}>
            {catBreak.categories.length ? (
              <RankPills tone="expense" items={catBreak.categories.map(c => ({
                name: c.name, value: c.total, display: $fk(c.total), icon: true,
                note: [`${Math.round(c.share * 100)}%`, trendNote(c.trend)].filter(Boolean).join(' · '),
              }))} />
            ) : <Empty>No spending {rangeWords(catRange)}</Empty>}
            <p className="text-[11px] text-ink-muted mt-3">Share of spending · trend {vsWords(catRange)}</p>
          </Card>

          {/* ── Subscriptions ─────────────────────────────────────────────────── */}
          <Card label="Subscriptions" stat={<RangePills value={subRange} onChange={setSubRange} />}>
            {subBreak.subs.list.length ? (
              <RankPills tone="expense" items={subBreak.subs.list.slice(0, 6).map(s => ({
                name: s.name, value: s.total, display: $fk(s.total), note: `${$fk(s.monthly)}/mo`,
              }))} />
            ) : <Empty>No active subscriptions</Empty>}
            <p className="text-[11px] text-ink-muted mt-3">
              <span className="text-ink font-semibold">{$f(subBreak.subs.paid)}</span> paid {rangeWords(subRange)} · {subBreak.subs.active} active · {$fk(subBreak.subs.monthly)}/mo · {$fk(subBreak.subs.yearly)}/yr
            </p>
          </Card>

          {/* ── Income sources ────────────────────────────────────────────────── */}
          <Card label="Income sources" stat={<RangePills value={srcRange} onChange={setSrcRange} />}>
            {srcBreak.sources.length ? (
              <RankPills tone="income" items={srcBreak.sources.map(s => ({
                name: s.name, value: s.total, display: $fk(s.total),
                note: [`${Math.round(s.share * 100)}%`, trendNote(s.trend)].filter(Boolean).join(' · '),
              }))} />
            ) : <Empty>No income {rangeWords(srcRange)}</Empty>}
            <p className="text-[11px] text-ink-muted mt-3">Share of income · trend {vsWords(srcRange)}</p>
          </Card>

          {/* ── All time ──────────────────────────────────────────────────────── */}
          <Card label="All time">
            <div className="grid grid-cols-2 gap-2">
              <Record label="Earned" value={$f(allTime.earned)} color="var(--sem-income)" />
              <Record label="Spent" value={$f(allTime.spent)} color="var(--sem-expense)" />
              <Record label="Kept" value={`${allTime.earned - allTime.spent < 0 ? MINUS : '+'}${$f(Math.abs(allTime.earned - allTime.spent))}`}
                color={allTime.earned >= allTime.spent ? 'var(--sem-income)' : RED} />
              <Record label="Saved on discounts" value={$f(allTime.saved)} color={allTime.saved > 0 ? 'var(--sem-income)' : undefined} />
              <Record label="Expenses logged" value={allTime.count.toLocaleString('en-US')} />
              <Record label="Months tracked" value={String(stats.months.length)} />
            </div>
          </Card>
        </>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }} />
      </div>
    </div>
  )
}
