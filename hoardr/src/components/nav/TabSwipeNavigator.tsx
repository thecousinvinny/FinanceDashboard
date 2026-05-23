'use client'

import { useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'

const TABS     = ['/home', '/money', '/in', '/calendar', '/studio', '/settings']
const EDGE_PX  = 35    // must start within this many px of the left or right edge
const MIN_DX   = 60    // minimum horizontal travel to count as a swipe
const H_RATIO  = 1.5   // |dx| must exceed |dy| × this (keeps it horizontal)

// Calendar, /money, and /in manage their own pill-aware swipe navigation.
const EXCLUDED = ['/calendar', '/money', '/in']

export function TabSwipeNavigator() {
  const pathname = usePathname()
  const router   = useRouter()

  useEffect(() => {
    if (EXCLUDED.some(p => pathname.startsWith(p))) return

    let start: { x: number; y: number } | null = null

    function onStart(e: TouchEvent) {
      if (document.body.style.position === 'fixed') return // a sheet is open
      const t = e.touches[0]
      const w = window.innerWidth
      if (t.clientX <= EDGE_PX || t.clientX >= w - EDGE_PX) {
        start = { x: t.clientX, y: t.clientY }
      }
    }

    function onEnd(e: TouchEvent) {
      if (!start) return
      const t  = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      start = null

      if (Math.abs(dx) < MIN_DX) return
      if (Math.abs(dy) > Math.abs(dx) / H_RATIO) return

      const idx = TABS.findIndex(tab => pathname === tab || pathname.startsWith(tab + '/'))
      if (idx === -1) return

      if (dx > 0 && idx > 0)               router.push(TABS[idx - 1]) // right swipe → prev tab
      if (dx < 0 && idx < TABS.length - 1) router.push(TABS[idx + 1]) // left swipe  → next tab
    }

    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchend',   onEnd,   { passive: true })
    return () => {
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchend',   onEnd)
    }
  }, [pathname, router])

  return null
}
