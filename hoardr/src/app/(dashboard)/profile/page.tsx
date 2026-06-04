'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Settings2, TrendingDown, TrendingUp, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, $f, $fk } from '@/lib/utils'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpRow  { cost: number; savings: number; date: string; name: string; categories: unknown }
interface IncRow  { amount: number; source: string | null; date: string; name: string | null }
interface BarData { label: string; income: number; expense: number }

// ─── Inline: cashflow bar chart (income up / expense down) ───────────────────

function CashflowBars({ bars, active, sparse }: { bars: BarData[]; active: boolean; sparse?: boolean }) {
  const [anim, setAnim] = useState(false)
  const HALF = 72 // px per half (above / below zero line)

  const maxVal = useMemo(
    () => Math.max(...bars.flatMap(b => [b.income, b.expense]), 1),
    [bars],
  )

  useEffect(() => {
    if (!active) { setAnim(false); return }
    const t = setTimeout(() => setAnim(true), 60)
    return () => clearTimeout(t)
  }, [active])

  const labelIndices = useMemo(() => {
    if (!sparse) return bars.map((_, i) => i)
    const last = bars.length - 1
    return [...new Set([0, 6, 13, 20, last].filter(i => i <= last))]
  }, [bars, sparse])

  return (
    <div>
      <div className="relative flex" style={{ height: HALF * 2 + 1 }}>
        {/* Zero line */}
        <div
          className="absolute left-0 right-0"
          style={{ top: HALF, height: 1, background: 'rgba(255,255,255,0.12)', zIndex: 1 }}
        />
        {bars.map((bar, i) => {
          const incH = anim ? Math.max((bar.income  / maxVal) * HALF, bar.income  > 0 ? 2 : 0) : 0
          const expH = anim ? Math.max((bar.expense / maxVal) * HALF, bar.expense > 0 ? 2 : 0) : 0
          const delay = i * 12
          return (
            <div key={i} className="flex-1 flex flex-col" style={{ gap: 0 }}>
              {/* Income bar — grows up from zero line */}
              <div style={{ height: HALF, display: 'flex', alignItems: 'flex-end' }}>
                <div
                  className="w-full rounded-t-[2px]"
                  style={{
                    height:     incH,
                    background: 'var(--sem-income)',
                    transition: `height 480ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
                  }}
                />
              </div>
              {/* Expense bar — grows down from zero line */}
              <div style={{ height: HALF, display: 'flex', alignItems: 'flex-start' }}>
                <div
                  className="w-full rounded-b-[2px]"
                  style={{
                    height:     expH,
                    background: '#D4AF37',
                    opacity:    0.7,
                    transition: `height 480ms cubic-bezier(0.22,1,0.36,1) ${delay}ms`,
                  }}
                />
              </div>
            </div>
          )
        })}
      </div>
      {/* X-axis labels */}
      <div className="flex mt-1" style={{ gap: 0 }}>
        {bars.map((bar, i) => (
          <div key={i} className="flex-1 text-center">
            {labelIndices.includes(i) && (
              <span className="text-[8px] text-ink-faint">{bar.label}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

function CashflowChart({ monthBars, annualBars }: { monthBars: BarData[]; annualBars: BarData[] }) {
  const [view, setView]     = useState<0 | 1>(0)
  const containerRef        = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    let sx = 0, sy = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const onEnd   = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && view === 0) setView(1)
        if (dx > 0 && view === 1) setView(0)
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd) }
  }, [view])

  return (
    <div ref={containerRef}>
      {/* Header row: pills + legend */}
      <div className="flex items-center gap-2 mb-4">
        {(['Month', 'Annual'] as const).map((label, i) => (
          <button
            key={label}
            onClick={() => setView(i as 0 | 1)}
            className={cn(
              'px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
              view === i ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted',
            )}
          >{label}</button>
        ))}
        <div className="flex gap-3 ml-auto items-center">
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ background: 'var(--sem-income)' }} />
            <span className="text-[9px] text-ink-faint">Income</span>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-gold opacity-70" />
            <span className="text-[9px] text-ink-faint">Spend</span>
          </div>
        </div>
      </div>

      {/* Sliding rail */}
      <div style={{ overflow: 'hidden' }}>
        <div
          style={{
            display:    'flex',
            width:      '200%',
            transform:  `translateX(${view === 0 ? 0 : -50}%)`,
            transition: 'transform 320ms cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          <div style={{ width: '50%' }}>
            <CashflowBars bars={monthBars} active={view === 0} sparse />
          </div>
          <div style={{ width: '50%' }}>
            <CashflowBars bars={annualBars} active={view === 1} />
          </div>
        </div>
      </div>

      {/* Page dots */}
      <div className="flex justify-center gap-1.5 mt-3">
        {[0, 1].map(i => (
          <div
            key={i}
            className="rounded-full transition-all duration-300"
            style={{
              width:      view === i ? 14 : 5,
              height:     5,
              background: view === i ? '#D4AF37' : 'rgba(255,255,255,0.2)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

// ─── Inline: category pill bars ───────────────────────────────────────────────

function CategoryPills({ cats }: { cats: { name: string; total: number; pct: number }[] }) {
  const [animPcts, setAnimPcts] = useState<number[]>(cats.map(() => 0))

  useEffect(() => {
    const timers = cats.map((_, i) =>
      setTimeout(() => setAnimPcts(prev => {
        const next = [...prev]; next[i] = cats[i].pct; return next
      }), 60 + i * 90),
    )
    return () => timers.forEach(clearTimeout)
  }, [cats])

  return (
    <div className="space-y-2.5">
      {cats.map((cat, i) => {
        const Icon = getCategoryIcon(cat.name, 'Expense')
        return (
          <div key={cat.name} className="flex items-center gap-2">
            {/* Bar */}
            <div
              className="relative flex-1 flex items-center rounded-[8px] overflow-hidden"
              style={{ height: 32, background: '#1C2A36' }}
            >
              <div
                className="absolute inset-y-0 left-0 rounded-[8px]"
                style={{
                  width:      `${animPcts[i]}%`,
                  background: 'linear-gradient(90deg, rgba(212,175,55,0.35), rgba(212,175,55,0.10))',
                  transition: `width 600ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms`,
                }}
              />
              <div className="relative flex items-center gap-2 px-2.5 z-10">
                <Icon size={13} className="text-gold flex-shrink-0" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-ink truncate">{cat.name}</span>
              </div>
            </div>
            {/* Amount — always right of bar, never below */}
            <span className="text-[12px] font-semibold font-mono text-ink-muted w-12 text-right flex-shrink-0">
              {$fk(cat.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sectionLabel(text: string) {
  return <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">{text}</p>
}

function StatTile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div className="bg-bg-overlay rounded-[16px] p-3.5">
      <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-1">{label}</p>
      <p className="text-[22px] font-bold text-ink leading-none" style={{ fontFamily: 'var(--font-big-shoulders)', color: color ?? 'inherit' }}>{value}</p>
      {sub && <p className="text-[10px] text-ink-muted mt-1">{sub}</p>}
    </div>
  )
}

function Row({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
      <div>
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
      </div>
      <p className={cn('text-[15px] font-semibold font-mono', accent ? 'text-emerald' : 'text-ink')}>{value}</p>
    </div>
  )
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // User identity
  const [userId,        setUserId]        = useState<string | null>(null)
  const [email,         setEmail]         = useState<string | null>(null)
  const [googleAvatar,  setGoogleAvatar]  = useState<string | null>(null)
  const [customAvatar,  setCustomAvatar]  = useState<string | null>(null)
  const [displayName,   setDisplayName]   = useState<string | null>(null)
  const [editingName,   setEditingName]   = useState(false)
  const [nameInput,     setNameInput]     = useState('')
  const [uploading,     setUploading]     = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Raw data
  const [expenses,   setExpenses]   = useState<ExpRow[]>([])
  const [income,     setIncome]     = useState<IncRow[]>([])
  const [netWorth,   setNetWorth]   = useState(0)
  const [loading,    setLoading]    = useState(true)

  // ── Load user ──────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setUserId(u.id)
      setEmail(u.email ?? null)
      setGoogleAvatar(u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null)
      // fallback name from OAuth metadata
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
  const abortRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const gen = ++loadGen.current
    try {
      const [bRes, eRes, iRes] = await Promise.all([
        supabase.from('banks').select('balance').abortSignal(ctrl.signal),
        supabase.from('expenses').select('cost, savings, date, name, categories(name)').limit(5000).abortSignal(ctrl.signal),
        supabase.from('income').select('amount, source, date, name').limit(5000).abortSignal(ctrl.signal),
      ])
      if (gen !== loadGen.current) return
      if (bRes.error) console.error('[Profile] banks:', bRes.error)
      if (eRes.error) console.error('[Profile] expenses:', eRes.error)
      if (iRes.error) console.error('[Profile] income:', iRes.error)
      const banks = (bRes.data ?? []) as { balance: number }[]
      setNetWorth(banks.reduce((s, b) => s + ((b.balance as number) ?? 0), 0))
      setExpenses((eRes.data ?? []) as ExpRow[])
      setIncome((iRes.data ?? []) as IncRow[])
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[Profile] loadData:', err)
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
    return () => { loadGen.current++; abortRef.current?.abort() }
  }, [loadData])

  // ── Display name editing ───────────────────────────────────────────────────

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

  // ── Derived analytics ──────────────────────────────────────────────────────

  const now        = new Date()
  const moKey      = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`
  const lastMoDate = new Date(now.getFullYear(), now.getMonth() - 1, 1)
  const lastMoKey  = `${lastMoDate.getFullYear()}-${String(lastMoDate.getMonth() + 1).padStart(2, '0')}`

  const moExpenses  = useMemo(() => expenses.filter(e => e.date.startsWith(moKey)), [expenses, moKey])
  const moIncome    = useMemo(() => income.filter(i => i.date.startsWith(moKey)),   [income, moKey])
  const lastMoExp   = useMemo(() => expenses.filter(e => e.date.startsWith(lastMoKey)), [expenses, lastMoKey])

  const moSpend     = useMemo(() => moExpenses.reduce((s, e) => s + e.cost,   0), [moExpenses])
  const moIncomeAmt = useMemo(() => moIncome.reduce((s, i) => s + i.amount,   0), [moIncome])
  const moCashflow  = moIncomeAmt - moSpend
  const lastMoSpend = useMemo(() => lastMoExp.reduce((s, e) => s + e.cost,    0), [lastMoExp])
  const spendTrend  = lastMoSpend > 0 ? ((moSpend - lastMoSpend) / lastMoSpend) * 100 : 0

  const allTimeSpent   = useMemo(() => expenses.reduce((s, e) => s + e.cost,           0), [expenses])
  const allTimeSavings = useMemo(() => expenses.reduce((s, e) => s + (e.savings ?? 0), 0), [expenses])
  const savingsRate    = moIncomeAmt > 0 ? Math.max(0, ((moIncomeAmt - moSpend) / moIncomeAmt) * 100) : 0

  // Average monthly spend (last 12 months of data that exist)
  const avgMonthlySpend = useMemo(() => {
    const monthly = new Map<string, number>()
    expenses.forEach(e => {
      const k = e.date.slice(0, 7)
      monthly.set(k, (monthly.get(k) ?? 0) + e.cost)
    })
    if (monthly.size === 0) return 0
    return [...monthly.values()].reduce((s, v) => s + v, 0) / monthly.size
  }, [expenses])

  // Top 5 categories by all-time spend
  const topCategories = useMemo(() => {
    const map = new Map<string, number>()
    expenses.forEach(e => {
      const cat = (e.categories as { name: string } | null)?.name ?? 'Other'
      map.set(cat, (map.get(cat) ?? 0) + e.cost)
    })
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
    const top1   = sorted[0]?.[1] ?? 1
    return sorted.map(([name, total]) => ({ name, total, pct: (total / top1) * 100 }))
  }, [expenses])

  // Best income source (by all-time total)
  const bestIncomeSource = useMemo(() => {
    const map = new Map<string, number>()
    income.forEach(i => {
      const key = i.name || i.source || 'Other'
      map.set(key, (map.get(key) ?? 0) + i.amount)
    })
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  }, [income])

  // Cashflow chart data
  const monthBars = useMemo<BarData[]>(() => {
    const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return Array.from({ length: daysInMonth }, (_, idx) => {
      const d    = idx + 1
      const date = `${moKey}-${String(d).padStart(2, '0')}`
      const inc  = income.filter(i => i.date === date).reduce((s, i) => s + i.amount, 0)
      const exp  = expenses.filter(e => e.date === date).reduce((s, e) => s + e.cost, 0)
      return { label: String(d), income: inc, expense: exp }
    })
  }, [expenses, income, moKey, now])

  const annualBars = useMemo<BarData[]>(() => {
    return Array.from({ length: 12 }, (_, idx) => {
      const date = new Date(now.getFullYear(), now.getMonth() - 11 + idx, 1)
      const key  = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
      const inc  = income.filter(i => i.date.startsWith(key)).reduce((s, i) => s + i.amount, 0)
      const exp  = expenses.filter(e => e.date.startsWith(key)).reduce((s, e) => s + e.cost, 0)
      return { label: MONTH_NAMES[date.getMonth()], income: inc, expense: exp }
    })
  }, [expenses, income, now])

  // ── Render ────────────────────────────────────────────────────────────────

  const avatarSrc = customAvatar || googleAvatar
  const hasPhoto  = !!avatarSrc
  const initials  = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">

      {/* ── Top bar ─────────────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}
      >
        <button
          onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:opacity-70"
        >
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <button
          onClick={() => router.push('/settings')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:opacity-70"
        >
          <Settings2 size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* ── Avatar + identity ───────────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-5 pt-4 pb-6">
        <div className="relative mb-4">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="w-24 h-24 rounded-full overflow-hidden block active:opacity-80 transition-opacity"
            style={{ boxShadow: '0 0 0 2.5px rgba(212,175,55,0.5)' }}
          >
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
          {/* Camera badge — only when no photo is set */}
          {!hasPhoto && (
            <div
              className="absolute bottom-0.5 right-0.5 w-7 h-7 gradient-gold rounded-full flex items-center justify-center pointer-events-none"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}
            >
              <Camera size={13} className="text-white" strokeWidth={2} />
            </div>
          )}
        </div>

        {/* Editable display name */}
        {editingName ? (
          <div className="flex items-center gap-2 mb-1">
            <input
              ref={nameInputRef}
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }}
              onBlur={saveName}
              className="bg-bg-overlay rounded-[10px] px-3 py-1.5 text-[20px] font-bold text-ink text-center outline-none border border-gold/40"
              style={{ maxWidth: 240, colorScheme: 'dark' }}
            />
            <button onClick={saveName} className="w-7 h-7 gradient-gold rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={12} className="text-white" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button
            onClick={startEditName}
            className="flex items-center gap-1.5 mb-1 group active:opacity-70"
          >
            <span className="text-[22px] font-bold text-ink tracking-[-0.02em]">
              {displayName ?? 'Set your name'}
            </span>
            <Pencil size={13} className="text-ink-faint group-active:text-gold transition-colors" strokeWidth={1.75} />
          </button>
        )}

        {email && <p className="text-[12px] text-ink-muted">{email}</p>}
      </div>

      {/* ── Stats trio ──────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Net Worth"  value={$fk(netWorth)}    color="#D4AF37" />
          <StatTile label="Mo. Spend"  value={$fk(moSpend)}     />
          <StatTile label="Mo. Income" value={$fk(moIncomeAmt)} color="var(--sem-income)" />
        </div>
      </div>

      {/* ── Cashflow ────────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        {sectionLabel('Cashflow')}
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
          {/* Hero net number */}
          <div className="flex items-baseline gap-2 mb-4">
            <span
              className="text-[32px] font-bold leading-none"
              style={{ fontFamily: 'var(--font-big-shoulders)', color: moCashflow >= 0 ? 'var(--sem-income)' : '#ef4444' }}
            >
              {moCashflow >= 0 ? '+' : '−'}{$f(Math.abs(moCashflow))}
            </span>
            <span className="text-[12px] text-ink-muted">this month</span>
            {lastMoSpend > 0 && (
              <span className={cn('text-[11px] font-semibold ml-auto', spendTrend > 0 ? 'text-ruby' : 'text-emerald')}>
                {spendTrend > 0 ? '↑' : '↓'}{Math.abs(spendTrend).toFixed(0)}% spend vs last mo.
              </span>
            )}
          </div>
          {!loading && <CashflowChart monthBars={monthBars} annualBars={annualBars} />}
        </div>
      </div>

      {/* ── Top 5 categories ────────────────────────────────────────────────── */}
      {topCategories.length > 0 && (
        <div className="px-5 mb-5">
          {sectionLabel('Top Spending Categories')}
          <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
            <CategoryPills cats={topCategories} />
          </div>
        </div>
      )}

      {/* ── Income breakdown ────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        {sectionLabel('Income')}
        <div className="bg-bg-surface border border-white/[0.06] rounded-card px-4">
          {bestIncomeSource && (
            <Row
              label="Top Generator"
              value={$fk(bestIncomeSource[1])}
              sub={bestIncomeSource[0]}
              accent
            />
          )}
          <Row label="This Month"   value={$f(moIncomeAmt)}      accent />
          <Row label="Savings Rate" value={`${savingsRate.toFixed(0)}%`} accent={savingsRate > 20} />
        </div>
      </div>

      {/* ── All time ────────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        {sectionLabel('All Time')}
        <div className="bg-bg-surface border border-white/[0.06] rounded-card px-4">
          <Row label="Total Spent"       value={$f(allTimeSpent)}     />
          <Row label="Total Saved"       value={$f(allTimeSavings)}   accent={allTimeSavings > 0} />
          <Row label="Avg Monthly Spend" value={$f(avgMonthlySpend)}  />
        </div>
      </div>

      {/* ── Hidden file input ───────────────────────────────────────────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }}
      />
    </div>
  )
}
