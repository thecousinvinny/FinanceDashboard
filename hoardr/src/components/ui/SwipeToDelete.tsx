'use client'

import { useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const REVEAL   = 80    // px to show action button
const AUTO     = 200   // px to auto-confirm
const TAP_SLOP = 10    // max movement still counted as a tap

interface Props {
  onDelete:       () => void
  children:       React.ReactNode
  className?:     string
  actionLabel?:   React.ReactNode
  actionBg?:      string
  onTap?:         () => void
  // right-swipe (buy / pay)
  onRight?:       () => void
  rightLabel?:    React.ReactNode
  rightBg?:       string
}

const DEFAULT_DELETE_ICON = <Trash2 size={18} strokeWidth={1.5} />

export function SwipeToDelete({
  onDelete, children, className,
  actionLabel = DEFAULT_DELETE_ICON, actionBg = 'bg-ruby', onTap,
  onRight, rightLabel, rightBg = 'bg-emerald-600',
}: Props) {
  const outerRef          = useRef<HTMLDivElement>(null)
  const slideRef          = useRef<HTMLDivElement>(null)
  const leftActionRef     = useRef<HTMLDivElement>(null)   // shows on right swipe (x > 0)
  const rightActionRef    = useRef<HTMLDivElement>(null)   // shows on left swipe  (x < 0)
  const startX            = useRef(0)
  const startY            = useRef(0)
  const curX              = useRef(0)
  const revealed          = useRef<'none' | 'left' | 'right'>('none')
  const dir               = useRef<'h' | 'v' | null>(null)
  const startWasRevealed  = useRef<'none' | 'left' | 'right'>('none')
  const didSwipe          = useRef(false)
  const mouseDown         = useRef(false)

  function setPos(x: number, animate: boolean) {
    const el  = slideRef.current
    if (!el) return
    const ease = animate ? 'transform 0.25s cubic-bezier(0.25,1,0.5,1)' : 'none'
    el.style.transition = ease
    el.style.transform  = `translateX(${x}px)`
    curX.current = x

    const la = leftActionRef.current
    const ra = rightActionRef.current
    if (la) {
      la.style.transition = animate ? 'opacity 0.25s' : 'none'
      la.style.opacity    = String(Math.min(1, Math.max(0, x / REVEAL)))
    }
    if (ra) {
      ra.style.transition = animate ? 'opacity 0.25s' : 'none'
      ra.style.opacity    = String(Math.min(1, Math.max(0, -x / REVEAL)))
    }
  }

  function triggerDelete() {
    setPos(-window.innerWidth, true)
    setTimeout(onDelete, 240)
  }

  function triggerRight() {
    setPos(window.innerWidth, true)
    setTimeout(() => { onRight?.(); setPos(0, true); revealed.current = 'none' }, 240)
  }

  // Non-passive touchmove to preventDefault on horizontal swipes
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const handler = (e: TouchEvent) => { if (dir.current === 'h') e.preventDefault() }
    el.addEventListener('touchmove', handler, { passive: false })
    return () => el.removeEventListener('touchmove', handler)
  }, [])

  function clampX(dx: number) {
    const base = revealed.current === 'right' ? REVEAL : revealed.current === 'left' ? -REVEAL : 0
    const raw  = base + dx
    const minX = -(AUTO + 20)
    const maxX = onRight ? (AUTO + 20) : 0
    return Math.min(maxX, Math.max(minX, raw))
  }

  // ── Touch ────────────────────────────────────────────────────────────────

  function onTouchStart(e: React.TouchEvent) {
    startX.current           = e.touches[0].clientX
    startY.current           = e.touches[0].clientY
    dir.current              = null
    startWasRevealed.current = revealed.current
    didSwipe.current         = false
    setPos(curX.current, false)
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current
    if (!dir.current) dir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) didSwipe.current = true
    if (dir.current !== 'h') return
    setPos(clampX(dx), false)
  }

  function onTouchEnd(e: React.TouchEvent) {
    const x = curX.current
    dir.current = null
    if (x >= AUTO && onRight) {
      triggerRight()
    } else if (x > REVEAL / 2 && onRight) {
      setPos(REVEAL, true)
      revealed.current = 'right'
    } else if (x <= -AUTO) {
      triggerDelete()
    } else if (x < -(REVEAL / 2)) {
      setPos(-REVEAL, true)
      revealed.current = 'left'
    } else {
      setPos(0, true)
      revealed.current = 'none'
      const target = e.changedTouches[0]?.target as Element | null
      const isInteractive = !!target?.closest('button, a, input, [role="button"]')
      if (!didSwipe.current && startWasRevealed.current === 'none' && !isInteractive) onTap?.()
    }
  }

  // ── Mouse ────────────────────────────────────────────────────────────────

  function onMouseDown(e: React.MouseEvent) {
    mouseDown.current        = true
    startX.current           = e.clientX
    startY.current           = e.clientY
    dir.current              = null
    startWasRevealed.current = revealed.current
    didSwipe.current         = false
    setPos(curX.current, false)
  }

  function onMouseMove(e: React.MouseEvent) {
    if (!mouseDown.current) return
    const dx = e.clientX - startX.current
    const dy = e.clientY - startY.current
    if (!dir.current) dir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    if (Math.abs(dx) > TAP_SLOP || Math.abs(dy) > TAP_SLOP) didSwipe.current = true
    if (dir.current !== 'h') return
    e.preventDefault()
    setPos(clampX(dx), false)
  }

  function onMouseUp() {
    if (!mouseDown.current) return
    mouseDown.current = false
    const x = curX.current
    dir.current = null
    if (x >= AUTO && onRight) {
      triggerRight()
    } else if (x > REVEAL / 2 && onRight) {
      setPos(REVEAL, true)
      revealed.current = 'right'
    } else if (x <= -AUTO) {
      triggerDelete()
    } else if (x < -(REVEAL / 2)) {
      setPos(-REVEAL, true)
      revealed.current = 'left'
    } else {
      setPos(0, true)
      revealed.current = 'none'
      if (!didSwipe.current && startWasRevealed.current === 'none') onTap?.()
    }
  }

  return (
    <div ref={outerRef} className={cn('relative overflow-hidden bg-bg-surface', className)}>
      {/* Left action zone (revealed on right swipe — buy/pay) */}
      {onRight && (
        <div
          ref={leftActionRef}
          className={cn('absolute inset-y-0 left-0 flex items-center justify-center cursor-pointer select-none text-white', rightBg)}
          style={{ width: REVEAL, opacity: 0 }}
          onClick={triggerRight}
        >
          {rightLabel}
        </div>
      )}

      {/* Right action zone (revealed on left swipe — delete/cancel) */}
      <div
        ref={rightActionRef}
        className={cn('absolute inset-y-0 right-0 flex items-center justify-center cursor-pointer select-none text-white', actionBg)}
        style={{ width: REVEAL, opacity: 0 }}
        onClick={triggerDelete}
      >
        {actionLabel}
      </div>

      {/* Sliding content */}
      <div
        ref={slideRef}
        style={{ willChange: 'transform' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        {children}
      </div>
    </div>
  )
}
