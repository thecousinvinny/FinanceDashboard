'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { haptic } from '@/lib/utils'
import { SHEET_EASE } from './Sheet'

export interface ActionSheetOption {
  label:        string
  hint?:        string
  destructive?: boolean
  onSelect:     () => void
}

interface Props {
  open:     boolean
  title?:   string
  message?: string
  options:  ActionSheetOption[]
  onClose:  () => void
}

const OPEN_MS = 380, CLOSE_MS = 260

/**
 * iOS action sheet: a frosted group of choices and a separate Cancel, rising
 * from the bottom (a centered card on PC). For short questions asked over a
 * sheet or a calendar popover (so it sits above both) — "This event or this
 * and following?" — not for forms.
 */
export function ActionSheet({ open, onClose, ...content }: Props) {
  const [present, setPresent] = useState(open)
  const [shown,   setShown]   = useState(false)
  // Callers clear their state on close; keep showing it while it slides away
  const last = useRef(content)
  if (open) last.current = content
  const { title, message, options } = last.current

  useEffect(() => {
    if (open) {
      setPresent(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setPresent(false), CLOSE_MS)
    return () => clearTimeout(t)
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onClose() } }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [open, onClose])

  if (!present || typeof document === 'undefined') return null
  const dur = shown ? OPEN_MS : CLOSE_MS
  const sep = '0.5px solid rgb(var(--rgb-ink) / 0.1)'

  return createPortal(
    <div data-action-sheet className="fixed inset-0 z-[500]" style={{ pointerEvents: open ? undefined : 'none' }}>
      <div
        onClick={onClose}
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.4)', opacity: shown ? 1 : 0, transition: `opacity ${dur}ms ${SHEET_EASE}` }}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="absolute inset-x-0 bottom-0 mx-auto w-full max-w-[420px] px-2 md:bottom-1/2 md:translate-y-1/2"
        style={{
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
          transform: shown ? undefined : 'translateY(110%)',
          opacity: shown ? 1 : 0,
          transition: `transform ${dur}ms ${SHEET_EASE}, opacity ${dur}ms ${SHEET_EASE}`,
        }}
      >
        <div className="frost-strong rounded-[14px] overflow-hidden">
          {(title || message) && (
            <div className="px-4 py-3.5 text-center" style={{ borderBottom: sep }}>
              {title && <p className="text-[13px] font-semibold text-ink-muted">{title}</p>}
              {message && <p className="text-[13px] text-ink-muted mt-0.5">{message}</p>}
            </div>
          )}
          {options.map((o, i) => (
            <button
              key={o.label}
              type="button"
              onClick={() => { haptic(o.destructive ? 'delete' : 'confirm'); o.onSelect() }}
              className="w-full px-4 py-[15px] text-center active:bg-[rgb(var(--rgb-ink)/0.08)] transition-colors"
              style={{ borderTop: i ? sep : undefined }}
            >
              <span className={`block text-[17px] ${o.destructive ? 'text-ruby' : 'text-gold'}`}>{o.label}</span>
              {o.hint && <span className="block text-[12px] text-ink-muted mt-0.5">{o.hint}</span>}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="frost-strong mt-2 w-full rounded-[14px] py-[15px] text-[17px] font-semibold text-gold active:opacity-80"
        >
          Cancel
        </button>
      </div>
    </div>,
    document.body,
  )
}
