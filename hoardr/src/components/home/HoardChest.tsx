'use client'

import { useEffect, useState } from 'react'
import { $f, $fd } from '@/lib/utils'

const GOAL_KEY     = 'hoard-goal'
const DEFAULT_GOAL = 50_000

function readGoal(): number {
  try {
    const v = localStorage.getItem(GOAL_KEY)
    return v ? Math.max(1_000, Number(v)) : DEFAULT_GOAL
  } catch { return DEFAULT_GOAL }
}

function writeGoal(v: number) {
  try { localStorage.setItem(GOAL_KEY, String(v)) } catch {}
}

interface Coin { id: number; x: number; dur: number }
let nextCoinId = 0

interface Props {
  hoardTotal:   number
  thisMonthNet: number
}

export function HoardChest({ hoardTotal, thisMonthNet }: Props) {
  const [goal,      setGoalState] = useState(DEFAULT_GOAL)
  const [fillPct,   setFillPct]   = useState(0)
  const [coins,     setCoins]     = useState<Coin[]>([])
  const [editing,   setEditing]   = useState(false)
  const [goalInput, setGoalInput] = useState('')

  useEffect(() => { setGoalState(readGoal()) }, [])

  useEffect(() => {
    const pct = Math.min(1, Math.max(0, hoardTotal / goal))
    const t   = setTimeout(() => setFillPct(pct), 350)
    return () => clearTimeout(t)
  }, [hoardTotal, goal])

  useEffect(() => {
    if (thisMonthNet <= 0) return
    const spawn = () => {
      const id  = ++nextCoinId
      const x   = 22 + Math.random() * 56
      const dur = 1.6 + Math.random() * 1.0
      setCoins(prev => [...prev, { id, x, dur }])
      setTimeout(() => setCoins(prev => prev.filter(c => c.id !== id)), (dur + 0.5) * 1000)
    }
    spawn()
    const iv = setInterval(spawn, 1800)
    return () => clearInterval(iv)
  }, [thisMonthNet])

  const isPos    = thisMonthNet > 0
  const pctLabel = Math.round(fillPct * 100)

  function handleSave() {
    const v = parseFloat(goalInput.replace(/[$,\s]/g, ''))
    if (!isNaN(v) && v >= 1_000) { setGoalState(v); writeGoal(v) }
    setEditing(false)
  }

  return (
    <div className="mx-4 mt-3">
      <div className="bg-bg-surface border border-white/[0.06] rounded-card px-4 pt-4 pb-5 relative">

        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">Your Hoard · Total Saved</p>
          <button
            onClick={() => { setGoalInput(String(goal)); setEditing(true) }}
            className="text-[10px] text-gold/50 active:text-gold transition-colors select-none"
          >
            Goal: {$f(goal)} ›
          </button>
        </div>

        {/* Gold pile + floating coins */}
        <div className="relative flex justify-center items-end" style={{ height: 175 }}>

          {coins.map(c => (
            <span
              key={c.id}
              className="absolute pointer-events-none select-none text-[15px]"
              style={{ left: `${c.x}%`, bottom: '32%', animation: `hoardCoinFloat ${c.dur}s ease-out forwards` }}
            >🪙</span>
          ))}

          <svg viewBox="0 0 240 188" width="210" height="168" overflow="visible">
            <defs>
              {/* Main pile gradient — SMIL shimmer on top stop */}
              <linearGradient id="hoardPileGrad" x1="0.35" y1="0" x2="0.65" y2="1">
                <stop offset="0%" stopColor="#F7DF9E">
                  <animate attributeName="stop-opacity" values="0.7;1;0.7" dur="2.8s" repeatCount="indefinite"/>
                </stop>
                <stop offset="35%" stopColor="#D4AF37"/>
                <stop offset="100%" stopColor="#8B6014"/>
              </linearGradient>
              {/* Individual coin face color */}
              <linearGradient id="hoardCoinGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor="#F7DF9E"/>
                <stop offset="100%" stopColor="#C8A020"/>
              </linearGradient>
            </defs>

            {/* ── Ground shadow (static) ── */}
            <ellipse cx="120" cy="168" rx="90" ry="13" fill="rgba(0,0,0,0.38)"/>

            {/* ── Gold pile — scaleY from base ── */}
            <g
              style={{
                transformBox:    'fill-box',
                transformOrigin: '50% 100%',
                transform:       `scaleY(${fillPct})`,
                transition:      'transform 1.8s cubic-bezier(0.4,0,0.2,1)',
              }}
            >
              {/* Pile body */}
              <path d="M 26,166 Q 68,50 120,46 Q 172,50 214,166 L 214,171 L 26,171 Z"
                fill="url(#hoardPileGrad)"/>

              {/* Right-side depth shadow */}
              <path d="M 172,82 Q 198,118 214,166 L 214,171 L 178,171 Q 176,150 162,102 Z"
                fill="rgba(0,0,0,0.13)"/>

              {/* Horizontal coin-ring lines suggesting stacked layers */}
              <ellipse cx="120" cy="80"  rx="26"  ry="3.5" fill="#7a5000" opacity="0.52"/>
              <ellipse cx="120" cy="100" rx="39"  ry="3.5" fill="#7a5000" opacity="0.44"/>
              <ellipse cx="120" cy="120" rx="51"  ry="3.5" fill="#7a5000" opacity="0.36"/>
              <ellipse cx="120" cy="138" rx="62"  ry="3.5" fill="#7a5000" opacity="0.28"/>
              <ellipse cx="120" cy="153" rx="71"  ry="3.5" fill="#7a5000" opacity="0.22"/>

              {/* Gleam highlights on upper-left */}
              <ellipse cx="86" cy="76" rx="23" ry="9" fill="#FFFDE0" opacity="0.2"
                transform="rotate(-22, 86, 76)"/>
              <ellipse cx="100" cy="60" rx="13" ry="5" fill="#FFFDE0" opacity="0.15"
                transform="rotate(-22, 100, 60)"/>

              {/* Top coins — three visible coin faces at the peak */}
              <circle cx="108" cy="58" r="9.5" fill="url(#hoardCoinGrad)" stroke="#8B6014" strokeWidth="1.5"/>
              <circle cx="120" cy="51" r="9.5" fill="url(#hoardCoinGrad)" stroke="#8B6014" strokeWidth="1.5"/>
              <circle cx="132" cy="58" r="9.5" fill="url(#hoardCoinGrad)" stroke="#8B6014" strokeWidth="1.5"/>
              {/* Coin face rings */}
              <circle cx="108" cy="58" r="5.5" fill="none" stroke="#F7DF9E" strokeWidth="0.8" opacity="0.65"/>
              <circle cx="120" cy="51" r="5.5" fill="none" stroke="#F7DF9E" strokeWidth="0.8" opacity="0.65"/>
              <circle cx="132" cy="58" r="5.5" fill="none" stroke="#F7DF9E" strokeWidth="0.8" opacity="0.65"/>

              {/* Mid-pile visible coins */}
              <circle cx="88"  cy="80"  r="8" fill="#C8A020" stroke="#8B6014" strokeWidth="1.2"/>
              <circle cx="152" cy="79"  r="8" fill="#C8A020" stroke="#8B6014" strokeWidth="1.2"/>
              <circle cx="73"  cy="106" r="8" fill="#C8A020" stroke="#8B6014" strokeWidth="1.2"/>
              <circle cx="167" cy="104" r="8" fill="#C8A020" stroke="#8B6014" strokeWidth="1.2"/>
            </g>

            {/* ── Sparkle crosses when positive month (not scaled) ── */}
            {isPos && [
              { cx: 60,  cy: 38, d: 0.0  },
              { cx: 180, cy: 34, d: 0.5  },
              { cx: 148, cy: 22, d: 1.0  },
              { cx: 90,  cy: 24, d: 1.5  },
            ].map(({ cx, cy, d }) => (
              <g key={cx} style={{ animation: `hoardSparkle 2s ease-in-out ${d}s infinite` }}>
                <circle cx={cx} cy={cy} r="2.5" fill="#F7DF9E"/>
                <line x1={cx} y1={cy - 7} x2={cx} y2={cy + 7}
                  stroke="#F7DF9E" strokeWidth="1.2" strokeLinecap="round"/>
                <line x1={cx - 7} y1={cy} x2={cx + 7} y2={cy}
                  stroke="#F7DF9E" strokeWidth="1.2" strokeLinecap="round"/>
              </g>
            ))}
          </svg>
        </div>

        {/* Stats */}
        <div className="text-center mt-1">
          <p
            className="text-[36px] font-bold tracking-tight leading-none"
            style={{ fontFamily: 'var(--font-big-shoulders)', color: hoardTotal >= 0 ? '#D4AF37' : '#ef4444' }}
          >
            {hoardTotal < 0 ? '−' : ''}{$f(Math.abs(hoardTotal))}
          </p>
          <p className="text-[11px] text-ink-muted mt-1.5">{pctLabel}% of {$f(goal)} goal</p>
          {thisMonthNet !== 0 && (
            <p className={`text-[12px] font-semibold mt-1 ${isPos ? 'text-emerald' : 'text-ruby'}`}>
              {isPos ? '+' : '−'}{$fd(Math.abs(thisMonthNet))} this month
            </p>
          )}
        </div>
      </div>

      {/* Goal editor */}
      {editing && (
        <>
          <div
            onClick={() => setEditing(false)}
            className="fixed inset-0 z-[55]"
            style={{ background: 'rgba(0,0,0,0.72)' }}
          />
          <div
            className="fixed inset-x-6 z-[60] bg-bg-surface rounded-[20px] p-5 border border-white/[0.08]"
            style={{ top: '50%', transform: 'translateY(-50%)' }}
          >
            <p className="text-[15px] font-semibold text-ink mb-1">Savings Goal</p>
            <p className="text-[12px] text-ink-muted mb-4">How much do you want in your hoard?</p>
            <div className="flex items-center gap-2 bg-bg-overlay rounded-[12px] px-4 py-3 mb-4 border border-white/[0.08] focus-within:border-gold/40">
              <span className="text-[20px] font-mono text-ink-muted">$</span>
              <input
                autoFocus
                type="number"
                value={goalInput}
                onChange={e => setGoalInput(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleSave()}
                className="flex-1 bg-transparent text-[20px] font-mono text-ink outline-none"
                placeholder="50000"
              />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setEditing(false)}
                className="flex-1 py-3 rounded-[12px] bg-bg-overlay text-[14px] font-medium text-ink-muted">
                Cancel
              </button>
              <button onClick={handleSave}
                className="flex-1 py-3 rounded-[12px] gradient-gold text-[14px] font-semibold text-white">
                Save
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
