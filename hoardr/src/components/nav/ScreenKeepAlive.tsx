'use client'

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import HomeScreen from '@/app/(dashboard)/home/screen'
import OutScreen from '@/app/(dashboard)/money/screen'
import InScreen from '@/app/(dashboard)/in/screen'
import CalendarScreen from '@/app/(dashboard)/calendar/screen'
import ProfileScreen from '@/app/(dashboard)/profile/screen'
import SettingsScreen from '@/app/(dashboard)/settings/screen'
import { ScreenActiveContext, ScreenVisitContext, clearPendingPath, useActivePath } from '@/lib/tab-nav'

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
  // How many times each screen has been shown — drives entrance animations
  const [visits, setVisits] = useState<Record<string, number>>(() => ({ [active]: 1 }))
  const lastShown = useRef(active)
  useEffect(() => {
    if (lastShown.current === active) return
    lastShown.current = active
    setVisits(v => ({ ...v, [active]: (v[active] ?? 0) + 1 }))
  }, [active])

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
          <ScreenActiveContext.Provider key={path} value={isActive}>
            <ScreenVisitContext.Provider value={visits[path] ?? 0}>
            <div
              data-screen={path}
              inert={!isActive}
              aria-hidden={!isActive}
              className={isActive ? 'screen-active' : 'screen-hidden'}
            >
              <Screen />
            </div>
            </ScreenVisitContext.Provider>
          </ScreenActiveContext.Provider>
        )
      })}
    </>
  )
}
