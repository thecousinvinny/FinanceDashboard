'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'
import { COLOR_PALETTE } from '@/lib/category-meta'

export type EventTypeFilter = 'income' | 'sub'

export interface CalPrefs {
  visibleTypes:           EventTypeFilter[]
  googleCalendarIds:      string[]
  defaultCalendarId?:     string
  googleCalendarColors?:  Record<string, string>   // calId → hex override
  typeColors?:            Record<string, string>   // 'income' | 'sub' → hex override
}

export interface GCalendar {
  id:              string
  summary:         string
  backgroundColor: string
  foregroundColor: string
  primary?:        boolean
}

interface Props {
  open:        boolean
  onClose:     () => void
  prefs:       CalPrefs
  googleCals:  GCalendar[]
  calsLoading: boolean
  calsError?:  boolean
  onSave:      (prefs: CalPrefs) => void
}

const TYPE_META: { type: EventTypeFilter; label: string; color: string }[] = [
  { type: 'income', label: 'Income',        color: '#4ADE80' },
  { type: 'sub',    label: 'Subscriptions', color: '#F36369' },
]

export function CalendarSettingsSheet({ open, onClose, prefs, googleCals, calsLoading, calsError, onSave }: Props) {
  const [local,  setLocal]  = useState<CalPrefs>(prefs)
  const [dragY,  setDragY]  = useState(0)
  const [swatchFor, setSwatchFor] = useState<{ key: string; kind: 'google' | 'finance'; top: number; left: number } | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)
  const swatchRef   = useRef<HTMLDivElement>(null)
  const dragStartY  = useRef<number | null>(null)

  useEffect(() => {
    if (open) setLocal(prefs)
  }, [open, prefs])

  useEffect(() => {
    const el = backdropRef.current
    if (!el || !open) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [open])

  useEffect(() => { if (!open) { setDragY(0); setSwatchFor(null) } }, [open])

  useEffect(() => {
    if (!swatchFor) return
    const onDown = (e: MouseEvent) => { if (!swatchRef.current?.contains(e.target as Node)) setSwatchFor(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [swatchFor])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current))
  }
  function onDragEnd() {
    const dy = dragY; dragStartY.current = null; setDragY(0)
    if (dy > 80) onClose()
  }

  function toggleType(type: EventTypeFilter) {
    setLocal(p => ({
      ...p,
      visibleTypes: p.visibleTypes.includes(type)
        ? p.visibleTypes.filter(t => t !== type)
        : [...p.visibleTypes, type],
    }))
  }

  function toggleCal(id: string) {
    setLocal(p => {
      const enabled = p.googleCalendarIds.includes(id)
      const newIds  = enabled ? p.googleCalendarIds.filter(c => c !== id) : [...p.googleCalendarIds, id]
      const calKey  = googleCals.find(c => c.id === id)?.primary ? 'primary' : id
      const newDef  = enabled && p.defaultCalendarId === calKey ? undefined : p.defaultCalendarId
      return { ...p, googleCalendarIds: newIds, defaultCalendarId: newDef }
    })
  }

  return (
    <>
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      <div
        className="fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface"
        style={{
          willChange: 'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Handle — drag target */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Calendar Filters</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>

        {/* Scrollable content */}
        <div
          className="px-5 overflow-y-auto"
          style={{ maxHeight: '70vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}
        >
          {/* ── Show on Calendar ───────────────────────────────────── */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">
            Show on Calendar
          </p>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04] mb-5">
            {/* Income & Subscriptions */}
            {TYPE_META.map(({ type, label, color: defaultColor }) => {
              const on          = local.visibleTypes.includes(type)
              const activeColor = local.typeColors?.[type] ?? defaultColor
              const isCustom    = !!local.typeColors?.[type]
              return (
                <div key={type} className="flex items-center gap-2 px-4 py-3.5 select-none">
                  <button
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setSwatchFor({ key: type, kind: 'finance', top: r.bottom + 4, left: r.left }) }}
                    className="relative flex-shrink-0 cursor-pointer flex items-center justify-center bg-transparent border-0 p-0"
                    style={{ width: 20, height: 20 }}
                    title="Change color"
                  >
                    <span className="w-2.5 h-2.5 rounded-full block" style={{ background: activeColor }} />
                  </button>
                  {isCustom && (
                    <button onClick={() => setLocal(p => { const c = { ...(p.typeColors ?? {}) }; delete c[type]; return { ...p, typeColors: c } })}
                      className="flex-shrink-0 text-[9px] text-ink-faint leading-none">✕</button>
                  )}
                  <button onClick={() => toggleType(type)} className="flex-1 text-left min-w-0">
                    <span className="text-[14px] font-medium text-ink truncate block">{label}</span>
                  </button>
                  <span onClick={() => toggleType(type)} className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 cursor-pointer ${on ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}>
                    <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </span>
                </div>
              )
            })}
            {/* Individual Google calendars */}
            {calsLoading && (
              <div className="px-4 py-3.5 text-[13px] text-ink-faint">Loading calendars…</div>
            )}
            {calsError && (
              <div className="px-4 py-3 space-y-0.5">
                <p className="text-[13px] font-medium text-ruby">Calendar access not granted</p>
                <p className="text-[11px] text-ink-faint leading-relaxed">Sign out and back in to grant access.</p>
              </div>
            )}
            {!calsLoading && !calsError && googleCals.map(cal => {
              const on          = local.googleCalendarIds.includes(cal.id)
              const activeColor = local.googleCalendarColors?.[cal.id] ?? cal.backgroundColor
              const isCustom    = !!local.googleCalendarColors?.[cal.id]
              return (
                <div key={cal.id} className="flex items-center gap-2 px-4 py-3.5 select-none">
                  {/* Color dot — tap opens swatch picker */}
                  <button
                    onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setSwatchFor({ key: cal.id, kind: 'google', top: r.bottom + 4, left: r.left }) }}
                    className="relative flex-shrink-0 cursor-pointer flex items-center justify-center bg-transparent border-0 p-0"
                    style={{ width: 20, height: 20 }}
                    title="Change color"
                  >
                    <span className="w-2.5 h-2.5 rounded-full block" style={{ background: activeColor }} />
                  </button>
                  {isCustom && (
                    <button onClick={() => setLocal(p => { const c = { ...(p.googleCalendarColors ?? {}) }; delete c[cal.id]; return { ...p, googleCalendarColors: c } })}
                      className="flex-shrink-0 text-[9px] text-ink-faint leading-none">✕</button>
                  )}
                  <button onClick={() => toggleCal(cal.id)} className="flex-1 text-left min-w-0">
                    <span className="text-[14px] font-medium text-ink truncate block">
                      {cal.summary}{cal.primary ? ' (primary)' : ''}
                    </span>
                  </button>
                  <span onClick={() => toggleCal(cal.id)} className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 cursor-pointer ${on ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}>
                    <span className={`absolute top-0.5 left-0 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Default Calendar ───────────────────────────────── */}
          {(() => {
            const enabledCals = googleCals.filter(c => local.googleCalendarIds.includes(c.id))
            if (enabledCals.length === 0) return null
            return (
              <>
                <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3 mt-5">
                  Default Calendar
                </p>
                <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
                  {enabledCals.map(cal => {
                    const calKey   = cal.primary ? 'primary' : cal.id
                    const isActive = (local.defaultCalendarId ?? 'primary') === calKey
                    return (
                      <button
                        key={cal.id}
                        onClick={() => setLocal(p => ({ ...p, defaultCalendarId: calKey }))}
                        className="w-full flex items-center gap-3 px-4 py-3.5 text-left select-none"
                      >
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: local.googleCalendarColors?.[cal.id] ?? cal.backgroundColor }} />
                        <span className="text-[14px] font-medium text-ink flex-1 truncate">
                          {cal.summary}{cal.primary ? ' (primary)' : ''}
                        </span>
                        <span className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-colors ${isActive ? 'border-gold' : 'border-white/20'}`}>
                          {isActive && <span className="w-2.5 h-2.5 rounded-full bg-gold" />}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </>
            )
          })()}

          <button
            onClick={() => { onSave(local); onClose() }}
            className="mt-5 w-full gradient-gold rounded-[14px] py-4 text-[15px] font-bold text-white"
          >
            Done
          </button>
        </div>
      </div>

      {/* Color swatch picker */}
      {swatchFor && (() => {
        const isFinance = swatchFor.kind === 'finance'
        const currentColor = isFinance
          ? (local.typeColors?.[swatchFor.key] ?? TYPE_META.find(t => t.type === swatchFor.key)?.color ?? '#4ADE80')
          : (local.googleCalendarColors?.[swatchFor.key] ?? googleCals.find(c => c.id === swatchFor.key)?.backgroundColor ?? '#4285F4')
        const popW = 4 * 22 + 3 * 6 + 20
        return (
          <div ref={swatchRef} onMouseDown={e => e.stopPropagation()} style={{
            position: 'fixed',
            top: Math.min(swatchFor.top, window.innerHeight - 180),
            left: Math.max(8, Math.min(swatchFor.left, window.innerWidth - popW - 8)),
            zIndex: 80,
            background: '#21242A',
            border: '0.5px solid rgba(255,255,255,0.12)',
            borderRadius: 10,
            padding: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 22px)',
            gap: 6,
            boxShadow: '0 4px 24px rgba(0,0,0,0.6)',
          }}>
            {COLOR_PALETTE.map(color => {
              const isSel = color.toLowerCase() === currentColor?.toLowerCase()
              return (
                <button
                  key={color}
                  onClick={() => {
                    if (isFinance) {
                      setLocal(p => ({ ...p, typeColors: { ...(p.typeColors ?? {}), [swatchFor.key]: color } }))
                    } else {
                      setLocal(p => ({ ...p, googleCalendarColors: { ...(p.googleCalendarColors ?? {}), [swatchFor.key]: color } }))
                    }
                    setSwatchFor(null)
                  }}
                  style={{
                    width: 22, height: 22, borderRadius: 4, background: color, padding: 0,
                    border: isSel ? '2px solid rgba(255,255,255,0.9)' : '2px solid transparent',
                    cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxSizing: 'border-box',
                  }}
                >
                  {isSel && <span style={{ color: 'white', fontSize: 12, fontWeight: 700, lineHeight: 1, textShadow: '0 1px 2px rgba(0,0,0,0.4)' }}>✓</span>}
                </button>
              )
            })}
          </div>
        )
      })()}
    </>
  )
}
