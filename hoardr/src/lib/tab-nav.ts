'use client'

import { createContext, useContext, useEffect, useRef, useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
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

// Screen order, left to right: decides which way a tab change slides
const ORDER = ['/home', '/money', '/in', '/calendar', '/profile', '/settings']
const rank = (p: string) => ORDER.findIndex(o => p === o || p.startsWith(o + '/'))

type VTDocument = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } }

/**
 * Switch screens with a directional slide + fade. Uses the View Transitions
 * API: the browser snapshots the old and new screen and animates the
 * snapshots, so the screens' position:fixed FABs and sheets aren't disturbed
 * (a CSS transform on the screen wrapper would re-anchor them). The tab bar
 * and avatar have their own transition names and stay put (globals.css).
 * Without support (iOS < 18) or with reduced motion it's the plain switch.
 */
export function navigateTab(path: string) {
  const from = pending ?? window.location.pathname
  if (from === path) return
  const doc = document as VTDocument
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setPendingPath(path)
    return
  }
  const root = document.documentElement
  // The snapshots do the animating; the screen's own fade-in would double it
  root.classList.add('vt')
  root.dataset.tabDir = rank(path) >= rank(from) ? 'fwd' : 'back'
  const vt = doc.startViewTransition(() => flushSync(() => setPendingPath(path)))
  vt.finished.finally(() => { delete root.dataset.tabDir })
}

/** The path being shown: the tapped destination if navigation is in flight, else the URL. */
export function useActivePath(): string {
  const pathname = usePathname()
  const p = useSyncExternalStore(subscribe, () => pending, () => null)
  return p ?? pathname
}

// ── Per-screen visibility ────────────────────────────────────────────────────
export const ScreenActiveContext = createContext(true)
/** Increments each time the screen is shown (starts at 1 when first shown). */
export const ScreenVisitContext = createContext(1)
/** The screen's route ('' outside keep-alive). */
export const ScreenPathContext = createContext('')

export function useScreenPath(): string {
  return useContext(ScreenPathContext)
}

/** True while this screen is the visible one (always true outside keep-alive). */
export function useScreenActive(): boolean {
  return useContext(ScreenActiveContext)
}

/**
 * Changes every time this screen is shown. Entrance animations (number drums,
 * chart draw-ins) key off it: screens now mount hidden in the background, so
 * a mount-time animation would play unseen — and never replay on return.
 * 0 while the screen hasn't been shown yet.
 */
export function useScreenVisit(): number {
  return useContext(ScreenVisitContext)
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
