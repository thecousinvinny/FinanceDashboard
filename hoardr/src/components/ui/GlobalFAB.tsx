'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Plus, type LucideIcon } from 'lucide-react'
import { haptic } from '@/lib/utils'

export interface FABAction {
  Icon:  LucideIcon
  label: string
  onTap: () => void
}

// Spring for the button; UIKit's curve for the menu
const SPRING = 'cubic-bezier(0.34, 1.56, 0.64, 1)'
const EASE   = 'cubic-bezier(0.32, 0.72, 0, 1)'
const MENU_MS = 260

/**
 * Floating add button. One action → tapping runs it directly (no menu for a
 * single choice). Several → an iOS context-menu style frosted panel springs
 * out of the button, actions listed top-to-bottom with the primary one
 * closest to the thumb.
 */
export function GlobalFAB({ actions }: { actions: FABAction[] }) {
  const [open,    setOpen]    = useState(false)
  const [present, setPresent] = useState(false)
  const [shown,   setShown]   = useState(false)
  const [mounted, setMounted] = useState(false)
  const [pressed, setPressed] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const viaKeyboard = useRef(false)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (open) {
      setPresent(true)
      // Two frames so the off-screen state paints first; the timer covers
      // throttled rAF (background tabs, low-power mode)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      const t = setTimeout(() => setShown(true), 60)
      return () => { cancelAnimationFrame(r); clearTimeout(t) }
    }
    setShown(false)
    const t = setTimeout(() => setPresent(false), MENU_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    // Move focus into the menu for keyboard users only — on touch it would
    // paint the first row as highlighted
    if (viaKeyboard.current) requestAnimationFrame(() => menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus())
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  function onMain(e: React.MouseEvent) {
    viaKeyboard.current = e.detail === 0   // keyboard-activated clicks have no click count
    haptic('tap')
    if (actions.length === 1) { actions[0].onTap(); return }
    setOpen(v => !v)
  }

  function run(onTap: () => void) {
    haptic('tap')
    setOpen(false)
    // Let the menu start collapsing before the sheet rises over it
    setTimeout(onTap, 90)
  }

  const single = actions.length === 1
  const Icon   = single ? actions[0].Icon : Plus

  const menu = present && (
    <>
      {/* Dim the page behind. No backdrop blur: re-blurring the whole page
          every frame is what made the menu stutter on open. */}
      <div
        onClick={() => setOpen(false)}
        className="fixed inset-0"
        style={{
          zIndex: 45,
          background: 'rgba(0,0,0,0.32)',
          opacity: shown ? 1 : 0,
          transition: `opacity ${MENU_MS}ms ${EASE}`,
          willChange: 'opacity',
        }}
      />
      <div
        ref={menuRef}
        role="menu"
        className="fixed overflow-hidden"
        style={{
          zIndex: 46,
          right: 16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 158px)',
          minWidth: 230,
          borderRadius: 14,
          // Opaque surface: a blurred panel has to re-blur on every frame it scales
          background: 'var(--color-bg-elevated)',
          boxShadow: '0 16px 40px rgba(0,0,0,0.35), 0 0 0 0.5px rgb(var(--rgb-ink) / 0.12)',
          transformOrigin: 'bottom right',
          transform: shown ? 'scale(1)' : 'scale(0.88)',
          opacity: shown ? 1 : 0,
          transition: `transform ${MENU_MS}ms ${EASE}, opacity ${shown ? 160 : 200}ms ease`,
          willChange: 'transform, opacity',
        }}
      >
        {actions.map((a, i) => (
          <button
            key={a.label}
            role="menuitem"
            type="button"
            onClick={() => run(a.onTap)}
            className="fab-menu-item relative flex items-center justify-between w-full h-[48px] pl-4 pr-4 gap-6 text-left outline-none"
            style={{
              borderTop: i > 0 ? '0.5px solid rgb(var(--rgb-ink) / 0.12)' : undefined,
            }}
          >
            <span className="text-[16px] text-ink whitespace-nowrap">{a.label}</span>
            <a.Icon size={19} strokeWidth={1.9} className="text-ink flex-shrink-0" />
          </button>
        ))}
      </div>
    </>
  )

  return (
    <>
      {mounted && menu && createPortal(menu, document.body)}

      <button
        onClick={onMain}
        onPointerDown={() => setPressed(true)}
        onPointerUp={() => setPressed(false)}
        onPointerLeave={() => setPressed(false)}
        onPointerCancel={() => setPressed(false)}
        aria-label={single ? actions[0].label : open ? 'Close' : 'Add'}
        aria-haspopup={single ? undefined : 'menu'}
        aria-expanded={single ? undefined : open}
        className="fixed rounded-full flex items-center justify-center select-none outline-none"
        style={{
          right:  16,
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 88px)',
          width:  56,
          height: 56,
          zIndex: 47,
          background: 'linear-gradient(160deg, #E9CD7A 0%, #D4AF37 45%, #B08A2A 100%)',
          boxShadow: [
            'inset 0 1px 0 rgba(255,255,255,0.45)',      // top highlight
            'inset 0 -1px 0 rgba(0,0,0,0.12)',
            '0 8px 24px rgba(212,175,55,0.30)',
            '0 2px 6px rgba(0,0,0,0.30)',
          ].join(', '),
          transform: pressed ? 'scale(0.9)' : 'scale(1)',
          transition: `transform ${pressed ? '120ms ease-out' : `420ms ${SPRING}`}`,
          WebkitTapHighlightColor: 'transparent',
        }}
      >
        <Icon
          size={single ? 23 : 26}
          color="#1a1200"
          strokeWidth={single ? 2.1 : 2.4}
          style={{
            transform:  open ? 'rotate(135deg)' : 'rotate(0deg)',
            transition: `transform 420ms ${SPRING}`,
          }}
        />
      </button>
    </>
  )
}
