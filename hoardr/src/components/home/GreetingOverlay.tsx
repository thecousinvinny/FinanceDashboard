'use client'

import { useState, useEffect } from 'react'
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

export interface GreetingInitialData {
  name: string
  avatarUrl: string | null
  stats: { income: number; spent: number; subs: number; saved: number }
  sparkPoints: DayPoint[]
}

export function GreetingOverlay({ initialData }: { initialData: GreetingInitialData | null }) {
  const [show,    setShow]    = useState(false)
  const [mounted, setMounted] = useState(false)
  const [exiting, setExiting] = useState(false)
  const [name,    setName]    = useState('')
  const [avatar,  setAvatar]  = useState<string | null>(null)

  useEffect(() => {
    if (!initialData) return

    const today = localToday()
    if (false && localStorage.getItem(LS_SHOWN) === today) return // DEV: always show

    // Sync to localStorage cache for next visit
    if (initialData.name) {
      setName(initialData.name)
      localStorage.setItem(LS_NAME, initialData.name)
    } else {
      const cached = localStorage.getItem(LS_NAME)
      if (cached) setName(cached)
    }
    if (initialData.avatarUrl) {
      setAvatar(initialData.avatarUrl)
      localStorage.setItem(LS_AVATAR, initialData.avatarUrl)
    } else {
      const cached = localStorage.getItem(LS_AVATAR)
      if (cached) setAvatar(cached)
    }

    setShow(true)
    requestAnimationFrame(() => requestAnimationFrame(() => setMounted(true)))
  }, [initialData])

  function dismiss() {
    setExiting(true)
    setMounted(false)
    localStorage.setItem(LS_SHOWN, localToday())
    setTimeout(() => setShow(false), 360)
  }

  if (!show || !initialData) return null

  const { stats, sparkPoints } = initialData
  const net       = stats.income - stats.spent - stats.subs
  const heroVal   = stats.spent + stats.subs
  const legendInc = sparkPoints.reduce((s, p) => s + p.inc, 0)
  const legendExp = sparkPoints.reduce((s, p) => s + p.exp, 0)
  const legendSub = sparkPoints.reduce((s, p) => s + p.sub, 0)
  const hasSub    = legendSub > 0

  const STATS: { label: string; value: number; color: string; prefix: string }[] = [
    { label: 'Income', value: stats.income, color: 'var(--sem-income)',  prefix: '+' },
    { label: 'Spent',  value: stats.spent,  color: 'var(--sem-expense)', prefix: ''  },
    { label: 'Subs',   value: stats.subs,   color: 'rgba(180,185,200,0.8)', prefix: '' },
    { label: 'Net',    value: net,           color: net >= 0 ? 'var(--sem-income)' : '#ef4444', prefix: net >= 0 ? '+' : '−' },
    { label: 'Saved',  value: stats.saved,  color: 'rgb(var(--rgb-ink))', prefix: '' },
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

          {/* ── Sparkline ─────────────────────────────────────────────── */}
          <div style={{ position: 'relative', height: 240, flexShrink: 0 }}>
            {sparkPoints.length > 0 && <SparkChart points={sparkPoints} />}

            {/* Left gradient */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              background: 'linear-gradient(90deg, rgba(22,30,39,0.85) 0%, rgba(22,30,39,0.50) 45%, rgba(22,30,39,0.0) 70%)',
              zIndex: 1,
            }} />

            {/* Legend + hero number */}
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, padding: '14px 16px', zIndex: 2, pointerEvents: 'none' }}>
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

              {/* Hero number — identical to HomeHero */}
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
            padding: '0 18px', marginBottom: 6, fontFamily: 'var(--font-montserrat)',
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
                <p style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-big-shoulders)', letterSpacing: '-0.01em', color, lineHeight: 1 }}>
                  {prefix}${fmtInt(Math.abs(value))}.{fmtCents(value)}
                </p>
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
