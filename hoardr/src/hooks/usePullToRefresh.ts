'use client'
import { useEffect, useRef, useState } from 'react'
import { useScreenActive } from '@/lib/tab-nav'

const THRESHOLD = 72
const MAX_PULL  = THRESHOLD + 28

/**
 * Pull-to-refresh that never re-renders while the finger moves. The old
 * version set React state on every touchmove — re-rendering the whole tab per
 * frame — and grew a spacer that pushed content down, so pulls juddered.
 * Now the floating indicator (see PullIndicator) is moved directly through
 * `indicatorRef` inside a rAF; React state changes only when a refresh starts
 * and ends. On iOS the page's own rubber-band bounce provides the stretch.
 */
export function usePullToRefresh(onRefresh: () => void | Promise<unknown>) {
  const [refreshing, setRefreshing] = useState(false)
  const indicatorRef  = useRef<HTMLDivElement>(null)
  const startY        = useRef<number | null>(null)
  const distRef       = useRef(0)
  const refreshingRef = useRef(false)
  const frame         = useRef(0)
  const onRefreshRef  = useRef(onRefresh)
  onRefreshRef.current = onRefresh
  // Screens stay mounted when hidden — only the visible one may listen
  const active = useScreenActive()

  useEffect(() => {
    if (!active) return

    const paint = (d: number, animate: boolean) => {
      const el = indicatorRef.current
      if (!el) return
      const p = Math.min(d / THRESHOLD, 1)
      el.style.transition = animate ? 'transform 0.35s cubic-bezier(0.32,0.72,0,1), opacity 0.25s ease' : 'none'
      el.style.opacity    = d > 4 ? String(Math.min(1, p * 1.4)) : '0'
      el.style.transform  = `translate(-50%, ${Math.min(d, MAX_PULL) * 0.7 - 44}px) scale(${0.7 + p * 0.3})`
      const icon = el.firstElementChild as HTMLElement | null
      if (icon) icon.style.transform = `rotate(${p * 270}deg)`
    }

    const onTouchStart = (e: TouchEvent) => {
      // A sheet is open (it locks the body) — not a page pull
      if (document.body.style.position === 'fixed' || refreshingRef.current) return
      if (window.scrollY <= 0) startY.current = e.touches[0].clientY
    }
    const onTouchMove = (e: TouchEvent) => {
      if (startY.current === null) return
      const dy = e.touches[0].clientY - startY.current
      if (dy <= 0) { startY.current = null; distRef.current = 0; paint(0, true); return }
      // Resistance curve: easy at first, firmer as it stretches
      distRef.current = Math.min(MAX_PULL, dy * 0.5)
      cancelAnimationFrame(frame.current)
      frame.current = requestAnimationFrame(() => paint(distRef.current, false))
    }
    const onTouchEnd = () => {
      if (startY.current === null) return
      startY.current = null
      const d = distRef.current
      distRef.current = 0
      if (d >= THRESHOLD && !refreshingRef.current) {
        refreshingRef.current = true
        setRefreshing(true)
        paint(THRESHOLD, true)   // park at the "loading" spot
        const started = Date.now()
        Promise.resolve(onRefreshRef.current()).finally(() => {
          // Keep the spinner up long enough to read as a refresh
          setTimeout(() => {
            refreshingRef.current = false
            setRefreshing(false)
            paint(0, true)
          }, Math.max(0, 600 - (Date.now() - started)))
        })
      } else {
        paint(0, true)
      }
    }

    document.addEventListener('touchstart', onTouchStart, { passive: true })
    document.addEventListener('touchmove',  onTouchMove,  { passive: true })
    document.addEventListener('touchend',   onTouchEnd,   { passive: true })
    document.addEventListener('touchcancel', onTouchEnd,  { passive: true })
    return () => {
      cancelAnimationFrame(frame.current)
      document.removeEventListener('touchstart', onTouchStart)
      document.removeEventListener('touchmove',  onTouchMove)
      document.removeEventListener('touchend',   onTouchEnd)
      document.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [active])

  return { indicatorRef, refreshing, threshold: THRESHOLD }
}
