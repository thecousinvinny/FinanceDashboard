'use client'

import { useState, useLayoutEffect, useRef } from 'react'
import { CalendarDays, Receipt, ArrowDownLeft, Package, Landmark, TrendingDown, TrendingUp } from 'lucide-react'
import { $fd, $fk, localToday, nextRenewalDate } from '@/lib/utils'
import { createClient } from '@/lib/supabase/client'
import { calFetch } from '@/lib/calendar'
import type { BillingCycle } from '@/types'
import type { Session } from '@supabase/supabase-js'

/**
 * Daily brief shown when the app opens. Doubles as the warm-up screen: while
 * it's up, ScreenKeepAlive mounts and loads every tab behind it, so the app is
 * instant once it's dismissed.
 */

const LS_AVATAR = 'hoardr-avatar-url'
const LS_NAME   = 'hoardr-greeting-name'
const LS_LAST   = 'hoardr-greeting-at'      // ms timestamp of the last showing
const SS_SHOWN  = 'hoardr-greeting-session'
const COOLDOWN  = 30 * 60_000

/**
 * Once per app launch (browser session), and never twice within 30 minutes.
 * The overlay lives in the dashboard layout, so anything that remounts it —
 * a reload, a deploy refreshing the page, a bounce through /login — used to
 * bring it back, which on desktop looked random.
 */
function shouldShow(): boolean {
  try {
    if (sessionStorage.getItem(SS_SHOWN)) return false
    const last = Number(localStorage.getItem(LS_LAST) ?? 0)
    if (Date.now() - last < COOLDOWN) return false
    sessionStorage.setItem(SS_SHOWN, '1')
    localStorage.setItem(LS_LAST, String(Date.now()))
    return true
  } catch { return true }
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
  const authSubRef = useRef<{ unsubscribe: () => void } | null>(null)

  // Layout effect: the scrim is up before the first paint after hydration, so
  // the page never flashes underneath before the brief appears.
  useLayoutEffect(() => {
    if (!shouldShow()) return
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
        supabase.from('expenses').select('cost, date').gte('date', lmStart).lte('date', today),
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('subscriptions').select('name, cost, billing, next_renewal').eq('status', 'Active'),
        supabase.from('revenue_streams').select('name, amount, freq, next_pay_date'),
        supabase.from('banks').select('balance'),
        supabase.from('wishlist').select('id').eq('status', 'Ordered'),
        profileP, todayP, avatarP,
      ])
      if (gen !== genRef.current) return

      const exp = (expData ?? []) as { cost: number; date: string }[]
      const spent = exp.filter(e => e.date >= monthStart).reduce((s, e) => s + Number(e.cost), 0)
      const lastMonthToDate = exp.filter(e => e.date < monthStart && e.date <= lmSameDay).reduce((s, e) => s + Number(e.cost), 0)
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
      })
      setReady(true)
    }

    loadData().catch(() => { if (gen === genRef.current) setReady(true) })
    return () => {
      genRef.current++; clearTimeout(readyTimer); clearTimeout(waitTimer)
      authSubRef.current?.unsubscribe(); authSubRef.current = null
    }
  }, [])

  function dismiss() {
    setExiting(true)
    setTimeout(() => setShow(false), 340)
  }

  if (!show) return null

  const net  = (brief?.income ?? 0) - (brief?.spent ?? 0)
  const pace = brief && brief.lastMonthToDate > 0 ? ((brief.spent - brief.lastMonthToDate) / brief.lastMonthToDate) * 100 : null
  const dateLine = todayStr
    ? new Date(todayStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })
    : ''
  const upShown = brief?.upcoming.slice(0, 4) ?? []
  const upMore  = (brief?.upcoming.length ?? 0) - upShown.length
  const evShown = brief?.today?.slice(0, 3) ?? []
  const evMore  = (brief?.today?.length ?? 0) - evShown.length

  const label: React.CSSProperties = { fontSize: 11, fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink-muted))', fontFamily: M }
  const tile: React.CSSProperties = { background: 'rgb(var(--rgb-ink) / 0.05)', borderRadius: 18, padding: '14px 16px' }
  const chip: React.CSSProperties = { flex: 1, display: 'flex', alignItems: 'center', gap: 8, background: 'rgb(var(--rgb-ink) / 0.05)', borderRadius: 14, padding: '10px 12px', fontFamily: M }
  const skeleton = (w: number) => <span style={{ display: 'inline-block', height: 12, width: w, borderRadius: 4, background: 'rgb(var(--rgb-ink) / 0.08)' }} />

  return (
    <div
      onClick={ready ? dismiss : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 80,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        padding: 'env(safe-area-inset-top, 44px) 16px env(safe-area-inset-bottom, 34px)',
        boxSizing: 'border-box',
        // Near-solid theme scrim, no backdrop blur: re-blurring the page while
        // every tab mounts behind it is what made the entrance stutter.
        background: 'radial-gradient(120% 80% at 50% 40%, rgb(var(--rgb-bg-base) / 0.9), rgb(var(--rgb-bg-base) / 0.97))',
        opacity: exiting ? 0 : 1,
        transition: 'opacity 340ms ease',
        userSelect: 'none', WebkitUserSelect: 'none',
      }}
    >
      {!ready && waiting && <div className="greet-spinner" aria-label="Loading" />}

      {/* Same card on phone and desktop: max 380px, narrower only on small screens */}
      {ready && <div className={exiting ? 'greet-card-out' : 'greet-card-in'} style={{
        position: 'relative',
        width: '100%', maxWidth: 380, maxHeight: 'min(88vh, 780px)',
        borderRadius: 28, overflow: 'hidden',
        background: 'var(--color-bg-surface)',
        boxShadow: '0 40px 100px rgba(0,0,0,0.5), 0 0 0 0.5px rgb(var(--rgb-ink) / 0.10)',
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Banner: profile photo under a dark gradient, greeting on top */}
        <div style={{ position: 'relative', height: 172, flexShrink: 0, overflow: 'hidden', background: '#0c0c0f' }}>
          {avatar ? (
            <img
              src={hiRes(avatar)} alt="" draggable={false}
              className="greet-banner-img"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }}
            />
          ) : (
            <div className="greet-banner-img" style={{ position: 'absolute', inset: 0, background: 'linear-gradient(150deg, #E9CD7A 0%, #B08A2A 55%, #3a2c08 100%)' }} />
          )}
          {/* Dark wash for legibility + a warm gold glint, fading into the card */}
          <div style={{
            position: 'absolute', inset: 0,
            background: [
              'radial-gradient(90% 70% at 85% 0%, rgba(212,175,55,0.22), transparent 60%)',
              'linear-gradient(180deg, rgba(6,6,9,0.25) 0%, rgba(6,6,9,0.55) 50%, rgba(6,6,9,0.88) 82%, var(--color-bg-surface) 100%)',
            ].join(', '),
          }} />
          <div style={{ position: 'absolute', left: 22, right: 22, bottom: 14 }}>
            <p style={{ fontSize: 13, fontWeight: 500, color: 'rgba(255,255,255,0.72)', fontFamily: M, letterSpacing: '0.01em' }}>{greeting}</p>
            <h1 style={{ fontSize: 30, fontWeight: 700, letterSpacing: '-0.025em', color: '#fff', lineHeight: 1.1, fontFamily: M, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textShadow: '0 2px 16px rgba(0,0,0,0.45)' }}>
              {name || ' '}
            </h1>
            <p style={{ marginTop: 3, fontSize: 12.5, color: 'rgba(255,255,255,0.6)', fontFamily: M }}>{dateLine}</p>
          </div>
        </div>

        <div style={{ overflowY: 'auto', padding: '14px 16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Today */}
          <section style={tile}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <CalendarDays size={15} color="#D4AF37" strokeWidth={2} />
              <span style={label}>Today</span>
            </div>
            {brief?.today == null ? skeleton(140) : evShown.length === 0 ? (
              <p style={{ fontSize: 14, color: 'rgb(var(--rgb-ink-muted))', fontFamily: M }}>Nothing on the calendar today</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                {evShown.map((e, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 10, fontFamily: M }}>
                    <span style={{ width: 54, flexShrink: 0, fontSize: 12.5, color: 'rgb(var(--rgb-ink-muted))', fontVariantNumeric: 'tabular-nums' }}>{e.time ? fmtTime(e.time) : 'All day'}</span>
                    <span style={{ fontSize: 14.5, color: 'rgb(var(--rgb-ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.title}</span>
                  </div>
                ))}
                {evMore > 0 && <p style={{ fontSize: 12.5, color: 'rgb(var(--rgb-ink-muted))', fontFamily: M, paddingLeft: 64 }}>+{evMore} more</p>}
              </div>
            )}
          </section>

          {/* Month so far */}
          <section style={tile}>
            <p style={label}>Spent this month</p>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10, marginTop: 4 }}>
              <span style={{ fontSize: 38, fontWeight: 700, letterSpacing: '-0.03em', lineHeight: 1, color: 'rgb(var(--rgb-ink))', fontFamily: 'var(--font-big-shoulders)' }}>
                {brief ? $fd(brief.spent) : skeleton(110)}
              </span>
              {pace !== null && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 999,
                  fontSize: 12, fontWeight: 600, fontFamily: M, whiteSpace: 'nowrap',
                  color: pace <= 0 ? '#22c55e' : '#ef4444',
                  background: pace <= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)',
                }}>
                  {pace <= 0 ? <TrendingDown size={13} strokeWidth={2.25} /> : <TrendingUp size={13} strokeWidth={2.25} />}
                  {Math.abs(pace).toFixed(0)}% vs last month
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 18, marginTop: 10, fontFamily: M, fontSize: 13 }}>
              <span style={{ color: 'rgb(var(--rgb-ink-muted))' }}>Income <b style={{ color: 'var(--sem-income)', fontWeight: 600 }}>{brief ? `+${$fk(brief.income)}` : '—'}</b></span>
              <span style={{ color: 'rgb(var(--rgb-ink-muted))' }}>Net <b style={{ color: net >= 0 ? 'var(--sem-income)' : '#ef4444', fontWeight: 600 }}>{brief ? `${net >= 0 ? '+' : '−'}${$fk(Math.abs(net))}` : '—'}</b></span>
            </div>
          </section>

          {/* Next 7 days */}
          <section style={tile}>
            <p style={{ ...label, marginBottom: 10 }}>Next 7 days</p>
            {!brief ? skeleton(160) : upShown.length === 0 ? (
              <p style={{ fontSize: 14, color: 'rgb(var(--rgb-ink-muted))', fontFamily: M }}>No bills or paydays coming up</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                {upShown.map((u, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: M }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: u.kind === 'pay' ? 'rgba(34,197,94,0.15)' : 'rgba(212,175,55,0.15)' }}>
                      {u.kind === 'pay' ? <ArrowDownLeft size={14} color="#22c55e" strokeWidth={2.25} /> : <Receipt size={14} color="#D4AF37" strokeWidth={2} />}
                    </span>
                    <span style={{ flex: 1, minWidth: 0, fontSize: 14.5, color: 'rgb(var(--rgb-ink))', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.title}</span>
                    <span style={{ fontSize: 12.5, color: 'rgb(var(--rgb-ink-muted))' }}>{dayLabel(u.date, todayStr)}</span>
                    <span style={{ width: 68, textAlign: 'right', fontSize: 14, fontWeight: 600, fontVariantNumeric: 'tabular-nums', color: u.kind === 'pay' ? 'var(--sem-income)' : 'rgb(var(--rgb-ink))' }}>
                      {u.kind === 'pay' ? '+' : ''}{$fk(u.amount)}
                    </span>
                  </div>
                ))}
                {upMore > 0 && <p style={{ fontSize: 12.5, color: 'rgb(var(--rgb-ink-muted))', fontFamily: M, paddingLeft: 36 }}>+{upMore} more</p>}
              </div>
            )}
          </section>

          {/* Footnotes */}
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={chip}>
              <Landmark size={15} color="#D4AF37" strokeWidth={2} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink-muted))' }}>Net worth</p>
                <p style={{ fontSize: 14.5, fontWeight: 600, color: 'rgb(var(--rgb-ink))' }}>{brief ? $fk(brief.netWorth) : '—'}</p>
              </div>
            </div>
            <div style={chip}>
              <Package size={15} color="#D4AF37" strokeWidth={2} />
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 11, color: 'rgb(var(--rgb-ink-muted))' }}>On the way</p>
                <p style={{ fontSize: 14.5, fontWeight: 600, color: 'rgb(var(--rgb-ink))' }}>{brief ? `${brief.enRoute} ${brief.enRoute === 1 ? 'order' : 'orders'}` : '—'}</p>
              </div>
            </div>
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
