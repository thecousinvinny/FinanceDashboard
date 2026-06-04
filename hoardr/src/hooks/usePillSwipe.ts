'use client'
import { useEffect } from 'react'

const EDGE_PX = 35
const MIN_DX  = 60
const H_RATIO = 1.5

export function usePillSwipe<T extends string>(
  tab:     T,
  setTab:  (v: T) => void,
  options: readonly T[],
) {
  useEffect(() => {
    let start: { x: number; y: number } | null = null
    function onStart(e: TouchEvent) {
      if (document.body.style.position === 'fixed') return
      const t = e.touches[0], w = window.innerWidth
      if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX)
        start = { x: t.clientX, y: t.clientY }
    }
    function onEnd(e: TouchEvent) {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x, dy = t.clientY - start.y
      start = null
      if (Math.abs(dx) < MIN_DX || Math.abs(dy) > Math.abs(dx) / H_RATIO) return
      const idx = options.indexOf(tab)
      if (dx < 0) {
        if (idx < options.length - 1) setTab(options[idx + 1])
      } else {
        if (idx > 0) setTab(options[idx - 1])
      }
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [tab, setTab, options])
}
