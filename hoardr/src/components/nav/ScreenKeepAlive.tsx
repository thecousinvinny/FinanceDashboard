'use client'

import { memo, startTransition, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import HomeScreen from '@/app/(dashboard)/home/screen'
import OutScreen from '@/app/(dashboard)/money/screen'
import InScreen from '@/app/(dashboard)/in/screen'
import CalendarScreen from '@/app/(dashboard)/calendar/screen'
import ProfileScreen from '@/app/(dashboard)/profile/screen'
import SettingsScreen from '@/app/(dashboard)/settings/screen'
import { ScreenActiveContext, ScreenVisitContext, afterSlideTimeout, clearPendingPath, onReplayActiveScreen, useActivePath } from '@/lib/tab-nav'

/**
 * Keeps every main screen mounted once it has rendered, so switching tabs is
 * instant: no remount, no refetch-before-paint, scroll and UI state intact.
 *
 * The visible screen renders in normal flow. Hidden ones sit in a fixed,
 * invisible, inert layer — still laid out (the calendar measures itself to
 * scroll to today), but not painted, focusable or clickable, and not adding to
 * the page height. Their route `page.tsx` files render nothing.
 *
 * After the first screen paints, the rest mount one by one in idle time, so
 * the whole app is warm a moment after sign-in.
 */
const SCREENS: { path: string; Screen: React.ComponentType }[] = [
  { path: '/home',     Screen: HomeScreen     },
  { path: '/money',    Screen: OutScreen      },
  { path: '/in',       Screen: InScreen       },
  { path: '/calendar', Screen: CalendarScreen },
  { path: '/profile',  Screen: ProfileScreen  },
  { path: '/settings', Screen: SettingsScreen },
]
export const SCREEN_PATHS = SCREENS.map(s => s.path)

/**
 * A screen's own tree only re-renders through what it reads (its context, its
 * state) — not every time this switcher renders. Without this, each tab tap
 * re-rendered all six screens (the calendar's thousands of rows included)
 * inside the view transition's capture: tap → visible pause → slide.
 */
const ScreenBody = memo(function ScreenBody({ Screen }: { Screen: React.ComponentType }) {
  return <Screen />
})

const idle = (fn: () => void): (() => void) => {
  const w = window as Window & { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number; cancelIdleCallback?: (id: number) => void }
  if (w.requestIdleCallback) { const id = w.requestIdleCallback(fn, { timeout: 1500 }); return () => w.cancelIdleCallback?.(id) }
  const t = setTimeout(fn, 200); return () => clearTimeout(t)
}

export function ScreenKeepAlive() {
  const pathname = usePathname()
  const active   = useActivePath()
  const [mounted, setMounted] = useState<Set<string>>(() => new Set(SCREEN_PATHS.includes(active) ? [active] : []))
  const scrollPos = useRef<Record<string, number>>({})
  const activeRef = useRef(active)
  // How many times each screen has been shown — drives entrance animations.
  // Bumped during render (React's "adjust state on prop change"), not in an
  // effect: an effect landed one frame after the switch, so the screen first
  // painted its numbers settled from last time, then snapped them to 0 and
  // spun — a visible stutter, worst inside the tab slide.
  const [visits, setVisits] = useState<Record<string, number>>(() => ({ [active]: 1 }))
  const [shownPath, setShownPath] = useState(active)
  if (shownPath !== active) {
    setShownPath(active)
    setVisits(v => ({ ...v, [active]: (v[active] ?? 0) + 1 }))
  }

  // The screen being left is hidden at once (its wrapper's class), but it
  // hears "you're inactive" only after the slide, in idle time: re-rendering
  // a big screen on the way out delayed the switch as much as the new one.
  const [leaving, setLeaving] = useState<string | null>(null)
  const prevActive = useRef(active)
  if (prevActive.current !== active) {
    if (leaving !== prevActive.current) setLeaving(prevActive.current)
    prevActive.current = active
  }
  useEffect(() => {
    if (!leaving) return
    let cancelIdle = () => {}
    const cancelWait = afterSlideTimeout(() => {
      cancelIdle = idle(() => startTransition(() => setLeaving(null)))
    }, 120)
    return () => { cancelWait(); cancelIdle() }
  }, [leaving])

  // Replay the visible screen's entrance (see replayActiveScreen)
  useEffect(() => onReplayActiveScreen(() => {
    const p = activeRef.current
    setVisits(v => ({ ...v, [p]: (v[p] ?? 0) + 1 }))
  }), [])

  // The router caught up with an optimistic tap
  useEffect(() => { clearPendingPath() }, [pathname])

  // Mount the active screen immediately
  useEffect(() => {
    if (SCREEN_PATHS.includes(active) && !mounted.has(active)) setMounted(m => new Set(m).add(active))
  }, [active, mounted])

  // Then warm the rest in idle time, one per idle slot so none janks the UI
  useEffect(() => {
    const next = SCREEN_PATHS.find(p => !mounted.has(p))
    if (!next || mounted.size === 0) return
    return idle(() => setMounted(m => new Set(m).add(next)))
  }, [mounted])

  // Per-screen scroll position (they share the window's scroll)
  useEffect(() => {
    const onScroll = () => {
      if (document.body.style.position === 'fixed') return   // a sheet's scroll lock
      scrollPos.current[activeRef.current] = window.scrollY
    }
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])
  useLayoutEffect(() => {
    if (activeRef.current === active) return
    activeRef.current = active
    window.scrollTo(0, scrollPos.current[active] ?? 0)
  }, [active])

  return (
    <>
      {SCREENS.map(({ path, Screen }) => {
        if (!mounted.has(path)) return null
        const isActive = path === active
        return (
          <ScreenActiveContext.Provider key={path} value={isActive || path === leaving}>
            <ScreenVisitContext.Provider value={visits[path] ?? 0}>
            <div
              data-screen={path}
              inert={!isActive}
              aria-hidden={!isActive}
              className={isActive ? 'screen-active' : 'screen-hidden'}
            >
              <ScreenBody Screen={Screen} />
            </div>
            </ScreenVisitContext.Provider>
          </ScreenActiveContext.Provider>
        )
      })}
    </>
  )
}
