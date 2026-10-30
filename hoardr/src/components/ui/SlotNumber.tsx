'use client'

import { useLayoutEffect, useRef } from 'react'
import { useScreenVisit } from '@/lib/tab-nav'

// ── Single drum column for one digit ─────────────────────────────────────────
//
// The drum is two stacked cells — the digit in the window and the one rolling
// in under it — driven by requestAnimationFrame. It used to be a tall strip of
// up to ~60 digits slid with a CSS transform; iOS Safari only rasterizes part
// of a layer that tall, so during a tab's view transition the digits rolled
// through blank, unpainted stretches. Two cells are always fully painted.

// cubic-bezier(0.22, 1, 0.36, 1) ≈ easeOutQuint
const ease = (t: number) => 1 - Math.pow(1 - t, 5)
const ROLL_MS = 650

interface DrumProps {
  digit:          number  // 0-9, the target digit to land on
  placeFromRight: number  // 0 = ones, 1 = tens, 2 = hundreds, …
  totalDigits:    number  // total digit count in the formatted number
  spinAt:         number  // when this number's spin started (0 = not yet shown)
}

interface Roll { from: number; to: number; start: number; dur: number }

function Drum({ digit, placeFromRight, totalDigits, spinAt }: DrumProps) {
  const trackRef  = useRef<HTMLSpanElement>(null)
  const topRef    = useRef<HTMLSpanElement>(null)
  const nextRef   = useRef<HTMLSpanElement>(null)
  const roll      = useRef<Roll | null>(null)
  const raf       = useRef(0)
  const prevDigit = useRef(digit)

  // Higher-place digits get 2 extra full rotations each so they settle last
  const totalRotations = 2 + placeFromRight * 2
  // Duration increases 120ms per place to the left (ones fastest)
  const dur = 900 + placeFromRight * 120
  // Stagger start: left-to-right, 60ms per digit from left
  const del = (totalDigits - 1 - placeFromRight) * 60

  // Position in cells: the window shows floor(pos) % 10, sliding toward the next
  function show(pos: number) {
    const i = Math.floor(pos)
    if (topRef.current)   topRef.current.textContent  = String(((i % 10) + 10) % 10)
    if (nextRef.current)  nextRef.current.textContent = String((((i + 1) % 10) + 10) % 10)
    if (trackRef.current) trackRef.current.style.transform = `translateY(${-(pos - i)}em)`
  }

  function tick(now: number) {
    const r = roll.current
    if (!r) return
    const t = Math.min(1, Math.max(0, (now - r.start) / r.dur))
    show(r.from + (r.to - r.from) * ease(t))
    raf.current = t < 1 ? requestAnimationFrame(tick) : 0
    if (t >= 1) roll.current = null
  }

  function run(r: Roll) {
    roll.current = r
    cancelAnimationFrame(raf.current)
    raf.current = requestAnimationFrame(tick)
    show(r.from + (r.to - r.from) * ease(Math.min(1, Math.max(0, (performance.now() - r.start) / r.dur))))
  }

  useLayoutEffect(() => () => cancelAnimationFrame(raf.current), [])

  // The spin. Layout effect so a drum that mounts after the spin is over
  // shows its final digit on the first paint. A drum mounting mid-spin (a
  // digit-count change) joins at the spin's current point.
  useLayoutEffect(() => {
    if (!spinAt) return
    const end = totalRotations * 10 + prevDigit.current
    if (performance.now() >= spinAt + del + dur) { show(end); return }
    run({ from: 0, to: end, start: spinAt + del, dur })
  }, [spinAt, totalRotations, dur, del])

  // A value change. Mid-spin, retarget the spin to land on the new digit.
  // Once settled, roll a short way forward from the old digit to the new one.
  useLayoutEffect(() => {
    const from = prevDigit.current
    prevDigit.current = digit
    if (from === digit) return
    if (!spinAt) { show(digit); return }
    if (roll.current) { roll.current.to += digit - from; return }
    run({ from, to: digit > from ? digit : digit + 10, start: performance.now(), dur: ROLL_MS })
  }, [digit, spinAt])

  const cell: React.CSSProperties = { display: 'block', height: '1em', lineHeight: '1' }
  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', height: '1em', fontFamily: "var(--font-big-shoulders)", WebkitTextFillColor: 'currentColor' }}>
      <span ref={trackRef} style={{ display: 'block' }}>
        <span ref={topRef} style={cell}>{digit}</span>
        <span ref={nextRef} style={cell}>{(digit + 1) % 10}</span>
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
