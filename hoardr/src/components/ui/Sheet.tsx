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
  /**
   * Where the action lives. 'bottom' (default, forms): a big button pinned to
   * the bottom of the sheet, in thumb reach after filling the form top-down.
   * 'nav': the iOS nav-bar slot, for non-form sheets like a settings "Done".
   */
  actionPlacement?: 'bottom' | 'nav'
  /** Scroll container ref, for field auto-advance. */
  scrollRef?: React.RefObject<HTMLDivElement | null>
  children:  React.ReactNode
}

// UIKit's sheet presentation curve
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)'
const OPEN_MS  = 480
const CLOSE_MS = 340

// Typed-into fields that Enter steps through, in DOM order. Dates, toggles and
// pickers are left out: they open their own UI.
const FIELD_SEL = [
  'input:not([type=hidden]):not([type=date]):not([type=time]):not([type=checkbox]):not([type=radio])' +
    ':not([type=range]):not([type=color]):not([type=file]):not([disabled]):not([readonly])',
  'textarea:not([disabled]):not([readonly])',
].join(',')

function fieldsIn(root: HTMLElement): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(FIELD_SEL)).filter(el => el.getClientRects().length > 0)
}

/** Scroll `el` into the visible part of the sheet (above the keyboard) if it isn't. */
function revealField(sc: HTMLElement, el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const box = sc.getBoundingClientRect()
  const bottom = Math.min(box.bottom, (window.visualViewport?.height ?? window.innerHeight) - 16)
  if (r.top >= box.top + 12 && r.bottom <= bottom) return
  sc.scrollTo({ top: sc.scrollTop + r.top - box.top - Math.max(12, (bottom - box.top) / 3), behavior: 'smooth' })
}

export function Sheet({ open, onClose, title, action, cancelLabel = 'Cancel', actionPlacement = 'bottom', scrollRef, children }: Props) {
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

  // Enter moves to the next field (like Tab). The last field closes the
  // keyboard on phone and performs the action on PC. Native listener on the
  // scroll area, so it runs before any per-input React onKeyDown (those only
  // blur, which is then a no-op). The return key reads "next" while there is
  // a field after the focused one.
  useEffect(() => {
    if (!open || !present) return
    const sc = scrollEl.current
    if (!sc) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' || e.shiftKey || e.metaKey || e.ctrlKey || e.altKey || e.isComposing) return
      const t = e.target as HTMLElement
      if (t.tagName !== 'INPUT' || !t.matches(FIELD_SEL)) return
      const list = fieldsIn(sc)
      const i = list.indexOf(t)
      if (i < 0) return
      e.preventDefault()
      const next = list[i + 1]
      if (next) {
        next.focus({ preventScroll: true })
        revealField(sc, next)
      } else if (large && action && !action.disabled) {
        action.onClick()
      } else {
        t.blur()
      }
    }
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement
      if (t.tagName !== 'INPUT' || !t.matches(FIELD_SEL)) return
      const list = fieldsIn(sc)
      t.setAttribute('enterkeyhint', list.indexOf(t) < list.length - 1 ? 'next' : 'done')
    }
    sc.addEventListener('keydown', onKeyDown)
    sc.addEventListener('focusin', onFocusIn)
    return () => { sc.removeEventListener('keydown', onKeyDown); sc.removeEventListener('focusin', onFocusIn) }
  }, [open, present, scrollEl, large, action])

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
  const bottomAction = !!action && actionPlacement === 'bottom'

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
        {action && actionPlacement === 'nav' ? (
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
        paddingBottom: bottomAction ? 20 : large ? 24 : 'calc(env(safe-area-inset-bottom, 0px) + 40px)',
      }}
    >
      {children}
    </div>
  )

  // Primary action pinned under the scroll area, always in thumb reach
  const footer = bottomAction && action && (
    <div
      className="flex-shrink-0 px-4 pt-3"
      style={{
        paddingBottom: large ? 16 : 'calc(env(safe-area-inset-bottom, 0px) + 12px)',
        borderTop: '0.5px solid rgb(var(--rgb-ink) / 0.08)',
        background: 'var(--color-bg-surface)',
      }}
    >
      <button
        type="button"
        onClick={() => { if (!action.disabled) { haptic('confirm'); action.onClick() } }}
        disabled={action.disabled}
        className="sheet-primary-btn w-full h-[52px] rounded-[14px] text-[17px] font-semibold select-none transition-[transform,opacity] duration-150 active:scale-[0.98] disabled:opacity-35 disabled:active:scale-100"
        style={{
          background: 'linear-gradient(160deg, #E9CD7A 0%, #D4AF37 45%, #B08A2A 100%)',
          color: '#1a1200',
          boxShadow: action.disabled ? 'none' : 'inset 0 1px 0 rgba(255,255,255,0.4), 0 6px 18px rgba(212,175,55,0.22)',
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        {action.label}
      </button>
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
            {footer}
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
          {footer}
        </div>
      )}
    </>,
    document.body,
  )
}
