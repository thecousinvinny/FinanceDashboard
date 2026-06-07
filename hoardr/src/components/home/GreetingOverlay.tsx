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
  const [exiting, setExiting] = useState(false)
  const [name,    setName]    = useState('')
  const [avatar,  setAvatar]  = useState<string | null>(null)
  const [stats,   setStats]   = useState<Stats | null>(null)

  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const today = localToday()
    if (localStorage.getItem(LS_SHOWN) === today) return

    // Show immediately with whatever is cached
    setShow(true)
    setAvatar(localStorage.getItem(LS_AVATAR))
    const cachedName = localStorage.getItem(LS_NAME)
    if (cachedName) setName(cachedName)

    ;(async () => {
      // ── Name ────────────────────────────────────────────────────────────────
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (!user) return

      // prefer profiles.display_name, fall back to Google full_name
      const { data: profile } = await supabase
        .from('profiles')
        .select('display_name, avatar_url')
        .eq('id', user.id)
        .single()

      const fullName = (profile?.display_name as string | null)
        ?? (user.user_metadata?.full_name as string | null)
        ?? ''
      const firstName = fullName.split(' ')[0]
      if (firstName) {
        setName(firstName)
        localStorage.setItem(LS_NAME, firstName)
      }

      // ── Avatar (if not already cached) ──────────────────────────────────────
      if (!localStorage.getItem(LS_AVATAR) && profile?.avatar_url) {
        const avatarPath = profile.avatar_url as string
        const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(avatarPath)
        const busted = `${publicUrl}?t=${Date.now()}`
        setAvatar(busted)
        localStorage.setItem(LS_AVATAR, busted)
      } else if (!localStorage.getItem(LS_AVATAR)) {
        // Fall back to Google avatar
        const googleAvatar = user.user_metadata?.avatar_url as string | null
        if (googleAvatar) setAvatar(googleAvatar)
      }

      // ── Month stats ─────────────────────────────────────────────────────────
      const monthStart = `${today.slice(0, 7)}-01`
      const [{ data: incData }, { data: expData }] = await Promise.all([
        supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
        supabase.from('expenses').select('cost, savings').gte('date', monthStart).lte('date', today),
      ])
      const income = (incData  ?? []).reduce((s, r) => s + Number(r.amount), 0)
      const spent  = (expData  ?? []).reduce((s, r) => s + Number(r.cost),   0)
      const saved  = (expData  ?? []).reduce((s, r) => s + Number(r.savings ?? 0), 0)
      setStats({ income, spent, saved })
    })()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function dismiss() {
    setExiting(true)
    localStorage.setItem(LS_SHOWN, localToday())
    setTimeout(() => setShow(false), 380)
  }

  if (!show) return null

  const net = (stats?.income ?? 0) - (stats?.spent ?? 0)

  const STAT_ROWS: { label: string; value: number; color: string; prefix: string }[] = [
    { label: 'Income', value: stats?.income ?? 0, color: 'var(--sem-income)',   prefix: '+' },
    { label: 'Spent',  value: stats?.spent  ?? 0, color: 'var(--sem-expense)',  prefix: ''  },
    { label: 'Net',    value: net,                color: net >= 0 ? 'var(--sem-income)' : 'var(--color-ruby)', prefix: net >= 0 ? '+' : '' },
    { label: 'Saved',  value: stats?.saved  ?? 0, color: 'rgb(var(--rgb-ink))', prefix: ''  },
  ]

  return (
    <div
      onClick={dismiss}
      style={{
        position:   'fixed',
        inset:      0,
        zIndex:     80,
        background: 'var(--color-bg-base)',
        opacity:    exiting ? 0 : 1,
        transform:  exiting ? 'scale(0.98)' : 'scale(1)',
        transition: 'opacity 380ms cubic-bezier(0.4,0,1,1), transform 380ms cubic-bezier(0.4,0,1,1)',
        display:    'flex',
        flexDirection: 'column',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* ── Avatar (top 62% of screen) ──────────────────────────────────── */}
      <div style={{ position: 'relative', height: '62vh', flexShrink: 0 }}>
        {avatar ? (
          <img
            src={avatar}
            alt="Profile"
            style={{
              width:      '100%',
              height:     '100%',
              objectFit:  'cover',
              objectPosition: 'center top',
              display:    'block',
            }}
            draggable={false}
          />
        ) : (
          <div style={{
            width:           '100%',
            height:          '100%',
            background:      'var(--color-bg-overlay)',
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'center',
          }}>
            <span style={{
              fontSize:    120,
              fontWeight:  700,
              color:       'rgb(var(--rgb-ink-muted))',
              fontFamily:  'var(--font-montserrat)',
              lineHeight:  1,
            }}>
              {name ? name[0].toUpperCase() : '?'}
            </span>
          </div>
        )}

        {/* Gradient: photo fades into bg-base */}
        <div style={{
          position:   'absolute',
          inset:      0,
          top:        '30%',
          background: 'linear-gradient(to bottom, transparent 0%, var(--color-bg-base) 100%)',
          pointerEvents: 'none',
        }} />
      </div>

      {/* ── Greeting text ───────────────────────────────────────────────── */}
      <div style={{ padding: '0 24px', marginTop: -8, flexShrink: 0 }}>
        <p style={{
          fontSize:      10,
          fontWeight:    600,
          letterSpacing: '0.16em',
          textTransform: 'uppercase',
          color:         'var(--sem-expense)',
          marginBottom:  4,
          fontFamily:    'var(--font-montserrat)',
        }}>
          {timeGreeting()}
        </p>
        <h1 style={{
          fontSize:      name.length > 10 ? 36 : 44,
          fontWeight:    800,
          letterSpacing: '-0.03em',
          color:         'rgb(var(--rgb-ink))',
          lineHeight:    1.0,
          fontFamily:    'var(--font-montserrat)',
        }}>
          {name || '—'}
        </h1>
      </div>

      {/* ── Month stats ─────────────────────────────────────────────────── */}
      <div style={{ padding: '20px 20px 0', flexShrink: 0 }}>
        <p style={{
          fontSize:      9,
          fontWeight:    500,
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color:         'rgb(var(--rgb-ink-faint))',
          marginBottom:  10,
          fontFamily:    'var(--font-montserrat)',
        }}>
          Your Month So Far
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          {STAT_ROWS.map(({ label, value, color, prefix }) => (
            <div key={label} style={{
              background:   'var(--color-bg-surface)',
              border:       '0.5px solid rgba(255,255,255,0.06)',
              borderRadius: 20,
              padding:      '14px 16px',
            }}>
              <p style={{
                fontSize:      9,
                fontWeight:    500,
                letterSpacing: '0.12em',
                textTransform: 'uppercase',
                color:         'rgb(var(--rgb-ink-faint))',
                marginBottom:  6,
                fontFamily:    'var(--font-montserrat)',
              }}>
                {label}
              </p>
              {stats === null ? (
                <div style={{ height: 28, width: 80, borderRadius: 6, background: 'rgba(255,255,255,0.06)', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ) : (
                <p style={{
                  fontSize:    22,
                  fontWeight:  700,
                  fontFamily:  'var(--font-big-shoulders)',
                  letterSpacing: '-0.01em',
                  color,
                  lineHeight:  1,
                }}>
                  {prefix}{$fd(Math.abs(value))}
                </p>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Dismiss hint ────────────────────────────────────────────────── */}
      <div style={{
        flex:           1,
        display:        'flex',
        alignItems:     'flex-end',
        justifyContent: 'center',
        paddingBottom:  'calc(env(safe-area-inset-bottom, 24px) + 24px)',
        paddingTop:     20,
      }}>
        <p style={{
          fontSize:  11,
          color:     'rgb(var(--rgb-ink-faint))',
          fontFamily:'var(--font-montserrat)',
          opacity:   0.5,
        }}>
          Tap anywhere to continue
        </p>
      </div>
    </div>
  )
}
