'use client'

import { useState, useEffect, useRef } from 'react'
import { X } from 'lucide-react'

export type EventTypeFilter = 'income' | 'sub'

export interface CalPrefs {
  visibleTypes:           EventTypeFilter[]
  googleCalendarIds:      string[]
  defaultCalendarId?:     string
  googleCalendarColors?:  Record<string, string>   // calId → hex override
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
  const backdropRef = useRef<HTMLDivElement>(null)
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

  useEffect(() => { if (!open) setDragY(0) }, [open])

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
          style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}
        >
          {/* ── Show on Calendar ───────────────────────────────────── */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">
            Show on Calendar
          </p>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04] mb-5">
            {/* Income & Subscriptions */}
            {TYPE_META.map(({ type, label, color }) => {
              const on = local.visibleTypes.includes(type)
              return (
                <button
                  key={type}
                  onClick={() => toggleType(type)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left select-none"
                >
                  <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: color }} />
                  <span className="text-[14px] font-medium text-ink flex-1">{label}</span>
                  <span className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}>
                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </span>
                </button>
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
                  {/* Color dot — tap opens native color picker */}
                  <label className="relative flex-shrink-0 cursor-pointer flex items-center justify-center" style={{ width: 20, height: 20 }} title="Change color">
                    <span className="w-2.5 h-2.5 rounded-full block" style={{ background: activeColor }} />
                    <input type="color" value={activeColor}
                      onChange={e => setLocal(p => ({ ...p, googleCalendarColors: { ...(p.googleCalendarColors ?? {}), [cal.id]: e.target.value } }))}
                      className="absolute inset-0 opacity-0 w-full h-full cursor-pointer p-0 border-0" />
                  </label>
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
    </>
  )
}
