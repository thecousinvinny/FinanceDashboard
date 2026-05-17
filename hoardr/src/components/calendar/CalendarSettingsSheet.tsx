'use client'

import { useState, useEffect } from 'react'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export type EventTypeFilter = 'expense' | 'income' | 'sub' | 'custom' | 'google'

export interface CalPrefs {
  visibleTypes:       EventTypeFilter[]
  googleCalendarIds:  string[]
  defaultCalendarId?: string
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
  onSave:      (prefs: CalPrefs) => void
}

const TYPE_META: { type: EventTypeFilter; label: string; color: string }[] = [
  { type: 'expense', label: 'Expenses',         color: '#E8C46B' },
  { type: 'income',  label: 'Income',            color: '#4ADE80' },
  { type: 'sub',     label: 'Subscriptions',     color: '#F36369' },
  { type: 'custom',  label: 'Events (this app)', color: '#a78bfa' },
  { type: 'google',  label: 'Google Calendar',   color: '#4285F4' },
]

export function CalendarSettingsSheet({ open, onClose, prefs, googleCals, calsLoading, onSave }: Props) {
  const [local, setLocal] = useState<CalPrefs>(prefs)

  useEffect(() => {
    if (open) setLocal(prefs)
  }, [open, prefs])

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
        className={`fixed inset-0 z-40 transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-50 rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
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
          {/* ── Financial event types ──────────────────────────────── */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">
            Show on Calendar
          </p>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04] mb-5">
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
          </div>

          {/* ── Google Calendars ───────────────────────────────────── */}
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">
            Google Calendars
          </p>

          {calsLoading ? (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] p-4 text-center text-ink-faint text-[13px]">
              Loading your calendars…
            </div>
          ) : googleCals.length === 0 ? (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] p-4 text-center text-ink-faint text-[13px]">
              Sign out and back in to grant calendar access.
            </div>
          ) : (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              {googleCals.map(cal => {
                const on = local.googleCalendarIds.includes(cal.id)
                return (
                  <button
                    key={cal.id}
                    onClick={() => toggleCal(cal.id)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left select-none"
                  >
                    <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cal.backgroundColor }} />
                    <span className="text-[14px] font-medium text-ink flex-1 truncate">
                      {cal.summary}{cal.primary ? ' (primary)' : ''}
                    </span>
                    <span className={`w-11 h-6 rounded-full relative transition-colors flex-shrink-0 ${on ? 'gradient-gold' : 'bg-bg-base border border-white/10'}`}>
                      <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                    </span>
                  </button>
                )
              })}
            </div>
          )}

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
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: cal.backgroundColor }} />
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
