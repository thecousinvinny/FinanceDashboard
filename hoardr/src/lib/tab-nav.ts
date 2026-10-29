'use client'

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'

/**
 * Keep-alive screens (see components/nav/ScreenKeepAlive.tsx).
 *
 * Each screen stays mounted after its first render; switching tabs only
 * toggles which one is visible. These helpers let a screen know whether it's
 * the visible one, and let navigation switch screens instantly instead of
 * waiting for the route transition to commit.
 */

// ── Optimistic active path ───────────────────────────────────────────────────
// Set on tap; cleared once the router's pathname catches up.
let pending: string | null = null
const listeners = new Set<() => void>()

export function setPendingPath(path: string) {
  if (pending === path) return
  pending = path
  listeners.forEach(l => l())
}
export function clearPendingPath() {
  if (pending === null) return
  pending = null
  listeners.forEach(l => l())
}
function subscribe(l: () => void) { listeners.add(l); return () => { listeners.delete(l) } }

/** The path being shown: the tapped destination if navigation is in flight, else the URL. */
export function useActivePath(): string {
  const pathname = usePathname()
  const p = useSyncExternalStore(subscribe, () => pending, () => null)
  return p ?? pathname
}

// ── Per-screen visibility ────────────────────────────────────────────────────
export const ScreenActiveContext = createContext(true)

/** True while this screen is the visible one (always true outside keep-alive). */
export function useScreenActive(): boolean {
  return useContext(ScreenActiveContext)
}

/**
 * Runs `cb` each time this screen becomes visible again (not on first mount —
 * the screen's own mount effect handles that). Used to refresh data in the
 * background, since a kept-alive screen no longer refetches by remounting.
 */
export function useOnScreenReturn(cb: () => void) {
  const active  = useScreenActive()
  const prev    = useRef(active)
  const cbRef   = useRef(cb)
  cbRef.current = cb
  useEffect(() => {
    if (active && !prev.current) cbRef.current()
    prev.current = active
  }, [active])
}
