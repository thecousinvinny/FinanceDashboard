'use client'

import { useEffect, useRef } from 'react'

// ── Single drum column for one digit ─────────────────────────────────────────
interface DrumProps {
  digit:          number  // 0-9, the target digit to land on
  placeFromRight: number  // 0 = ones, 1 = tens, 2 = hundreds, …
  totalDigits:    number  // total digit count in the formatted number
}

function Drum({ digit, placeFromRight, totalDigits }: DrumProps) {
  const trackRef = useRef<HTMLSpanElement>(null)
  const cellRef  = useRef<HTMLSpanElement>(null)

  // Higher-place digits get 2 extra full rotations each so they settle last
  const totalRotations = 2 + placeFromRight * 2
  // Stack: N full 0-9 cycles, then the exact target digit at the end
  const stack = Array.from({ length: totalRotations * 10 }, (_, i) => i % 10).concat(digit)

  useEffect(() => {
    const track = trackRef.current
    const cell  = cellRef.current
    if (!track || !cell) return

    // Measure actual rendered pixel height of one cell (handles any font-size)
    const h = cell.getBoundingClientRect().height
    if (!h) return

    const stackLen = totalRotations * 10 + 1
    const targetY  = -(stackLen - 1) * h

    // Duration increases 120ms per place to the left (ones fastest)
    const dur = 900 + placeFromRight * 120
    // Stagger start: left-to-right, 60ms per digit from left
    const del = (totalDigits - 1 - placeFromRight) * 60

    // Reset to top without transition, force reflow, then animate
    track.style.transition = 'none'
    track.style.transform  = 'translateY(0)'
    void track.offsetHeight
    track.style.transition = `transform ${dur}ms cubic-bezier(0.22,1,0.36,1) ${del}ms`
    track.style.transform  = `translateY(${targetY}px)`
  }, [digit, placeFromRight, totalDigits, totalRotations])

  return (
    <span style={{ display: 'inline-block', overflow: 'hidden', height: '1em' }}>
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
          />
        )
      })}
    </span>
  )
}
