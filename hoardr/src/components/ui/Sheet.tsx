'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useIsLargeScreen } from '@/lib/use-large-screen'
import { haptic } from '@/lib/utils'

/**
 * iOS-style modal sheet — the one sheet chrome for the app.
 *
 * Phone: a "large detent" card that rises with the system sheet curve, an
 * iOS nav bar (Cancel · Title · Action), and drag-to-dismiss from the grabber
 * / nav bar that follows the finger and honours a flick.
 * PC / iPad: a centered form sheet (like iPadOS / macOS) instead of a
 * full-width slab.
 *
 * Portaled to <body> so page transforms and stacking contexts never clip it.
 * Owns the body scroll lock and keyboard avoidance every sheet used to
 * copy-paste (see "Bottom sheet rules" in CLAUDE.md).
 */
export interface SheetAction {
  label:     string
  onClick:   () => void
  disabled?: boolean
}

interface Props {
  open:      boolean
  onClose:   () => void
  title:     string
  action?:   SheetAction
  /** Left button label. Defaults to "Cancel". */
  cancelLabel?: string
  /** Scroll container ref, for field auto-advance. */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  children:  React.ReactNode
}

// UIKit's sheet presentation curve
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OPEN_MS  = 480
const CLOSE_MS = 340

export function Sheet({ open, onClose, title, action, cancelLabel = 'Cancel', scrollRef, children }: Props) {
  const large = useIsLargeScreen()
  const [mounted, setMounted] = useState(false)
  // Kept rendered through the close animation
  const [present, setPresent] = useState(open)
  const [shown,   setShown]   = useState(false)
  const sheetRef  = useRef<HTMLDivElement>(null)
  const ownScroll = useRef<HTMLDivElement>(null)
  const scrollEl  = scrollRef ?? ownScroll
  const drag      = useRef<{ y: number; t: number; dy: number } | null>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (open) {
      setPresent(true)
      // two frames: mount off-screen, then transition in
      // Two frames so the off-screen state paints first; the timer covers
      // throttled rAF (background tabs, low-power mode)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      const t = setTimeout(() => setShown(true), 60)
      return () => { cancelAnimationFrame(r); clearTimeout(t) }
    }
    setShown(false)
    const t = setTimeout(() => setPresent(false), CLOSE_MS)
    return () => clearTimeout(t)
  }, [open])

  // Body scroll lock (iOS-safe: position:fixed, never overflow:hidden)
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    const body = document.body
    body.style.position = 'fixed'
    body.style.top = `-${scrollY}px`
    body.style.width = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    let lastY = 0
    const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY }
    const onMove  = (e: TouchEvent) => {
      const el = scrollEl.current
      // Leave the drag zone and pickers alone; block page scroll everywhere else
      if ((e.target as Element)?.closest?.('[data-sheet-drag]')) return
      if (!el?.contains(e.target as Node)) { e.preventDefault(); return }
      const dy = e.touches[0].clientY - lastY
      lastY = e.touches[0].clientY
      const { scrollTop, scrollHeight, clientHeight } = el
      if ((scrollTop <= 0 && dy > 0) || (scrollTop + clientHeight >= scrollHeight - 1 && dy < 0)) e.preventDefault()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: false })
    return () => {
      body.style.position = ''; body.style.top = ''; body.style.width = ''
      document.documentElement.style.overscrollBehavior = ''
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      window.scrollTo(0, scrollY)
    }
  }, [open, scrollEl])

  // Keyboard avoidance: pad the scroll area and lift the focused field
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const sc = scrollEl.current
      if (!sc) return
      const kbH = Math.max(0, window.innerHeight - vv.height)
      if (kbH > 50) {
        sc.style.paddingBottom = `${kbH + 24}px`
        requestAnimationFrame(() => {
          const focused = document.activeElement as HTMLElement | null
          if (!focused || !sc.contains(focused)) return
          const clearance = vv.height - 16
          const bottom = focused.getBoundingClientRect().bottom
          if (bottom > clearance) sc.scrollTop += bottom - clearance
        })
      } else {
        sc.style.paddingBottom = ''
      }
    }
    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      if (scrollEl.current) scrollEl.current.style.paddingBottom = ''
    }
  }, [open, scrollEl])

  // Esc closes; ⌘/Ctrl+Enter performs the action (PC)
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.select-menu, [data-daterange-picker]')) { e.preventDefault(); onClose() }
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey) && action && !action.disabled) { e.preventDefault(); action.onClick() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose, action])

  // ── Drag to dismiss (phone) ────────────────────────────────────────────────
  function onTouchStart(e: React.TouchEvent) {
    if ((e.target as Element).closest('button')) return
    drag.current = { y: e.touches[0].clientY, t: performance.now(), dy: 0 }
  }
  function onTouchMove(e: React.TouchEvent) {
    const d = drag.current, el = sheetRef.current
    if (!d || !el) return
    const raw = e.touches[0].clientY - d.y
    // Rubber-band when pulled up past the detent
    d.dy = raw >= 0 ? raw : -Math.sqrt(-raw) * 2
    el.style.transition = 'none'
    el.style.transform  = `translateY(${d.dy}px)`
  }
  function onTouchEnd() {
    const d = drag.current, el = sheetRef.current
    drag.current = null
    if (!d || !el) return
    const velocity = d.dy / Math.max(1, performance.now() - d.t)   // px/ms
    const dismiss  = d.dy > 120 || (d.dy > 24 && velocity > 0.5)
    el.style.transition = `transform ${dismiss ? CLOSE_MS : OPEN_MS}ms ${SHEET_EASE}`
    el.style.transform  = dismiss ? 'translateY(100%)' : ''
    if (dismiss) {
      haptic('tap')
      setTimeout(() => { el.style.transition = ''; el.style.transform = ''; onClose() }, CLOSE_MS)
    } else {
      setTimeout(() => { el.style.transition = '' }, OPEN_MS)
    }
  }

  if (!mounted || !present) return null

  const dur = shown ? OPEN_MS : CLOSE_MS

  const navBar = (
    <div
      data-sheet-drag
      onTouchStart={large ? undefined : onTouchStart}
      onTouchMove={large ? undefined : onTouchMove}
      onTouchEnd={large ? undefined : onTouchEnd}
      className="flex-shrink-0 select-none"
      style={{ touchAction: large ? undefined : 'none' }}
    >
      {!large && (
        <div className="flex justify-center pt-[7px]">
          <div className="w-9 h-[5px] rounded-full" style={{ background: 'rgb(var(--rgb-ink) / 0.22)' }} />
        </div>
      )}
      <div className="relative flex items-center justify-between h-[52px] px-2">
        <button
          type="button"
          onClick={onClose}
          className="sheet-nav-btn h-11 px-3 text-[17px] text-gold"
        >
          {cancelLabel}
        </button>
        <h2 className="absolute left-1/2 -translate-x-1/2 max-w-[55%] truncate text-[17px] font-semibold text-ink pointer-events-none tracking-[-0.01em]">
          {title}
        </h2>
        {action ? (
          <button
            type="button"
            onClick={() => { if (!action.disabled) { haptic('confirm'); action.onClick() } }}
            disabled={action.disabled}
            className="sheet-nav-btn h-11 px-3 text-[17px] font-semibold text-gold disabled:opacity-30"
          >
            {action.label}
          </button>
        ) : <span className="w-16" />}
      </div>
    </div>
  )

  const body = (
    <div
      ref={scrollEl}
      className="flex-1 overflow-y-auto overflow-x-hidden px-4"
      style={{
        overscrollBehavior: 'contain',
        paddingBottom: large ? 24 : 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
      }}
    >
      {children}
    </div>
  )

  return createPortal(
    <>
      <div
        onClick={onClose}
        className="fixed inset-0 z-[59]"
        style={{
          background: 'rgba(0,0,0,0.5)',
          opacity: shown ? 1 : 0,
          transition: `opacity ${dur}ms ${SHEET_EASE}`,
        }}
      />
      {large ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6 pointer-events-none">
          <div
            ref={sheetRef}
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="pointer-events-auto flex flex-col w-full max-w-[540px] rounded-[20px] overflow-hidden"
            style={{
              maxHeight: 'min(760px, calc(100dvh - 64px))',
              background: 'var(--color-bg-surface)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.55), 0 0 0 0.5px rgb(var(--rgb-ink) / 0.1)',
              opacity: shown ? 1 : 0,
              transform: shown ? 'none' : 'scale(0.96) translateY(12px)',
              transition: `opacity ${dur}ms ${SHEET_EASE}, transform ${dur}ms ${SHEET_EASE}`,
            }}
          >
            {navBar}
            {body}
          </div>
        </div>
      ) : (
        <div
          ref={sheetRef}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          className="fixed inset-x-0 bottom-0 z-[60] flex flex-col rounded-t-[14px]"
          style={{
            height: 'calc(100dvh - env(safe-area-inset-top, 44px) - 10px)',
            background: 'var(--color-bg-surface)',
            boxShadow: '0 -1px 0 rgb(var(--rgb-ink) / 0.06)',
            willChange: 'transform',
            transform: shown ? 'translateY(0)' : 'translateY(100%)',
            transition: `transform ${dur}ms ${SHEET_EASE}`,
          }}
        >
          {navBar}
          {body}
        </div>
      )}
    </>,
    document.body,
  )
}
