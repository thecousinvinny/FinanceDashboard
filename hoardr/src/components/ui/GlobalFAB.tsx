'use client'

import { useEffect, useRef, useState } from 'react'
import { Plus, type LucideIcon } from 'lucide-react'

export interface FABAction {
  Icon:  LucideIcon
  label: string
  onTap: () => void
}

const FAB_BG  = 'linear-gradient(135deg, #C9A84C, #A8873C)'
const FAB_INK = '#1a1200'
const SPRING  = '220ms cubic-bezier(0.34,1.56,0.64,1)'

export function GlobalFAB({ actions }: { actions: FABAction[] }) {
  const [open,    setOpen]    = useState(false)
  const [visible, setVisible] = useState(false)
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const N = actions.length

  useEffect(() => {
    if (open) {
      if (closeTimer.current) clearTimeout(closeTimer.current)
      setVisible(true)
    } else if (visible) {
      // Keep rendered until the last close animation finishes
      const ms = (N > 0 ? (N - 1) * 60 : 0) + 220 + 80
      closeTimer.current = setTimeout(() => setVisible(false), ms)
    }
    return () => { if (closeTimer.current) clearTimeout(closeTimer.current) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function toggle() { setOpen(v => !v) }

  function handleAction(onTap: () => void) {
    setOpen(false)
    onTap()
  }

  return (
    <>
      {/* Backdrop */}
      {visible && (
        <div
          className="fixed inset-0"
          style={{
            zIndex:    45,
            background: 'rgba(0,0,0,0.45)',
            animation:  `${open ? 'fab-bd-in' : 'fab-bd-out'} 150ms ease forwards`,
          }}
          onClick={() => setOpen(false)}
        />
      )}

      {/* Pill stack — right-aligned, grows upward above FAB */}
      {visible && (
        <div
          className="fixed flex flex-col items-end"
          style={{ right: 20, bottom: 158, zIndex: 46, gap: 8 }}
        >
          {actions.map((action, i) => {
            const delay = open ? `${(N - 1 - i) * 60}ms` : `${i * 60}ms`
            return (
              <button
                key={action.label}
                onClick={() => handleAction(action.onTap)}
                className="flex items-center h-[38px] rounded-[20px] select-none whitespace-nowrap active:opacity-80"
                style={{
                  background:   FAB_BG,
                  paddingLeft:  4,
                  paddingRight: 10,
                  gap:          8,
                  boxShadow:    '0 2px 10px rgba(201,168,76,0.28)',
                  animation:    `${open ? 'fab-pill-in' : 'fab-pill-out'} ${SPRING} ${delay} both`,
                }}
              >
                <div
                  className="flex items-center justify-center flex-shrink-0 rounded-full"
                  style={{ width: 30, height: 30, background: 'rgba(0,0,0,0.14)' }}
                >
                  <action.Icon size={16} color={FAB_INK} strokeWidth={2} />
                </div>
                <span className="text-[13px] font-medium" style={{ color: FAB_INK }}>
                  {action.label}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {/* Main FAB button */}
      <button
        onClick={toggle}
        className="fixed rounded-full flex items-center justify-center select-none"
        style={{
          right:      20,
          bottom:     90,
          width:      56,
          height:     56,
          zIndex:     47,
          background: FAB_BG,
          boxShadow:  '0 4px 16px rgba(201,168,76,0.35)',
        }}
        aria-label={open ? 'Close' : 'Add'}
      >
        <Plus
          size={24}
          color={FAB_INK}
          strokeWidth={2.5}
          style={{
            transform:  open ? 'rotate(45deg)' : 'rotate(0deg)',
            transition: `transform ${SPRING}`,
          }}
        />
      </button>
    </>
  )
}
