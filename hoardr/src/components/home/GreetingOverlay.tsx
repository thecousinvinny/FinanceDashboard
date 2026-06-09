'use client'

import { useState, useEffect, useMemo } from 'react'
import type { User } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { $fk, localToday } from '@/lib/utils'
import { SparkChart, type DayPoint } from './SparkChart'

const LS_SHOWN  = 'hoardr-greeting-shown'
const LS_AVATAR = 'hoardr-avatar-url'
const LS_NAME   = 'hoardr-greeting-name'

function timeGreeting(): string {
  const h = new Date().getHours()
  if (h >= 5  && h < 12) return 'Good morning'
  if (h >= 12 && h < 17) return 'Good afternoon'
  if (h >= 17 && h < 21) return 'Good evening'
  return 'Good night'
}

function fmtInt(n: number)   { return Math.floor(n).toLocaleString('en-US') }
function fmtCents(n: number) { return String(Math.round((Math.abs(n) % 1) * 100)).padStart(2, '0') }

interface Stats { income: number; spent: number; subs: number; saved: number }

export function GreetingOverlay() {
  const [show,        setShow]        = useState(false)
  const [mounted,     setMounted]     = useState(false)
  const [exiting,     setExiting]     = useState(false)
  const [name,        setName]        = useState('')
  const [avatar,      setAvatar]      = useState<string | null>(null)
  const [stats,       setStats]       = useState<Stats | null>(null)
  const [sparkPoints, setSparkPoints] = useState<DayPoint[]>([])

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const today = localToday()
    if (false && localStorage.getItem(LS_SHOWN) === today) return // DEV: always show

    setShow(true)
    setAvatar(localStorage.getItem(LS_AVATAR))
    const cachedName = localStorage.getItem(LS_NAME)
    if (cachedName) setName(cachedName)

    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))

    ;(async () => {
      // createBrowserClient reads the session from cookies asynchronously.
      // INITIAL_SESSION fires once the client has finished that read.
      // Calling getSession/getUser before this fires returns null.
      const user = await new Promise<User | null>(resolve => {
        let subscription: { unsubscribe(): void } | undefined
        const timer = setTimeout(() => { subscription?.unsubscribe(); resolve(null) }, 5000)
        const finish = (u: User | null) => {
          clearTimeout(timer); subscription?.unsubscribe(); resolve(u)
        }
        const result = supabase.auth.onAuthStateChange((event, session) => {
          if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') finish(session?.user ?? null)
          else if (event === 'SIGNED_OUT') finish(null)
        })
        subscription = result.data.subscription
      })
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single()

      const fullName = (profile?.display_name as string | null)
        ?? (user.user_metadata?.full_name as string | null)
        ?? ''
      const firstName = fullName.split(' ')[0]
      if (firstName) { setName(firstName); localStorage.setItem(LS_NAME, firstName) }

      if (!localStorage.getItem(LS_AVATAR) && profile?.avatar_url) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url as string)
        const url = `${publicUrl}?t=${Date.now()}`
        setAvatar(url); localStorage.setItem(LS_AVATAR, url)
      } else if (!localStorage.getItem(LS_AVATAR)) {
        const google = user.user_metadata?.avatar_url as string | null
        if (google) setAvatar(google)
      }

      // ── Date ranges ──────────────────────────────────────────────────────
      const monthStart = `${today.slice(0, 7)}-01`

      const chartStart = (() => {
        const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 13)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })()
      const chart14Days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today + 'T12:00:00'); d.setDate(d.getDate() - 13 + i)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })

      const [
        { data: incData },
        { data: expData },
        { data: chartExpData },
        { data: chartIncData },
        { data: activeSubs },
      ] = await Promise.all([
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, savings, name').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, date, name').gte('date', chartStart).lte('date', today),
        supabase.from('income').select('amount, date').gte('date', chartStart).lte('date', today),
        supabase.from('subscriptions').select('name').eq('status', 'Active'),
      ])

      const subNameSet = new Set((activeSubs ?? []).map(s => String(s.name).toLowerCase()))

      // ── 14-day sparkline buckets ─────────────────────────────────────────
      const dailyExp: Record<string, number> = {}
      const dailyInc: Record<string, number> = {}
      const dailySub: Record<string, number> = {}
      for (const e of chartExpData ?? []) {
        const k = String(e.date)
        if (subNameSet.has(String(e.name ?? '').toLowerCase())) {
          dailySub[k] = (dailySub[k] ?? 0) + Number(e.cost)
        } else {
          dailyExp[k] = (dailyExp[k] ?? 0) + Number(e.cost)
        }
      }
      for (const i of chartIncData ?? []) {
        const k = String(i.date)
        dailyInc[k] = (dailyInc[k] ?? 0) + Number(i.amount)
      }
      setSparkPoints(chart14Days.map(d => ({
        day:   String(Number(d.split('-')[2])),
        label: new Date(d + 'T12:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }),
        exp:   dailyExp[d] ?? 0,
        inc:   dailyInc[d] ?? 0,
        sub:   dailySub[d] ?? 0,
      })))

      // ── Month stat totals ─────────────────────────────────────────────────
      const income = (incData ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const subs   = (expData ?? []).reduce((s, r) =>
        subNameSet.has(String((r as { name?: unknown }).name ?? '').toLowerCase())
          ? s + Number(r.cost) : s, 0)
      const spent  = (expData ?? []).reduce((s, r) =>
        subNameSet.has(String((r as { name?: unknown }).name ?? '').toLowerCase())
          ? s : s + Number(r.cost), 0)
      const saved  = (expData ?? []).reduce((s, r) => s + Number(r.savings ?? 0), 0)
      setStats({ income, spent, subs, saved })
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    setExiting(true)
    setMounted(false)
    localStorage.setItem(LS_SHOWN, localToday())
    setTimeout(() => setShow(false), 360)
  }

  if (!show) return null

  const net       = (stats?.income ?? 0) - (stats?.spent ?? 0) - (stats?.subs ?? 0)
  // Hero: total spent this month (exp + subs), matching HomeHero's heroVal
  const heroVal   = (stats?.spent ?? 0) + (stats?.subs ?? 0)
  const legendInc = sparkPoints.reduce((s, p) => s + p.inc, 0)
  const legendExp = sparkPoints.reduce((s, p) => s + p.exp, 0)
  const legendSub = sparkPoints.reduce((s, p) => s + p.sub, 0)
  const hasSub    = legendSub > 0

  const STATS: { label: string; value: number; color: string; prefix: string }[] = [
    { label: 'Income', value: stats?.income ?? 0, color: 'var(--sem-income)',  prefix: '+' },
    { label: 'Spent',  value: stats?.spent  ?? 0, color: 'var(--sem-expense)', prefix: ''  },
    { label: 'Subs',   value: stats?.subs   ?? 0, color: 'rgba(180,185,200,0.8)', prefix: '' },
    { label: 'Net',    value: net,                color: net >= 0 ? 'var(--sem-income)' : '#ef4444', prefix: net >= 0 ? '+' : '−' },
    { label: 'Saved',  value: stats?.saved  ?? 0, color: 'rgb(var(--rgb-ink))', prefix: '' },
  ]

  return (
    <div
      onClick={dismiss}
      style={{
        position:             'fixed',
        inset:                0,
        zIndex:               80,
        display:              'flex',
        flexDirection:        'column',
        alignItems:           'center',
        justifyContent:       'center',
        // Safe area padding so card never overlaps Dynamic Island or home indicator
        paddingTop:           'env(safe-area-inset-top, 44px)',
        paddingBottom:        'env(safe-area-inset-bottom, 34px)',
        boxSizing:            'border-box',
        background:           'rgba(12,12,22,0.72)',
        backdropFilter:       'blur(6px)',
        WebkitBackdropFilter: 'blur(6px)',
        opacity:              mounted && !exiting ? 1 : 0,
        transition:           mounted ? 'opacity 360ms ease' : 'none',
        userSelect:           'none',
        WebkitUserSelect:     'none',
      }}
    >
      {/* ── Portrait card ───────────────────────────────────────────────── */}
      <div style={{
        position:      'relative',
        width:         'min(88vw, 360px)',
        height:        'min(87vh, 740px)',
        borderRadius:  28,
        overflow:      'hidden',
        background:    '#080810',
        boxShadow:     '0 48px 120px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.10)',
        display:       'flex',
        flexDirection: 'column',
        transform:     mounted && !exiting
          ? 'scale(1) translateY(0)'
          : exiting
            ? 'scale(0.94) translateY(10px)'
            : 'scale(0.92) translateY(28px)',
        transition:    mounted
          ? exiting
            ? 'transform 320ms cubic-bezier(0.4,0,1,1)'
            : 'transform 520ms cubic-bezier(0.34,1.56,0.64,1)'
          : 'none',
      }}>

        {/* ── Photo ────────────────────────────────────────────────────── */}
        <div style={{ position: 'relative', height: '22%', flexShrink: 0 }}>
          {avatar ? (
            <img
              src={avatar}
              alt=""
              draggable={false}
              style={{ width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 18%', display: 'block' }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'var(--color-bg-overlay)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 64, fontWeight: 700, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)' }}>
                {name ? name[0].toUpperCase() : '?'}
              </span>
            </div>
          )}
          <div style={{
            position: 'absolute', bottom: 0, left: 0, right: 0, height: '60%',
            background: 'linear-gradient(to bottom, transparent, #080810)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* ── Content ──────────────────────────────────────────────────── */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '4px 0 12px', overflow: 'hidden' }}>

          {/* Greeting */}
          <div style={{ padding: '0 18px', marginBottom: 8 }}>
            <p style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#D4AF37',
              marginBottom: 2, fontFamily: 'var(--font-montserrat)',
            }}>
              {timeGreeting()}
            </p>
            <h1 style={{
              fontSize: name.length > 10 ? 26 : 30,
              fontWeight: 800, letterSpacing: '-0.03em',
              color: 'rgb(var(--rgb-ink))', lineHeight: 1,
              fontFamily: 'var(--font-montserrat)',
            }}>
              {name || '—'}
            </h1>
          </div>

          {/* ── Sparkline: 240px, identical to HomeHero ───────────────── */}
          <div style={{ position: 'relative', height: 240, flexShrink: 0 }}>
            {sparkPoints.length > 0 && <SparkChart points={sparkPoints} />}

            {/* Left gradient — same as HomeHero */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(90deg, rgba(22,30,39,0.85) 0%, rgba(22,30,39,0.50) 45%, rgba(22,30,39,0.0) 70%)',
              zIndex: 1,
            }} />

            {/* Text overlay — legend + hero number, identical to HomeHero */}
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0,
              padding: '14px 16px', zIndex: 2, pointerEvents: 'none',
            }}>
              {/* Legend row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, color: 'var(--sem-income, #4ADE80)', fontFamily: 'var(--font-big-shoulders)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: 'var(--sem-income, #4ADE80)', display: 'inline-block' }} />
                  {$fk(legendInc)}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, color: 'var(--sem-expense, #D4AF37)', fontFamily: 'var(--font-big-shoulders)' }}>
                  <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: 'var(--sem-expense, #D4AF37)', display: 'inline-block' }} />
                  {$fk(legendExp)}
                </span>
                {hasSub && (
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, fontWeight: 500, color: 'rgba(180,185,200,0.8)', fontFamily: 'var(--font-big-shoulders)' }}>
                    <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0, background: 'rgba(180,185,200,0.7)', display: 'inline-block' }} />
                    {$fk(legendSub)}
                  </span>
                )}
              </div>

              {/* Hero number — exact HomeHero style */}
              <div style={{ display: 'flex', alignItems: 'flex-start', fontFamily: 'var(--font-big-shoulders)' }}>
                <span style={{ fontSize: 22, fontWeight: 300, color: 'rgb(var(--rgb-ink-muted))', marginTop: 7, marginRight: 1 }}>$</span>
                <span style={{ fontSize: 52, fontWeight: 700, lineHeight: 1, letterSpacing: '-0.04em', color: 'rgb(var(--rgb-ink))' }}>
                  {fmtInt(heroVal)}
                  <span style={{ fontSize: 32, fontWeight: 300, color: 'rgb(var(--rgb-ink-muted))' }}>
                    .{fmtCents(heroVal)}
                  </span>
                </span>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.08)', margin: '8px 18px' }} />

          {/* Stats label */}
          <p style={{
            fontSize: 8, fontWeight: 500, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.28)',
            padding: '0 18px', marginBottom: 6,
            fontFamily: 'var(--font-montserrat)',
          }}>
            Your Month So Far
          </p>

          {/* Stat rows */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, padding: '0 12px' }}>
            {STATS.map(({ label, value, color, prefix }) => (
              <div key={label} style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '8px 14px',
                background: 'rgba(255,255,255,0.05)',
                border: '0.5px solid rgba(255,255,255,0.08)',
                borderRadius: 12,
              }}>
                <p style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.45)', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.01em' }}>
                  {label}
                </p>
                {stats === null ? (
                  <div style={{ height: 15, width: 56, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
                ) : (
                  <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-big-shoulders)', letterSpacing: '-0.01em', color, lineHeight: 1 }}>
                    {prefix}${fmtInt(Math.abs(value))}.{fmtCents(value)}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <p style={{ marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.25)', fontFamily: 'var(--font-montserrat)', letterSpacing: '0.04em' }}>
        Tap anywhere to continue
      </p>
    </div>
  )
}
