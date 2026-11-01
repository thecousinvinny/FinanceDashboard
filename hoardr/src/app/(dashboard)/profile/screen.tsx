'use client'

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Settings2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, $f, $fk } from '@/lib/utils'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { afterSlideTimeout, useOnScreenReturn, useScreenReady, useScreenVisit, navigateTab } from '@/lib/tab-nav'
import { sameAsLast } from '@/lib/same-data'
import { CashflowCard } from '@/components/profile/CashflowCard'
import { profileStats, type ProfExp, type ProfInc, type ProfSub } from '@/lib/profile-stats'

// ─── Types ────────────────────────────────────────────────────────────────────

type ExpRow = ProfExp
type IncRow = ProfInc
type SubRow = ProfSub
interface PillItem { name: string; value: number; display: string; note?: string; icon?: boolean }

const MINUS    = '−'
const RED      = '#ef4444'
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const WEEKDAYS_FULL = ['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays']
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

// ─── Weekday spending bars ────────────────────────────────────────────────────

function WeekdayBars({ values }: { values: number[] }) {
  const grown = useGrowIn()
  const max   = Math.max(...values, 1)
  const top   = values.indexOf(max)
  const H     = 64
  return (
    <div>
      <div className="flex items-end gap-2" style={{ height: H }}>
        {values.map((v, i) => (
          <div key={i} className="flex-1 rounded-[5px]" style={{
            height: Math.max(3, (v / max) * H),
            background: i === top
              ? 'linear-gradient(180deg, var(--sem-expense), rgba(var(--sem-expense-rgb),0.45))'
              : 'rgba(var(--sem-expense-rgb),0.22)',
            transform: `scaleY(${grown ? 1 : 0})`, transformOrigin: 'bottom',
            transition: grown ? `transform 550ms cubic-bezier(0.22, 1, 0.36, 1) ${i * 40}ms` : 'none',
          }} />
        ))}
      </div>
      <div className="flex gap-2 mt-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex-1 text-center">
            <p className={cn('text-[10px]', i === top ? 'text-gold font-semibold' : 'text-ink-faint')}>{WEEKDAYS[i]}</p>
            <p className="text-[10px] text-ink-muted" style={{ fontFamily: 'var(--font-big-shoulders)' }}>{$fk(v)}</p>
          </div>
        ))}
      </div>
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

function Row({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-ink/[0.04] last:border-0">
      <div>
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
      </div>
      <p className={cn('text-[15px] font-semibold font-mono', accent ? 'text-emerald' : 'text-ink')}>{value}</p>
    </div>
  )
}

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
      setGoogleAvatar(u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null)
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
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = 400; canvas.height = 400
      const ctx = canvas.getContext('2d')!
      const s = Math.min(bitmap.width, bitmap.height)
      ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, 400, 400)
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88))
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
  const { records: rec, habits, allTime } = stats

  // ── Render ────────────────────────────────────────────────────────────────

  const avatarSrc = customAvatar || googleAvatar
  const hasPhoto  = !!avatarSrc
  const initials  = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
        <button onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <button onClick={() => navigateTab('/settings', 'push')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted">
          <Settings2 size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* ── Avatar + identity ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-5 pt-4 pb-6">
        <div className="relative mb-4">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-24 h-24 rounded-full overflow-hidden block select-none"
            style={{ boxShadow: '0 0 0 2.5px rgba(212,175,55,0.5)', transition: 'transform 0.14s cubic-bezier(0.25,1,0.5,1), opacity 0.1s ease-out' }}>
            {avatarSrc
              ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full gradient-gold flex items-center justify-center">
                  <span className="text-[32px] font-bold text-white">{initials}</span>
                </div>
            }
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          {!hasPhoto && (
            <div className="absolute bottom-0.5 right-0.5 w-7 h-7 gradient-gold rounded-full flex items-center justify-center pointer-events-none"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
              <Camera size={13} className="text-white" strokeWidth={2} />
            </div>
          )}
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 mb-1">
            <input ref={nameInputRef} value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }} onBlur={saveName}
              className="bg-bg-overlay rounded-[10px] px-3 py-1.5 text-[20px] font-bold text-ink text-center outline-none border border-gold/40"
              style={{ maxWidth: 240, colorScheme: 'dark' }} />
            <button onClick={saveName} className="w-7 h-7 gradient-gold rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={12} className="text-white" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button onClick={startEditName} className="flex items-center gap-1.5 mb-1 group select-none">
            <span className="text-[22px] font-bold text-ink tracking-[-0.02em]">
              {displayName ?? 'Set your name'}
            </span>
            <Pencil size={13} className="text-ink-faint group-active:text-gold transition-colors" strokeWidth={1.75} />
          </button>
        )}
        {email && <p className="text-[12px] text-ink-muted">{email}</p>}
      </div>

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

          {/* ── Habits ────────────────────────────────────────────────────────── */}
          <Card label="Habits" stat={<>You spend most on <span className="text-gold font-semibold">{WEEKDAYS_FULL[habits.weekday.indexOf(Math.max(...habits.weekday))]}</span></>}>
            <WeekdayBars values={habits.weekday} />
            <div className="grid grid-cols-2 gap-2 mt-4">
              <Record label="Typical purchase" value={$fk(habits.median)} sub="the median expense" />
              <Record label="Purchases a month" value={String(Math.round(habits.perMonth))} sub="on average" />
            </div>
          </Card>

          {/* ── Categories, all time ──────────────────────────────────────────── */}
          <Card label="Categories" stat="All time · last 90 days vs the 90 before">
            <RankPills tone="expense" items={stats.categories.map(c => ({
              name: c.name, value: c.total, display: $fk(c.total), icon: true,
              note: [`${Math.round(c.share * 100)}%`, trendNote(c.trend)].filter(Boolean).join(' · '),
            }))} />
          </Card>

          {/* ── Subscriptions ─────────────────────────────────────────────────── */}
          <Card label="Subscriptions" stat={<><span className="text-ink font-semibold">{$fk(stats.subs.monthly)}</span>/mo · {$fk(stats.subs.yearly)}/yr</>}>
            <RankPills tone="expense" items={stats.subs.list.slice(0, 6).map(s => ({
              name: s.name, value: s.monthly_cost, display: $fk(s.monthly_cost),
            }))} />
            <p className="text-[11px] text-ink-muted mt-3">
              {stats.subs.list.length} active · {$f(stats.subs.lifetime)} paid to subscriptions so far
            </p>
          </Card>

          {/* ── Income sources ────────────────────────────────────────────────── */}
          <Card label="Income sources" stat="All time · share of income">
            <RankPills tone="income" items={stats.sources.map(s => ({
              name: s.name, value: s.total, display: $fk(s.total),
              note: [`${Math.round(s.share * 100)}%`, trendNote(s.trend)].filter(Boolean).join(' · '),
            }))} />
          </Card>

          {/* ── All time ──────────────────────────────────────────────────────── */}
          <div className="px-5 mb-5">
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">
              All time{allTime.since ? ` · since ${allTime.since}` : ''}
            </p>
            <div className="bg-bg-surface border border-ink/[0.06] rounded-card px-4">
              <Row label="Earned" value={$f(allTime.earned)} accent />
              <Row label="Spent" value={$f(allTime.spent)} />
              <Row label="Kept" value={`${allTime.earned - allTime.spent < 0 ? MINUS : '+'}${$f(Math.abs(allTime.earned - allTime.spent))}`} accent={allTime.earned >= allTime.spent} />
              <Row label="Saved on discounts" value={$f(allTime.saved)} accent={allTime.saved > 0} />
              <Row label="Expenses logged" value={allTime.count.toLocaleString('en-US')} />
            </div>
          </div>
        </>
      )}

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }} />
    </div>
  )
}
