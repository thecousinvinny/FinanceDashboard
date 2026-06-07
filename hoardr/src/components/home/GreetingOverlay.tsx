'use client'

import { useState, useEffect, useMemo } from 'react'
import { createClient } from '@/lib/supabase/client'
import { $fd, localToday } from '@/lib/utils'

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
  const [show,    setShow]    = useState(false)
  const [mounted, setMounted] = useState(false)   // drives enter animation
  const [exiting, setExiting] = useState(false)
  const [name,    setName]    = useState('')
  const [avatar,  setAvatar]  = useState<string | null>(null)
  const [stats,   setStats]   = useState<Stats | null>(null)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const today = localToday()
    if (false && localStorage.getItem(LS_SHOWN) === today) return // DEV: always show

    setShow(true)
    setAvatar(localStorage.getItem(LS_AVATAR))
    const cachedName = localStorage.getItem(LS_NAME)
    if (cachedName) setName(cachedName)

    // Trigger enter animation on next frame
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

      // Avatar — prefer DB, then Google
      if (!localStorage.getItem(LS_AVATAR) && profile?.avatar_url) {
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url as string)
        const url = `${publicUrl}?t=${Date.now()}`
        setAvatar(url); localStorage.setItem(LS_AVATAR, url)
      } else if (!localStorage.getItem(LS_AVATAR)) {
        const google = user.user_metadata?.avatar_url as string | null
        if (google) setAvatar(google)
      }

      // Month stats
      const monthStart = `${today.slice(0, 7)}-01`
      const [{ data: incData }, { data: expData }] = await Promise.all([
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, savings').gte('date', monthStart).lte('date', today),
      ])
      const income = (incData ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const spent  = (expData ?? []).reduce((s, r) => s + Number(r.cost), 0)
      const saved  = (expData ?? []).reduce((s, r) => s + Number(r.savings ?? 0), 0)
      setStats({ income, spent, saved })
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
    { label: 'Income', value: stats?.income ?? 0, color: 'var(--sem-income)',  prefix: '+'             },
    { label: 'Spent',  value: stats?.spent  ?? 0, color: 'var(--sem-expense)', prefix: ''              },
    { label: 'Net',    value: net,                color: net >= 0 ? 'var(--sem-income)' : '#ef4444', prefix: net >= 0 ? '+' : '−' },
    { label: 'Saved',  value: stats?.saved  ?? 0, color: 'rgb(var(--rgb-ink))', prefix: ''             },
  ]

  // Backdrop: fades in/out
  const bdStyle: React.CSSProperties = {
    position:        'fixed',
    inset:           0,
    zIndex:          80,
    display:         'flex',
    flexDirection:   'column',
    alignItems:      'center',
    justifyContent:  'center',
    background:      'rgba(0,0,0,0.82)',
    opacity:         mounted && !exiting ? 1 : 0,
    transition:      mounted ? 'opacity 360ms ease' : 'none',
    userSelect:      'none',
    WebkitUserSelect: 'none',
  }

  // Card: springs in, scales out
  const cardStyle: React.CSSProperties = {
    position:     'relative',
    width:        'min(88vw, 360px)',
    height:       'min(76vh, 660px)',
    borderRadius: 28,
    overflow:     'hidden',
    boxShadow:    '0 48px 120px rgba(0,0,0,0.9), 0 0 0 0.5px rgba(255,255,255,0.10)',
    transform:    mounted && !exiting ? 'scale(1) translateY(0)' : exiting ? 'scale(0.94) translateY(10px)' : 'scale(0.92) translateY(28px)',
    opacity:      mounted && !exiting ? 1 : 0,
    transition:   mounted
      ? exiting
        ? 'transform 320ms cubic-bezier(0.4,0,1,1), opacity 320ms ease'
        : 'transform 520ms cubic-bezier(0.34,1.56,0.64,1), opacity 420ms ease'
      : 'none',
    flexShrink:   0,
  }

  return (
    <div style={bdStyle} onClick={dismiss}>

      {/* ── Portrait card ───────────────────────────────────────────────── */}
      <div style={cardStyle}>

        {/* Profile image fills the entire card */}
        {avatar ? (
          <img
            src={avatar}
            alt=""
            draggable={false}
            style={{
              position:       'absolute',
              inset:          0,
              width:          '100%',
              height:         '100%',
              objectFit:      'cover',
              objectPosition: 'center 15%',
              display:        'block',
            }}
          />
        ) : (
          <div style={{
            position:        'absolute',
            inset:           0,
            background:      'var(--color-bg-overlay)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <span style={{ fontSize: 100, fontWeight: 700, color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)' }}>
              {name ? name[0].toUpperCase() : '?'}
            </span>
          </div>
        )}

        {/* Bottom gradient — darkens toward footer content */}
        <div style={{
          position:   'absolute',
          inset:      0,
          background: 'linear-gradient(to bottom, transparent 25%, rgba(8,8,16,0.45) 52%, rgba(8,8,16,0.92) 70%, #080810 100%)',
          pointerEvents: 'none',
        }} />

        {/* Content pinned to bottom of card */}
        <div style={{
          position: 'absolute',
          bottom:   0,
          left:     0,
          right:    0,
          padding:  '0 20px 20px',
        }}>

          {/* Greeting */}
          <p style={{
            fontSize:      9,
            fontWeight:    600,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color:         '#D4AF37',
            marginBottom:  4,
            fontFamily:    'var(--font-montserrat)',
          }}>
            {timeGreeting()}
          </p>
          <h1 style={{
            fontSize:      name.length > 10 ? 32 : 38,
            fontWeight:    800,
            letterSpacing: '-0.03em',
            color:         'rgb(var(--rgb-ink))',
            lineHeight:    1,
            marginBottom:  14,
            fontFamily:    'var(--font-montserrat)',
          }}>
            {name || '—'}
          </h1>

          {/* Divider */}
          <div style={{ height: 0.5, background: 'rgba(255,255,255,0.12)', marginBottom: 12 }} />

          {/* Stats label */}
          <p style={{
            fontSize:      8,
            fontWeight:    500,
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
            color:         'rgba(255,255,255,0.35)',
            marginBottom:  8,
            fontFamily:    'var(--font-montserrat)',
          }}>
            Your Month So Far
          </p>

          {/* 2×2 stat grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
            {STATS.map(({ label, value, color, prefix }) => (
              <div key={label} style={{
                background:         'rgba(255,255,255,0.07)',
                border:             '0.5px solid rgba(255,255,255,0.10)',
                borderRadius:       14,
                padding:            '10px 12px',
                backdropFilter:     'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
              }}>
                <p style={{
                  fontSize:      8,
                  fontWeight:    500,
                  letterSpacing: '0.12em',
                  textTransform: 'uppercase',
                  color:         'rgba(255,255,255,0.38)',
                  marginBottom:  5,
                  fontFamily:    'var(--font-montserrat)',
                }}>
                  {label}
                </p>
                {stats === null ? (
                  <div style={{ height: 22, width: 64, borderRadius: 4, background: 'rgba(255,255,255,0.08)' }} />
                ) : (
                  <p style={{
                    fontSize:      18,
                    fontWeight:    700,
                    fontFamily:    'var(--font-big-shoulders)',
                    letterSpacing: '-0.01em',
                    color,
                    lineHeight:    1,
                  }}>
                    {prefix}{$fd(Math.abs(value))}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Tap hint below card */}
      <p style={{
        marginTop:  18,
        fontSize:   11,
        color:      'rgba(255,255,255,0.25)',
        fontFamily: 'var(--font-montserrat)',
        letterSpacing: '0.04em',
      }}>
        Tap anywhere to continue
      </p>
    </div>
  )
}
