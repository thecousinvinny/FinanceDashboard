'use client'

import { useEffect, useRef, useState } from 'react'
import { subscribeToasts, dismissToast, type ToastItem } from '@/lib/toast'

const DOT: Record<string, string> = {
  add:     '#22c55e',
  payment: '#D4AF37',
  delete:  '#ef4444',
}

function Toast({ item }: { item: ToastItem }) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const raf = requestAnimationFrame(() => setVisible(true))
    timerRef.current = setTimeout(() => {
      setVisible(false)
      setTimeout(() => dismissToast(item.id, 'commit'), 300)
    }, item.duration)
    return () => {
      cancelAnimationFrame(raf)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [item.id, item.duration])

  function dismiss(action: 'commit' | 'undo') {
    if (timerRef.current) clearTimeout(timerRef.current)
    setVisible(false)
    setTimeout(() => dismissToast(item.id, action), 300)
  }

  const M = 'var(--font-montserrat)'

  return (
    <div style={{
      transform:            visible ? 'translateY(0) scale(1)' : 'translateY(-120%) scale(0.9)',
      opacity:              visible ? 1 : 0,
      transition:           visible
        ? 'transform 0.42s cubic-bezier(0.34,1.56,0.64,1), opacity 0.22s ease'
        : 'transform 0.2s cubic-bezier(0.4,0,1,1), opacity 0.18s ease',
      background:           'rgba(18,18,30,0.97)',
      backdropFilter:       'blur(24px)',
      WebkitBackdropFilter: 'blur(24px)',
      border:               '1px solid rgba(255,255,255,0.1)',
      borderRadius:         100,
      padding:              '11px 14px 11px 16px',
      display:              'flex',
      alignItems:           'center',
      gap:                  9,
      maxWidth:             360,
      boxShadow:            '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.04)',
      pointerEvents:        'auto',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%', background: DOT[item.type], flexShrink: 0,
        boxShadow: `0 0 8px ${DOT[item.type]}80`,
      }} />
      <span style={{ fontSize: 13, fontWeight: 500, color: 'rgba(240,240,248,0.9)', fontFamily: M, whiteSpace: 'nowrap', flex: 1 }}>
        {item.message}
      </span>
      {item.undo && (
        <button
          onClick={() => dismiss('undo')}
          style={{ fontSize: 13, fontWeight: 700, color: '#D4AF37', background: 'none', border: 'none',
                   padding: '0 6px', cursor: 'pointer', flexShrink: 0, fontFamily: M }}
        >
          Undo
        </button>
      )}
      <button
        onClick={() => dismiss('commit')}
        style={{ fontSize: 19, color: 'rgba(255,255,255,0.22)', background: 'none', border: 'none',
                 padding: '0 2px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
      >
        ×
      </button>
    </div>
  )
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastItem[]>([])
  useEffect(() => subscribeToasts(setToasts), [])

  return (
    <div style={{
      position:   'fixed',
      top:        0,
      left:       0,
      right:      0,
      display:    'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap:        8,
      zIndex:     200,
      pointerEvents: 'none',
      paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)',
    }}>
      {toasts.map(item => <Toast key={item.id} item={item} />)}
    </div>
  )
}
