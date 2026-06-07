'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { $fd, localToday } from '@/lib/utils'
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

interface Stats { income: number; spent: number; saved: number }

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
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
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

      // ── Build 14-day date array ──────────────────────────────────────────
      const chartStart = (() => {
        const d = new Date(today + 'T12:00:00')
        d.setDate(d.getDate() - 13)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })()
      const chart14Days = Array.from({ length: 14 }, (_, i) => {
        const d = new Date(today + 'T12:00:00')
        d.setDate(d.getDate() - 13 + i)
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
      })
      const monthStart = `${today.slice(0, 7)}-01`

      // Fetch all data in parallel
      const [
        { data: incData },
        { data: expData },
        { data: sparkExpData },
        { data: sparkIncData },
      ] = await Promise.all([
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, savings').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, date').gte('date', chartStart).lte('date', today),
        supabase.from('income').select('amount, date').gte('date', chartStart).lte('date', today),
      ])

      // Month stats
      const income = (incData  ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const spent  = (expData  ?? []).reduce((s, r) => s + Number(r.cost), 0)
      const saved  = (expData  ?? []).reduce((s, r) => s + Number(r.savings ?? 0), 0)
      setStats({ income, spent, saved })

      // Spark points
      const dailyExp: Record<string, number> = {}
      const dailyInc: Record<string, number> = {}
      for (const e of sparkExpData ?? []) dailyExp[String(e.date)] = (dailyExp[String(e.date)] ?? 0) + Number(e.cost)
      for (const i of sparkIncData ?? []) dailyInc[String(i.date)] = (dailyInc[String(i.date)] ?? 0) + Number(i.amount)
      setSparkPoints(chart14Days.map(d => ({
        day:   String(Number(d.split('-')[2])),
        label: new Date(d + 'T12:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }),
        exp:   dailyExp[d] ?? 0,
        inc:   dailyInc[d] ?? 0,
        sub:   0,
      })))
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

  const net = (stats?.income ?? 0) - (stats?.spent ?? 0)

  const STATS: { label: string; value: number; color: string; prefix: string }[] = [
    { label: 'Income', value: stats?.income ?? 0, color: 'var(--sem-income)',  prefix: '+'                                          },
    { label: 'Spent',  value: stats?.spent  ?? 0, color: 'var(--sem-expense)', prefix: ''                                           },
    { label: 'Net',    value: net,                color: net >= 0 ? 'var(--sem-income)' : '#ef4444', prefix: net >= 0 ? '+' : '−'   },
    { label: 'Saved',  value: stats?.saved  ?? 0, color: 'rgb(var(--rgb-ink))', prefix: ''                                          },
  ]

  return (
    <div
      onClick={dismiss}
      style={{
        position:         'fixed',
        inset:            0,
        zIndex:           80,
        display:          'flex',
        flexDirection:    'column',
        alignItems:       'center',
        justifyContent:   'center',
        background:       'rgba(0,0,0,0.82)',
        opacity:          mounted && !exiting ? 1 : 0,
        transition:       mounted ? 'opacity 360ms ease' : 'none',
        userSelect:       'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ── Portrait card ───────────────────────────────────────────────── */}
      <div style={{
        position:     'relative',
        width:        'min(88vw, 360px)',
        height:       'min(82vh, 700px)',
        borderRadius: 28,
        overflow:     'hidden',
        background:   '#080810',
        boxShadow:    '0 48px 120px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(255,255,255,0.10)',
        display:      'flex',
        flexDirection:'column',
        transform:    mounted && !exiting ? 'scale(1) translateY(0)' : exiting ? 'scale(0.94) translateY(10px)' : 'scale(0.92) translateY(28px)',
        transition:   mounted
          ? exiting
            ? 'transform 320ms cubic-bezier(0.4,0,1,1), opacity 320ms ease'
            : 'transform 520ms cubic-bezier(0.34,1.56,0.64,1), opacity 420ms ease'
          : 'none',
      }}>

        {/* ── Photo (top 38% of card) ──────────────────────────────────── */}
        <div style={{ position: 'relative', height: '38%', flexShrink: 0 }}>
          {avatar ? (
            <img
              src={avatar}
              alt=""
              draggable={false}
              style={{
                width:          '100%',
                height:         '100%',
                objectFit:      'cover',
                objectPosition: 'center 18%',
                display:        'block',
              }}
            />
          ) : (
            <div style={{
              width: '100%', height: '100%',
              background: 'var(--color-bg-overlay)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}>
              <span style={{ fontSize: 80, fontWeight: 700, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)' }}>
                {name ? name[0].toUpperCase() : '?'}
              </span>
            </div>
          )}
          {/* Fade image bottom into card bg */}
          <div style={{
            position:   'absolute',
            bottom:     0, left: 0, right: 0,
            height:     '55%',
            background: 'linear-gradient(to bottom, transparent, #080810)',
            pointerEvents: 'none',
          }} />
        </div>

        {/* ── Content area ─────────────────────────────────────────────── */}
        <div style={{
          flex:           1,
          display:        'flex',
          flexDirection:  'column',
          padding:        '4px 18px 16px',
          overflow:       'hidden',
        }}>

          {/* Greeting */}
          <div style={{ marginBottom: 12 }}>
            <p style={{
              fontSize: 9, fontWeight: 600, letterSpacing: '0.18em',
              textTransform: 'uppercase', color: '#D4AF37',
              marginBottom: 3, fontFamily: 'var(--font-montserrat)',
            }}>
              {timeGreeting()}
            </p>
            <h1 style={{
              fontSize:      name.length > 10 ? 28 : 34,
              fontWeight:    800,
              letterSpacing: '-0.03em',
              color:         'rgb(var(--rgb-ink))',
              lineHeight:    1,
              fontFamily:    'var(--font-montserrat)',
            }}>
              {name || '—'}
            </h1>
          </div>

          {/* Sparkline */}
          <div style={{
            flex:       '0 0 88px',
            position:   'relative',
            marginBottom: 10,
            borderRadius: 10,
            overflow:   'hidden',
          }}>
            {sparkPoints.length > 0
              ? <SparkChart points={sparkPoints} />
              : <div style={{ position: 'absolute', inset: 0, background: 'rgba(255,255,255,0.03)', borderRadius: 10 }} />
            }
          </div>

          {/* Divider */}
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.10)', marginBottom: 10, flexShrink: 0 }} />

          {/* Stats label */}
          <p style={{
            fontSize: 8, fontWeight: 500, letterSpacing: '0.16em',
            textTransform: 'uppercase', color: 'rgba(255,255,255,0.30)',
            marginBottom: 8, flexShrink: 0, fontFamily: 'var(--font-montserrat)',
          }}>
            Your Month So Far
          </p>

          {/* 2×2 stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7, flex: 1, alignContent: 'start' }}>
            {STATS.map(({ label, value, color, prefix }) => (
              <div key={label} style={{
                background:           'rgba(255,255,255,0.06)',
                border:               '0.5px solid rgba(255,255,255,0.09)',
                borderRadius:         13,
                padding:              '9px 12px',
                backdropFilter:       'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}>
                <p style={{
                  fontSize: 8, fontWeight: 500, letterSpacing: '0.12em',
                  textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)',
                  marginBottom: 5, fontFamily: 'var(--font-montserrat)',
                }}>
                  {label}
                </p>
                {stats === null ? (
                  <div style={{ height: 20, width: 56, borderRadius: 4, background: 'rgba(255,255,255,0.07)' }} />
                ) : (
                  <p style={{
                    fontSize: 17, fontWeight: 700,
                    fontFamily: 'var(--font-big-shoulders)',
                    letterSpacing: '-0.01em', color, lineHeight: 1,
                  }}>
                    {prefix}{$fd(Math.abs(value))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Hint below card */}
      <p style={{
        marginTop: 16, fontSize: 11,
        color: 'rgba(255,255,255,0.22)',
        fontFamily: 'var(--font-montserrat)',
        letterSpacing: '0.04em',
      }}>
        Tap anywhere to continue
      </p>
    </div>
  )
}
