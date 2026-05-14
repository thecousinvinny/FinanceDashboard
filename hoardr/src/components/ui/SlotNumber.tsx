'use client'

import { useEffect, useRef, useState } from 'react'

interface Props {
  value:     number
  format:    (n: number) => string
  className?: string
  duration?:  number  // ms, default 900
}

export function SlotNumber({ value, format, className, duration = 900 }: Props) {
  const [display, setDisplay] = useState(0)
  const rafRef   = useRef<number>(0)
  const startRef = useRef<number>(0)

  useEffect(() => {
    cancelAnimationFrame(rafRef.current)
    startRef.current = 0

    function tick(ts: number) {
      if (!startRef.current) startRef.current = ts
      const t = Math.min((ts - startRef.current) / duration, 1)
      // ease-out expo
      const eased = t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)
      setDisplay(value * eased)
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafRef.current)
  }, [value, duration])

  return <span className={className}>{format(display)}</span>
}
