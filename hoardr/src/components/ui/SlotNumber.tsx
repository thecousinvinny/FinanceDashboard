'use client'

import { useLayoutEffect, useRef } from 'react'
import { useScreenVisit } from '@/lib/tab-nav'

// ── Single drum column for one digit ─────────────────────────────────────────
interface DrumProps {
  digit:          number  // 0-9, the target digit to land on
  placeFromRight: number  // 0 = ones, 1 = tens, 2 = hundreds, …
  totalDigits:    number  // total digit count in the formatted number
  spinAt:         number  // when this number's spin started (0 = not yet shown)
}

function Drum({ digit, placeFromRight, totalDigits, spinAt }: DrumProps) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const cellRef  = useRef<HTMLSpanElement>(null)
  const prevDigit = useRef(digit)

  // Higher-place digits get 2 extra full rotations each so they settle last
  const totalRotations = 2 + placeFromRight * 2
  // Stack: N full 0-9 cycles, then the exact target digit at the end
  const stack = Array.from({ length: totalRotations * 10 }, (_, i) => i % 10).concat(digit)

  // Duration increases 120ms per place to the left (ones fastest)
  const dur = 900 + placeFromRight * 120
  // Stagger start: left-to-right, 60ms per digit from left
  const del = (totalDigits - 1 - placeFromRight) * 60

  // The spin. Layout effect so a drum that mounts after the spin is over
  // shows its final digit on the first paint, not a flash of "0".
  useLayoutEffect(() => {
    const track = trackRef.current
    const cell  = cellRef.current
    if (!track || !cell || !spinAt) return

    // Measure actual rendered pixel height of one cell (handles any font-size)
    const h = cell.getBoundingClientRect().height
    if (!h) return
    const targetY = -totalRotations * 10 * h

    const elapsed = performance.now() - spinAt

    track.style.transition = 'none'
    track.style.transform  = 'translateY(0)'
    void track.offsetHeight
    if (elapsed >= del + dur) {
      track.style.transform = `translateY(${targetY}px)`
      return
    }
    // A negative delay joins the spin already under way
    track.style.transition = `transform ${dur}ms cubic-bezier(0.22,1,0.36,1) ${del - elapsed}ms`
    track.style.transform  = `translateY(${targetY}px)`
  }, [spinAt, totalRotations, dur, del])

  // A value change. Mid-spin there's nothing to do: the last cell now holds
  // the new digit and the spin lands on it. Once settled, roll a short way
  // from the old digit to the new one instead of re-spinning from zero.
  useLayoutEffect(() => {
    const from = prevDigit.current
    prevDigit.current = digit
    const track = trackRef.current
    const cell  = cellRef.current
    if (from === digit || !track || !cell || !spinAt) return
    if (performance.now() - spinAt < del + dur) return
    const h = cell.getBoundingClientRect().height
    if (!h) return
    // Same face as before, one rotation back from the end, then roll forward
    track.style.transition = 'none'
    track.style.transform  = `translateY(${-((totalRotations - 1) * 10 + from) * h}px)`
    void track.offsetHeight
    track.style.transition = 'transform 650ms cubic-bezier(0.22,1,0.36,1)'
    track.style.transform  = `translateY(${-totalRotations * 10 * h}px)`
  }, [digit, spinAt, totalRotations, dur, del])

  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', height: '1em', fontFamily: "var(--font-big-shoulders)", WebkitTextFillColor: 'currentColor' }}>
      <span ref={trackRef} style={{ display: 'block' }}>
        {stack.map((d, i) => (
          <span
            key={i}
            ref={i === 0 ? cellRef : undefined}
            style={{ display: 'block', height: '1em', lineHeight: '1' }}
          >
            {d}
          </span>
        ))}
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
