'use client'

import { useRef, useEffect } from 'react'
import { Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils'

const REVEAL   = 80   // px to show delete button
const AUTO     = 200  // px to auto-confirm delete
const TAP_SLOP = 10   // max movement (any direction) still counted as a tap

interface Props {
  onDelete:      () => void
  children:      React.ReactNode
  className?:    string
  actionLabel?:  React.ReactNode
  actionBg?:     string   // default: bg-ruby
  onTap?:        () => void
}

const DEFAULT_ICON = <Trash2 size={18} strokeWidth={1.5} />

export function SwipeToDelete({ onDelete, children, className, actionLabel = DEFAULT_ICON, actionBg = 'bg-ruby', onTap }: Props) {
  const outerRef          = useRef<HTMLDivElement>(null)
  const slideRef          = useRef<HTMLDivElement>(null)
  const actionRef         = useRef<HTMLDivElement>(null)
  const startX            = useRef(0)
  const startY            = useRef(0)
  const curX              = useRef(0)
  const revealed          = useRef(false)
  const dir               = useRef<'h' | 'v' | null>(null)
  const startWasRevealed  = useRef(false)
  const didSwipe          = useRef(false)
  const mouseDown         = useRef(false)

  function setPos(x: number, animate: boolean) {
    const el  = slideRef.current
    const act = actionRef.current
    if (!el) return
    const t = animate ? 'transform 0.25s cubic-bezier(0.25,1,0.5,1)' : 'none'
    el.style.transition = t
    el.style.transform  = `translateX(${x}px)`
    curX.current = x
    if (act) {
      act.style.transition = animate ? 'opacity 0.25s' : 'none'
      act.style.opacity    = String(Math.min(1, Math.abs(x) / REVEAL))
    }
  }

  function triggerDelete() {
    setPos(-window.innerWidth, true)
    setTimeout(onDelete, 240)
  }

  // Non-passive touchmove so we can preventDefault on horizontal swipes
  useEffect(() => {
    const el = outerRef.current
    if (!el) return
    const handler = (e: TouchEvent) => {
      if (dir.current === 'h') e.preventDefault()
    }
    el.addEventListener('touchmove', handler, { passive: false })
    return () => el.removeEventListener('touchmove', handler)
  }, [])

  // ── Touch handlers ───────────────────────────────────────────────────────

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
    const base = revealed.current ? -REVEAL : 0
    setPos(Math.min(0, Math.max(-AUTO - 20, base + dx)), false)
  }

  function onTouchEnd(e: React.TouchEvent) {
    const x = curX.current
    dir.current = null
    if (x <= -AUTO) {
      triggerDelete()
    } else if (x < -(REVEAL / 2)) {
      setPos(-REVEAL, true)
      revealed.current = true
    } else {
      setPos(0, true)
      revealed.current = false
      const target = e.changedTouches[0]?.target as Element | null
      const isInteractive = !!target?.closest('button, a, input, [role="button"]')
      if (!didSwipe.current && !startWasRevealed.current && !isInteractive) onTap?.()
    }
  }

  // ── Mouse handlers (desktop drag-to-delete) ──────────────────────────────

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
    const base = revealed.current ? -REVEAL : 0
    setPos(Math.min(0, Math.max(-AUTO - 20, base + dx)), false)
  }

  function onMouseUp() {
    if (!mouseDown.current) return
    mouseDown.current = false
    const x = curX.current
    dir.current = null
    if (x <= -AUTO) {
      triggerDelete()
    } else if (x < -(REVEAL / 2)) {
      setPos(-REVEAL, true)
      revealed.current = true
    } else {
      setPos(0, true)
      revealed.current = false
      if (!didSwipe.current && !startWasRevealed.current) onTap?.()
    }
  }

  return (
    <div ref={outerRef} className={cn('relative overflow-hidden bg-bg-surface', className)}>
      {/* Delete zone — starts invisible, fades in as user swipes */}
      <div
        ref={actionRef}
        className={cn('absolute inset-y-0 right-0 flex items-center justify-center cursor-pointer select-none text-white', actionBg)}
        style={{ width: REVEAL, opacity: 0 }}
        onClick={triggerDelete}
      >
        {actionLabel}
      </div>

      {/* Sliding row content */}
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
