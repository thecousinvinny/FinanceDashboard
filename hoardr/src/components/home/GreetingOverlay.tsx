'use client'

import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { $fd, $fk, localToday, nextRenewalDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { calFetch } from '@/lib/calendar'
import type { BillingCycle } from '@/types'
import type { Session } from '@supabase/supabase-js'
import { GREET_BOOT_CLASS } from '@/lib/greeting-boot'
import { replayActiveScreen } from '@/lib/tab-nav'
import { LoadBars } from '@/components/ui/LoadBars'

/**
 * Daily brief shown when the app opens. Doubles as the warm-up screen: while
 * it's up, ScreenKeepAlive mounts and loads every tab behind it, so the app is
 * instant once it's dismissed.
 */

const LS_AVATAR = 'hoardr-avatar-url'
const LS_NAME   = 'hoardr-greeting-name'
const SHOW_EVENT = 'hoardr-show-greeting'

/** Open the brief now, skipping the once-per-launch rule (Settings → Preview). */
export function showGreeting() {
  window.dispatchEvent(new Event(SHOW_EVENT))
}

const M = 'var(--font-montserrat)'

/** Google avatar URLs carry a size suffix (=s96-c); ask for a banner-sized one. */
function hiRes(url: string) {
  return /googleusercontent\.com/.test(url) ? url.replace(/=s\d+(-c)?$/, '=s720-c') : url
}

/** Resolves once the image is decoded (or failed, or 1.5s passed); never rejects. */
function preloadImage(src: string): Promise<void> {
  return new Promise(resolve => {
    const img = new Image()
    const done = () => resolve()
    const t = setTimeout(done, 1500)
    img.onload = () => { clearTimeout(t); (img.decode ? img.decode() : Promise.resolve()).then(done, done) }
    img.onerror = () => { clearTimeout(t); done() }
    img.src = src
  })
}

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Good night'
}

const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
function addDays(ds: string, n: number) { const [y, m, d] = ds.split('-').map(Number); return ymd(new Date(y, m - 1, d + n)) }
function dayLabel(ds: string, today: string) {
  if (ds === today) return 'Today'
  if (ds === addDays(today, 1)) return 'Tomorrow'
  const [y, m, d] = ds.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { weekday: 'short' })
}
function fmtTime(hhmm: string) {
  const [h, m] = hhmm.split(':').map(Number)
  return `${h % 12 || 12}${m ? `:${pad(m)}` : ''}${h >= 12 ? 'pm' : 'am'}`
}
function advancePay(ds: string, freq: string) {
  const [y, m, d] = ds.split('-').map(Number)
  const dt = freq === 'Weekly' ? new Date(y, m - 1, d + 7) : freq === 'Biweekly' ? new Date(y, m - 1, d + 14)
           : freq === 'Semimonthly' ? new Date(y, m - 1, d + 15) : new Date(y, m, d)
  return ymd(dt)
}

interface UpItem { date: string; title: string; amount: number; kind: 'bill' | 'pay' }
interface TodayEv { title: string; time: string | null }
interface Brief {
  spent: number; income: number; lastMonthToDate: number
  upcoming: UpItem[]; today: TodayEv[] | null
  netWorth: number; enRoute: number
  /** Running spend total per day: this month up to today, last month in full */
  cum: number[]; prevCum: number[]
  daysInMonth: number
  topCat: { name: string; amount: number } | null
}

const CH_W = 300, CH_H = 64
/** SVG paths for the spend-pace chart (this month vs last month, cumulative) */
function paceChart(b: Brief) {
  const max = Math.max(b.cum[b.cum.length - 1] ?? 0, b.prevCum[b.prevCum.length - 1] ?? 0, 1) * 1.1
  const x = (i: number) => (b.daysInMonth <= 1 ? 0 : (i / (b.daysInMonth - 1)) * CH_W)
  const y = (v: number) => CH_H - (v / max) * CH_H
  const line = (pts: number[]) => pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const prev = b.prevCum.slice(0, b.daysInMonth)
  const cur  = line(b.cum)
  const lastI = b.cum.length - 1
  return {
    cur,
    area: b.cum.length ? `${cur}L${x(lastI).toFixed(1)},${CH_H}L0,${CH_H}Z` : '',
    prev: line(prev),
    dot: { left: `${(x(lastI) / CH_W) * 100}%`, top: `${(y(b.cum[lastI] ?? 0) / CH_H) * 100}%` },
  }
}

export function GreetingOverlay() {
  const [show,     setShow]     = useState(false)
  const [ready,    setReady]    = useState(false)   // card may enter
  const [waiting,  setWaiting]  = useState(false)   // show the spinner
  const [exiting,  setExiting]  = useState(false)
  const [name,     setName]     = useState('')
  const [avatar,   setAvatar]   = useState<string | null>(null)
  const [brief,    setBrief]    = useState<Brief | null>(null)
  const [greeting, setGreeting] = useState('')
  const [todayStr, setTodayStr] = useState('')
  const genRef = useRef(0)
  // 0 = the automatic showing at launch; each manual preview bumps it
  const [runKey, setRunKey] = useState(0)
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Layout effect: the scrim is up before the first paint after hydration, so
  // the page never flashes underneath before the brief appears.
  useLayoutEffect(() => {
    // At launch the <head> script has already decided (lib/greeting-boot.ts)
    if (runKey === 0 && !document.documentElement.classList.contains(GREET_BOOT_CLASS)) return
    setReady(false); setWaiting(false); setExiting(false); setBrief(null)
    const today = localToday()
    setTodayStr(today)
    setGreeting(timeGreeting())
    const cachedName = localStorage.getItem(LS_NAME)
    if (cachedName) setName(cachedName)
    const cachedAvatar = localStorage.getItem(LS_AVATAR)
    // Start fetching the banner image right away; it's the slowest asset
    if (cachedAvatar) { setAvatar(cachedAvatar); preloadImage(hiRes(cachedAvatar)) }

    setShow(true)
    // Everything (numbers, today's events, the banner image) lands in one
    // reveal. This cap only matters on a very slow connection.
    const readyTimer = setTimeout(() => setReady(true), 3000)
    // A quiet spinner only if the wait is noticeable
    const waitTimer = setTimeout(() => setWaiting(true), 450)
    const gen = ++genRef.current

    async function loadData() {
      const supabase = createClient()

      // Wait for the session — check now, then listen briefly for it
      let resolved = false
      const session = await new Promise<Session | null>((resolve) => {
        const done = (sess: Session | null) => { if (!resolved) { resolved = true; resolve(sess) } }
        supabase.auth.getSession().then(({ data }) => { if (data.session) done(data.session) })
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, sess) => {
          if (sess) { authSubRef.current = null; subscription.unsubscribe(); done(sess) }
        })
        authSubRef.current = subscription
        setTimeout(() => { authSubRef.current = null; subscription.unsubscribe(); done(null) }, 5000)
      })
      if (gen !== genRef.current) return
      if (!session) { setReady(true); return }

      const monthStart = `${today.slice(0, 7)}-01`
      const [ty, tm, td] = today.split('-').map(Number)
      const lmStart = ymd(new Date(ty, tm - 2, 1))
      // Same day-of-month last month, clamped to that month's length
      const lmSameDay = ymd(new Date(ty, tm - 2, Math.min(td, new Date(ty, tm - 1, 0).getDate())))
      const weekEnd = addDays(today, 7)

      // Profile first-class: today's calendar hangs off its calendar ids, so it
      // starts as soon as the profile is back instead of after everything else.
      const profileP = supabase.from('profiles').select('display_name, avatar_url, calendar_prefs').eq('id', session.user.id).single()
      const todayP = profileP.then(async ({ data: profile }): Promise<TodayEv[]> => {
        const calIds = ((profile?.calendar_prefs as { googleCalendarIds?: string[] } | null)?.googleCalendarIds) ?? []
        if (calIds.length === 0) return []
        const tMin = new Date(ty, tm - 1, td).toISOString()
        const tMax = new Date(ty, tm - 1, td, 23, 59, 59).toISOString()
        const lists = await Promise.all(calIds.map(id =>
          calFetch(`/api/calendar?action=events&calendarId=${encodeURIComponent(id)}&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`)
            .then(r => r.ok ? r.json() : { items: [] })
            .then((d: { items?: Array<{ summary?: string; start: { date?: string; dateTime?: string } }> }) => d.items ?? [])
            .catch(() => [])
        ))
        return lists.flat().map(e => ({
          title: e.summary ?? '(no title)',
          time:  e.start.dateTime ? e.start.dateTime.slice(11, 16) : null,
        })).sort((a, b) => (a.time ?? '').localeCompare(b.time ?? ''))
      })
      // The banner image can preload while the numbers are still in flight
      const avatarP = profileP.then(({ data: profile }) => {
        const url = (profile?.avatar_url as string | null)
          ?? (session.user.user_metadata?.avatar_url as string | null)
          ?? (session.user.user_metadata?.picture as string | null) ?? null
        return url ? preloadImage(hiRes(url)).then(() => url) : null
      })

      const [
        { data: expData }, { data: incData }, { data: subs }, { data: streams },
        { data: banks }, { data: wish }, { data: profile }, todayEvs, avatarUrl,
      ] = await Promise.all([
        supabase.from('expenses').select('cost, date, categories(name)').gte('date', lmStart).lte('date', today),
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('subscriptions').select('name, cost, billing, next_renewal').eq('status', 'Active'),
        supabase.from('revenue_streams').select('name, amount, freq, next_pay_date'),
        supabase.from('banks').select('balance'),
        supabase.from('wishlist').select('id').eq('status', 'Ordered'),
        profileP, todayP, avatarP,
      ])
      if (gen !== genRef.current) return

      const exp = (expData ?? []) as unknown as { cost: number; date: string; categories: { name: string } | null }[]
      const spent = exp.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
      const lastMonthToDate = exp.filter(e => e.date < monthStart && e.date <= lmSameDay).reduce((s, e) => s + Number(e.cost), 0)

      // Per-day spend → running totals for the pace chart
      const daysInMonth = new Date(ty, tm, 0).getDate()
      const prevDays    = new Date(ty, tm - 1, 0).getDate()
      const daily = new Array<number>(td).fill(0)
      const prevDaily = new Array<number>(prevDays).fill(0)
      const byCat = new Map<string, number>()
      for (const e of exp) {
        const day = Number(e.date.slice(8, 10)) - 1
        if (e.date >= monthStart) {
          if (day < td) daily[day] += Number(e.cost)
          const cat = e.categories?.name ?? 'Other'
          byCat.set(cat, (byCat.get(cat) ?? 0) + Number(e.cost))
        } else if (day < prevDays) prevDaily[day] += Number(e.cost)
      }
      const running = (a: number[]) => { let t = 0; return a.map(v => (t += v)) }
      const top = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0]
      const income = (incData ?? []).reduce((s, r) => s + Number(r.amount), 0)

      const upcoming: UpItem[] = []
      for (const s of subs ?? []) {
        if (!s.next_renewal || !s.billing) continue
        let d = String(s.next_renewal)
        while (d < today) d = nextRenewalDate(d, s.billing as BillingCycle)
        if (d <= weekEnd) upcoming.push({ date: d, title: String(s.name), amount: Number(s.cost), kind: 'bill' })
      }
      for (const r of streams ?? []) {
        if (!r.next_pay_date || !r.freq) continue
        let d = String(r.next_pay_date)
        while (d < today) d = advancePay(d, String(r.freq))
        if (d <= weekEnd) upcoming.push({ date: d, title: String(r.name), amount: Number(r.amount), kind: 'pay' })
      }
      upcoming.sort((a, b) => a.date.localeCompare(b.date) || (a.kind === 'pay' ? -1 : 1))

      const fullName = (profile?.display_name as string | null) ?? (session.user.user_metadata?.full_name as string | null) ?? ''
      const firstName = fullName.split(' ')[0]
      if (firstName) { setName(firstName); localStorage.setItem(LS_NAME, firstName) }
      if (avatarUrl) { setAvatar(avatarUrl); localStorage.setItem(LS_AVATAR, avatarUrl) }

      setBrief({
        spent, income, lastMonthToDate, upcoming, today: todayEvs,
        netWorth: (banks ?? []).reduce((s, b) => s + Number(b.balance ?? 0), 0),
        enRoute: (wish ?? []).length,
        cum: running(daily), prevCum: running(prevDaily), daysInMonth,
        topCat: top ? { name: top[0], amount: top[1] } : null,
      })
      setReady(true)
    }

    loadData().catch(() => { if (gen === genRef.current) setReady(true) })
    return () => {
      genRef.current++; clearTimeout(readyTimer); clearTimeout(waitTimer)
      authSubRef.current?.unsubscribe(); authSubRef.current = null
    }
  }, [runKey])

  useEffect(() => {
    const onShow = () => setRunKey(k => k + 1)
    window.addEventListener(SHOW_EVENT, onShow)
    return () => window.removeEventListener(SHOW_EVENT, onShow)
  }, [])

  // Our backdrop is up: drop the boot cover that hid the page until now
  useLayoutEffect(() => {
    if (show) document.documentElement.classList.remove(GREET_BOOT_CLASS)
  }, [show])

  function dismiss() {
    // The screen's entrance animations ran unseen behind the backdrop; replay
    // them as it fades away
    replayActiveScreen()
    setExiting(true)
    setTimeout(() => setShow(false), 340)
  }

  if (!show) return null

  const net  = (brief?.income ?? 0) - (brief?.spent ?? 0)
  const pace = brief && brief.lastMonthToDate > 0 ? ((brief.spent - brief.lastMonthToDate) / brief.lastMonthToDate) * 100 : null
  const projected = brief && brief.cum.length ? (brief.spent / brief.cum.length) * brief.daysInMonth : null
  const chart = brief ? paceChart(brief) : null
  const dateLine = todayStr
    ? new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''
  const upShown = brief?.upcoming.slice(0, 3) ?? []
  const upMore  = (brief?.upcoming.length ?? 0) - upShown.length
  const billsDue = brief?.upcoming.filter(u => u.kind === 'bill').reduce((s, u) => s + u.amount, 0) ?? 0
  const payDue   = brief?.upcoming.filter(u => u.kind === 'pay').reduce((s, u) => s + u.amount, 0) ?? 0
  const evShown = brief?.today?.slice(0, 3) ?? []
  const evMore  = (brief?.today?.length ?? 0) - evShown.length

  const muted = 'rgb(var(--rgb-ink-muted))'
  const ink   = 'rgb(var(--rgb-ink))'
  const hair  = 'rgb(var(--rgb-ink) / 0.07)'
  const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: muted, fontFamily: M }
  const head: React.CSSProperties = { display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 10 }
  const section = (d: number): React.CSSProperties => ({ padding: '13px 0', borderTop: `1px solid ${hair}`, ['--d' as string]: `${d}ms` })
  const statNum: React.CSSProperties = { fontSize: 15, fontWeight: 600, color: ink, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }
  const statLbl: React.CSSProperties = { fontSize: 11, color: muted, marginBottom: 2 }
  const cell = (i: number): React.CSSProperties => ({ flex: 1, minWidth: 0, paddingLeft: i ? 12 : 0, borderLeft: i ? `1px solid ${hair}` : 'none' })

  return (
    <div
      onClick={ready ? dismiss : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'env(safe-area-inset-top, 44px) 16px env(safe-area-inset-bottom, 34px)',
        boxSizing: 'border-box',
        // No backdrop blur: re-blurring the page while every tab mounts behind
        // it is what made the entrance stutter.
        // Opaque: nothing of the app (still mounting and animating) shows through
        background: 'radial-gradient(110% 70% at 50% 30%, rgb(var(--rgb-bg-surface) / 0.7), transparent 70%), var(--color-bg-base)',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 340ms ease',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {!ready && waiting && <LoadBars style={{ position: 'absolute' }} />}

      {/* Same card on phone and desktop: max 380px, narrower only on small screens */}
      {ready && <div className={exiting ? 'greet-card-out' : 'greet-card-in'} style={{
        position: 'relative',
        // Fills the screen (less the "tap to continue" line): the photo takes
        // whatever the stats leave, so nothing scrolls on phone or desktop
        width: '100%', maxWidth: 380,
        height: 'min(calc(100dvh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 76px), 900px)',
        borderRadius: 28, overflow: 'hidden',
        background: 'var(--color-bg-surface)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 0.5px rgb(var(--rgb-ink) / 0.10)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* One scroller: the photo scrolls away with the card on short screens */}
        <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflowY: 'auto', overscrollBehavior: 'contain' }}>
        {/* Hero: the profile photo takes the top of the card, greeting where it fades out */}
        <div style={{ position: 'relative', flex: '1 0 150px', overflow: 'hidden', background: '#0c0c0f' }}>
          {avatar ? (
            <img
              src={hiRes(avatar)} alt="" draggable={false}
              className="greet-banner-img"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 25%' }}
            />
          ) : (
            <div className="greet-banner-img" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, #E9CD7A 0%, #B08A2A 55%, #3a2c08 100%)' }} />
          )}
          {/* Dark wash for legibility, fading into the card */}
          <div style={{
            position: 'absolute', inset: 0,
            background: 'linear-gradient(180deg, rgba(6,6,9,0) 38%, rgba(6,6,9,0.45) 65%, rgba(6,6,9,0.85) 86%, var(--color-bg-surface) 100%)',
          }} />
          <div style={{ position: 'absolute', left: 22, right: 22, bottom: 8 }}>
            <p style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.6)', fontFamily: M }}>{dateLine}</p>
            <h1 style={{ marginTop: 4, fontSize: 26, fontWeight: 600, letterSpacing: '-0.02em', color: '#fff', lineHeight: 1.15, fontFamily: M, textShadow: '0 2px 14px rgba(0,0,0,0.4)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {greeting}{name ? `, ${name}` : ''}
            </h1>
          </div>
        </div>

        <div style={{ flexShrink: 0, padding: '2px 22px 4px', fontFamily: M }}>
          {/* Month so far: number, pace chart, three stats */}
          <section className="greet-rise" style={{ padding: '10px 0 14px', ['--d' as string]: '120ms' }}>
            <div style={head}>
              <span style={label}>Spent this month</span>
              {pace !== null && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: pace <= 0 ? 'var(--sem-income)' : '#ef4444', whiteSpace: 'nowrap' }}>
                  {pace <= 0 ? '↓' : '↑'} {Math.abs(pace).toFixed(0)}% vs last month
                </span>
              )}
            </div>
            <p style={{ fontSize: 40, fontWeight: 700, letterSpacing: '-0.02em', lineHeight: 1, color: ink, fontFamily: 'var(--font-big-shoulders)' }}>
              {brief ? $fd(brief.spent) : '—'}
            </p>

            {chart && (
              <div style={{ position: 'relative', marginTop: 14, height: CH_H }}>
                <svg viewBox={`0 0 ${CH_W} ${CH_H}`} preserveAspectRatio="none" width="100%" height={CH_H} style={{ display: 'block', overflow: 'visible' }}>
                  <defs>
                    <linearGradient id="greet-area" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#D4AF37" stopOpacity="0.28" />
                      <stop offset="100%" stopColor="#D4AF37" stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <line x1="0" x2={CH_W} y1={CH_H} y2={CH_H} stroke="rgb(var(--rgb-ink) / 0.08)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
                  {chart.prev && <path d={chart.prev} fill="none" stroke="rgb(var(--rgb-ink) / 0.28)" strokeWidth="1.5" strokeDasharray="3 4" strokeLinecap="round" vectorEffect="non-scaling-stroke" />}
                  {chart.area && <path d={chart.area} fill="url(#greet-area)" />}
                  <path d={chart.cur} fill="none" stroke="#D4AF37" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
                </svg>
                <span style={{ position: 'absolute', left: chart.dot.left, top: chart.dot.top, width: 8, height: 8, marginLeft: -4, marginTop: -4, borderRadius: '50%', background: '#D4AF37', boxShadow: '0 0 0 3px rgb(212 175 55 / 0.22)' }} />
                {/* Draws the chart in left to right */}
                <div className="greet-wipe" style={{ position: 'absolute', top: -8, bottom: -2, left: -6, right: -8, background: 'var(--color-bg-surface)', ['--d' as string]: '380ms' }} />
              </div>
            )}
            {chart && (
              <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 10.5, color: muted }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 2, borderRadius: 2, background: '#D4AF37' }} />This month</span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><i style={{ width: 10, height: 0, borderTop: '1.5px dashed rgb(var(--rgb-ink) / 0.35)' }} />Last month</span>
              </div>
            )}

            <div style={{ display: 'flex', marginTop: 14 }}>
              <div style={cell(0)}>
                <p style={statLbl}>Income</p>
                <p style={{ ...statNum, color: 'var(--sem-income)' }}>{brief ? `+${$fk(brief.income)}` : '—'}</p>
              </div>
              <div style={cell(1)}>
                <p style={statLbl}>Net</p>
                <p style={{ ...statNum, color: net >= 0 ? 'var(--sem-income)' : '#ef4444' }}>{brief ? `${net >= 0 ? '+' : '−'}${$fk(Math.abs(net))}` : '—'}</p>
              </div>
              <div style={cell(2)}>
                <p style={statLbl}>On pace for</p>
                <p style={statNum}>{projected !== null ? $fk(projected) : '—'}</p>
              </div>
            </div>
          </section>

          {/* Today */}
          <section className="greet-rise" style={section(220)}>
            <div style={head}>
              <span style={label}>Today</span>
              {!!brief?.today?.length && <span style={{ fontSize: 11.5, color: muted }}>{brief.today.length} {brief.today.length === 1 ? 'event' : 'events'}</span>}
            </div>
            {brief?.today == null || evShown.length === 0 ? (
              <p style={{ fontSize: 14, color: muted }}>Nothing on the calendar</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {evShown.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
                    <span style={{ width: 52, flexShrink: 0, fontSize: 12.5, color: muted, fontVariantNumeric: 'tabular-nums' }}>{e.time ? fmtTime(e.time) : 'All day'}</span>
                    <span style={{ fontSize: 14.5, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                  </div>
                ))}
                {evMore > 0 && <p style={{ fontSize: 12.5, color: muted, paddingLeft: 64 }}>+{evMore} more</p>}
              </div>
            )}
          </section>

          {/* Next 7 days */}
          <section className="greet-rise" style={section(300)}>
            <div style={head}>
              <span style={label}>Next 7 days</span>
              {brief && (billsDue > 0 || payDue > 0) && (
                <span style={{ fontSize: 11.5, color: muted, whiteSpace: 'nowrap' }}>
                  {billsDue > 0 && <>{$fk(billsDue)} out</>}
                  {billsDue > 0 && payDue > 0 && ' · '}
                  {payDue > 0 && <span style={{ color: 'var(--sem-income)' }}>+{$fk(payDue)} in</span>}
                </span>
              )}
            </div>
            {upShown.length === 0 ? (
              <p style={{ fontSize: 14, color: muted }}>No bills or paydays coming up</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {upShown.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: u.kind === 'pay' ? 'var(--sem-income)' : '#D4AF37' }} />
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: ink, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</span>
                    <span style={{ fontSize: 12.5, color: muted }}>{dayLabel(u.date, todayStr)}</span>
                    <span style={{ width: 62, textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: u.kind === 'pay' ? 'var(--sem-income)' : ink }}>
                      {u.kind === 'pay' ? '+' : ''}{$fk(u.amount)}
                    </span>
                  </div>
                ))}
                {upMore > 0 && <p style={{ fontSize: 12.5, color: muted, paddingLeft: 16 }}>+{upMore} more</p>}
              </div>
            )}
          </section>

          {/* Footnotes */}
          <section className="greet-rise" style={{ ...section(380), display: 'flex' }}>
            <div style={cell(0)}>
              <p style={statLbl}>Net worth</p>
              <p style={statNum}>{brief ? $fk(brief.netWorth) : '—'}</p>
            </div>
            <div style={cell(1)}>
              <p style={statLbl}>Top category</p>
              <p style={statNum}>{brief?.topCat ? brief.topCat.name : '—'}</p>
            </div>
            <div style={cell(2)}>
              <p style={statLbl}>On the way</p>
              <p style={statNum}>{brief ? `${brief.enRoute} ${brief.enRoute === 1 ? 'order' : 'orders'}` : '—'}</p>
            </div>
          </section>
        </div>
        </div>
      </div>}

      {ready && (
        <p className="greet-fade" style={{ marginTop: 14, fontSize: 12, color: 'rgb(var(--rgb-ink-muted))', fontFamily: M, letterSpacing: '0.02em', ['--d' as string]: '650ms' }}>
          Tap anywhere to continue
        </p>
      )}
    </div>
  )
}
