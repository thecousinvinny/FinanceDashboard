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

// The slide (globals.css: tab-in-* runs 420ms) plus a frame or two of capture
const SLIDE_MS = 480
let slideEndsAt = 0
// Resolves two frames after the running slide finishes; null when none runs
let slideDone: Promise<void> | null = null

/**
 * Entrance animations (number rolls, bars growing, the sparkline reveal) wait
 * for the tab slide. iOS Safari re-captures the incoming screen every frame of
 * a view transition, so anything animating inside it turns choppy — and the
 * frame where it hands back to the live page is a hitch of its own, so they
 * start two frames after the slide really ends, not at an estimate.
 * No wait on first load or after the greeting, where nothing slides.
 */
export function onSlideDone(cb: () => void): () => void {
  let live = true
  if (slideDone) slideDone.then(() => { if (live) cb() })
  else cb()
  return () => { live = false }
}

/** setTimeout that starts counting once the slide is done; returns a cancel. */
export function afterSlideTimeout(cb: () => void, ms: number): () => void {
  let t: ReturnType<typeof setTimeout> | undefined
  const cancel = onSlideDone(() => { t = setTimeout(cb, ms) })
  return () => { cancel(); clearTimeout(t) }
}

/**
 * iOS Safari can leave a scroll area nested in a position:fixed screen dead to
 * touch after a view transition (the calendar's lists: swipes did nothing).
 * Toggling overflow makes WebKit rebuild the scrolling layer. Scroll areas opt
 * in with `data-touch-scroll`; their position is kept.
 */
function revive() {
  document.querySelectorAll<HTMLElement>('.screen-active [data-touch-scroll]').forEach(el => {
    const top = el.scrollTop, prev = el.style.overflowY
    el.style.overflowY = 'hidden'
    void el.offsetHeight
    el.style.overflowY = prev
    el.scrollTop = top
  })
}

/** Estimated ms until the slide ends (for CSS animation delays). */
export function afterSlide(ms = 0): number {
  return Math.max(ms, slideEndsAt - performance.now())
}

/**
 * Switch screens with a directional slide + fade. Uses the View Transitions
 * API: the browser snapshots the old and new screen and animates the
 * snapshots, so the screens' position:fixed FABs and sheets aren't disturbed
 * (a CSS transform on the screen wrapper would re-anchor them). The tab bar
 * and avatar have their own transition names and stay put (globals.css).
 * Without support (iOS < 18) or with reduced motion it's the plain switch.
 */
export function navigateTab(path: string, mode: 'replace' | 'push' = 'replace') {
  const from = pending ?? window.location.pathname
  if (from === path) return
  // Kept-alive screens need nothing from the server (their page.tsx renders
  // null), so the URL changes in place — Next 15 tracks the native history API.
  // A router navigation fetched the route from the server on every tap, and
  // after a deploy that fetch saw a new build and hard-reloaded the whole app.
  // Tabs replace (no back-swipe between them); Profile/Settings push.
  const go = () => {
    setPendingPath(path)
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', path)
  }
  const doc = document as VTDocument
  if (!doc.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    go()
    return
  }
  const root = document.documentElement
  // The snapshots do the animating; the screen's own fade-in would double it
  root.classList.add('vt')
  root.dataset.tabDir = rank(path) >= rank(from) ? 'fwd' : 'back'
  slideEndsAt = performance.now() + SLIDE_MS
  const vt = doc.startViewTransition(() => flushSync(go))
  const done: Promise<void> = vt.finished.catch(() => {}).then(() => new Promise<void>(r =>
    requestAnimationFrame(() => requestAnimationFrame(() => r()))))
  slideDone = done
  done.then(revive)
  vt.finished.finally(() => { delete root.dataset.tabDir; slideEndsAt = Math.min(slideEndsAt, performance.now()) })
  done.then(() => { if (slideDone === done) slideDone = null })
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

// ── First screen ready (load screen) ─────────────────────────────────────────
// The load screen (BootSplash) stays up until the visible screen has its data.
// Sticky: a listener added after it fired runs at once.
let firstReady = false
const readyListeners = new Set<() => void>()
export function onScreenReady(cb: () => void): () => void {
  if (firstReady) { cb(); return () => {} }
  readyListeners.add(cb)
  return () => { readyListeners.delete(cb) }
}
/** Screens call this with "my data is loaded"; the visible one releases the load screen. */
export function useScreenReady(ready: boolean) {
  const active = useScreenActive()
  useEffect(() => {
    if (!ready || !active || firstReady) return
    firstReady = true
    readyListeners.forEach(l => l())
    readyListeners.clear()
  }, [ready, active])
}

// ── Replay ───────────────────────────────────────────────────────────────────
// Counts as a fresh visit to the visible screen, so its entrance animations
// play again — used when the greeting, which covered them, goes away.
const replayListeners = new Set<() => void>()
export function replayActiveScreen() { replayListeners.forEach(l => l()) }
export function onReplayActiveScreen(l: () => void) { replayListeners.add(l); return () => { replayListeners.delete(l) } }

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
    const returning = active && !prev.current
    prev.current = active
    if (!returning) return
    // After the slide and most of the entrance: the refresh's results (and the
    // comparison work on them) used to land mid number-roll and hitch it.
    // Nearly always nothing changed; when something did, it eases in.
    return afterSlideTimeout(() => cbRef.current(), REFRESH_DELAY_MS)
  }, [active])
}
const REFRESH_DELAY_MS = 900
