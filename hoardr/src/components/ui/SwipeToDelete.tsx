'use client'

import { useRef, useEffect } from 'react'
import { cn } from '@/lib/utils'

const REVEAL = 80   // px to show delete button
const AUTO   = 200  // px to auto-confirm delete

interface Props {
  onDelete:      () => void
  children:      React.ReactNode
  className?:    string
  actionLabel?:  React.ReactNode   // default: 🗑️
  actionBg?:     string            // default: bg-ruby
}

export function SwipeToDelete({ onDelete, children, className, actionLabel = '🗑️', actionBg = 'bg-ruby' }: Props) {
  const outerRef   = useRef<HTMLDivElement>(null)
  const slideRef   = useRef<HTMLDivElement>(null)
  const startX     = useRef(0)
  const startY     = useRef(0)
  const curX       = useRef(0)
  const revealed   = useRef(false)
  const dir        = useRef<'h' | 'v' | null>(null)

  function setPos(x: number, animate: boolean) {
    const el = slideRef.current
    if (!el) return
    el.style.transition = animate ? 'transform 0.25s cubic-bezier(0.25,1,0.5,1)' : 'none'
    el.style.transform  = `translateX(${x}px)`
    curX.current = x
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

  function onTouchStart(e: React.TouchEvent) {
    startX.current = e.touches[0].clientX
    startY.current = e.touches[0].clientY
    dir.current    = null
    setPos(curX.current, false) // disable transition while dragging
  }

  function onTouchMove(e: React.TouchEvent) {
    const dx = e.touches[0].clientX - startX.current
    const dy = e.touches[0].clientY - startY.current

    if (!dir.current) {
      dir.current = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'
    }
    if (dir.current !== 'h') return

    const base = revealed.current ? -REVEAL : 0
    const next = Math.min(0, Math.max(-AUTO - 20, base + dx))
    setPos(next, false)
  }

  function onTouchEnd() {
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
    }
  }

  return (
    <div ref={outerRef} className={cn('relative overflow-hidden', className)}>
      {/* Delete zone revealed on swipe */}
      <div
        className={cn('absolute inset-y-0 right-0 flex items-center justify-center cursor-pointer select-none', actionBg)}
        style={{ width: REVEAL }}
        onClick={triggerDelete}
      >
        <span className="text-[18px] text-white font-semibold">{actionLabel}</span>
      </div>

      {/* Sliding row content */}
      <div
        ref={slideRef}
        style={{ willChange: 'transform' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {children}
      </div>
    </div>
  )
}
