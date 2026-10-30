'use client'

import { useLayoutEffect, useRef } from 'react'
import { useScreenVisit } from '@/lib/tab-nav'

// ── Single drum column for one digit ─────────────────────────────────────────
//
// A short strip — 0-9 twice — that rolls once through to its digit with a CSS
// transform transition, so the compositor runs it off the main thread.
// History, both on iPhone: a strip of up to ~60 digits rolled through blank
// stretches (iOS only rasterizes part of a layer that tall), and a rAF drum
// rewriting text every frame stuttered whenever the main thread was busy (the
// tab slide, data landing). Twenty cells is small enough to stay painted.

const EASE    = 'cubic-bezier(0.22, 1, 0.36, 1)'   // easeOutQuint, no overshoot
const ROLL_MS = 650                                // later value changes
const CELLS   = Array.from({ length: 20 }, (_, i) => i % 10)

interface DrumProps {
  digit:          number  // 0-9, the target digit to land on
  placeFromRight: number  // 0 = ones, 1 = tens, 2 = hundreds, …
  totalDigits:    number  // total digit count in the formatted number
  spinAt:         number  // when this number's spin started (0 = not yet shown)
}

function Drum({ digit, placeFromRight, totalDigits, spinAt }: DrumProps) {
  const trackRef  = useRef<HTMLSpanElement>(null)
  const prevDigit = useRef(digit)

  // Higher places take a little longer, so the number settles right to left…
  const dur = 850 + placeFromRight * 90
  // …and start a beat later from the left
  const del = (totalDigits - 1 - placeFromRight) * 45

  // Resting on the second copy keeps a full 0-9 above every digit to roll through
  const at = (cell: number, transition = 'none') => {
    const el = trackRef.current
    if (!el) return
    el.style.transition = transition
    el.style.transform  = `translate3d(0, ${-cell}em, 0)`
  }
  const restart = () => { void trackRef.current?.offsetHeight }

  // The roll. Layout effect: a drum mounting after the roll is over shows its
  // digit on the first paint; one mounting mid-roll (a digit-count change)
  // joins it through a negative transition delay.
  useLayoutEffect(() => {
    const d = prevDigit.current
    if (!spinAt) { at(10 + d); return }
    const elapsed = performance.now() - spinAt
    if (elapsed >= del + dur) { at(10 + d); return }
    at(0)
    restart()
    at(10 + d, `transform ${dur}ms ${EASE} ${del - elapsed}ms`)
  }, [spinAt, dur, del])

  // A value change. Mid-roll: glide on to the new digit. Settled: a short
  // forward roll from the old digit to the new one.
  useLayoutEffect(() => {
    const from = prevDigit.current
    prevDigit.current = digit
    if (from === digit) return
    if (!spinAt) { at(10 + digit); return }
    const left = spinAt + del + dur - performance.now()
    if (left > 0) { at(10 + digit, `transform ${Math.max(250, left)}ms ${EASE}`); return }
    // Forward only: from a higher digit, wrap via the same face on the first copy
    if (digit < from) { at(from); restart() }
    at(10 + digit, `transform ${ROLL_MS}ms ${EASE}`)
  }, [digit, spinAt, dur, del])

  const cell: React.CSSProperties = { display: 'block', height: '1em', lineHeight: '1' }
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', height: '1em', fontFamily: "var(--font-big-shoulders)", WebkitTextFillColor: 'currentColor' }}>
      {/* Resting position in the markup too, so server HTML shows the digit, not "0" */}
      <span ref={trackRef} style={{ display: 'block', willChange: 'transform', transform: `translate3d(0, ${-(10 + digit)}em, 0)` }}>
        {CELLS.map((d, i) => <span key={i} style={cell}>{d}</span>)}
      </span>
    </span>
  )
}

// ── Public component ──────────────────────────────────────────────────────────
interface Props {
  value:      number
  format:     (n: number) => string
  className?: string
}

export function SlotNumber({ value, format, className }: Props) {
  // One spin per screen visit, timed per number. Its digits share the start
  // time, so a value that settles in stages (a reload's lists arriving one by
  // one) lands mid-spin instead of restarting it, and a drum remounted by a
  // digit-count change joins in. A number that first appears later in the
  // visit (another pill, data arriving) gets its own spin. Not while the
  // screen is hidden (kept-alive), where nobody would see it.
  const visit = useScreenVisit()
  const spin  = useRef<{ visit: number; at: number } | null>(null)
  if (visit > 0 && spin.current?.visit !== visit) spin.current = { visit, at: performance.now() }
  const spinAt = visit > 0 ? spin.current!.at : 0

  const str    = format(value)
  const tokens = str.split('').map(c => ({ char: c, isDigit: /\d/.test(c) }))
  const total  = tokens.filter(t => t.isDigit).length

  let di = 0
  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center' }}>
      {tokens.map((tok, i) => {
        if (!tok.isDigit) return <span key={i} style={{ lineHeight: 1 }}>{tok.char}</span>
        const digitIdx      = di++
        const placeFromRight = total - 1 - digitIdx
        return (
          <Drum
            key={`${total}-${digitIdx}`}
            digit={parseInt(tok.char)}
            placeFromRight={placeFromRight}
            totalDigits={total}
            spinAt={spinAt}
          />
        )
      })}
    </span>
  )
}
