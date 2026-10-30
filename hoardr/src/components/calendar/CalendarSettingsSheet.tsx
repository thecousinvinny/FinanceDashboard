'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { COLOR_PALETTE } from '@/lib/category-meta'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Toggle } from '@/components/ui/Form'

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
  // Google's per-calendar permission: 'owner' | 'writer' | 'reader' | 'freeBusyReader'.
  // The list is fetched with minAccessRole=reader so subscribed/shared calendars
  // still show their events — but only owner/writer can be written to.
  accessRole?:     string
}

export function canWriteToCalendar(c: GCalendar): boolean {
  return c.accessRole === 'owner' || c.accessRole === 'writer'
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

/** Color swatch that opens the palette. */
function ColorDot({ color, onPick }: { color: string; onPick: (r: DOMRect) => void }) {
  return (
    <button
      type="button"
      onClick={e => { e.stopPropagation(); onPick(e.currentTarget.getBoundingClientRect()) }}
      title="Change color"
      aria-label="Change color"
      className="flex-shrink-0 w-[22px] h-[22px] rounded-full flex items-center justify-center active:scale-90 transition-transform"
    >
      <span className="w-[14px] h-[14px] rounded-full block" style={{ background: color, boxShadow: '0 0 0 0.5px rgb(var(--rgb-ink) / 0.15)' }} />
    </button>
  )
}

export function CalendarSettingsSheet({ open, onClose, prefs, googleCals, calsLoading, calsError, onSave }: Props) {
  const [local, setLocal] = useState<CalPrefs>(prefs)
  const [swatchFor, setSwatchFor] = useState<{ key: string; kind: 'google' | 'finance'; top: number; left: number } | null>(null)
  const swatchRef = useRef<HTMLDivElement>(null)

  useEffect(() => { if (open) setLocal(prefs) }, [open, prefs])
  useEffect(() => { if (!open) setSwatchFor(null) }, [open])

  useEffect(() => {
    if (!swatchFor) return
    const onDown = (e: MouseEvent) => { if (!swatchRef.current?.contains(e.target as Node)) setSwatchFor(null) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [swatchFor])

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

  const enabledCals = googleCals.filter(c => local.googleCalendarIds.includes(c.id) && canWriteToCalendar(c))

  return (
    <>
      <Sheet
        open={open}
        onClose={onClose}
        title="Calendars"
        action={{ label: 'Done', onClick: () => { onSave(local); onClose() } }}
        actionPlacement="nav"
      >
        <FormGroup header="Finance" footer="Tap a color to change it.">
          {TYPE_META.map(({ type, label, color: defaultColor }) => (
            <FormRow key={type} label={
              <span className="flex items-center gap-3">
                <ColorDot color={local.typeColors?.[type] ?? defaultColor} onPick={r => setSwatchFor({ key: type, kind: 'finance', top: r.bottom + 6, left: r.left })} />
                {label}
              </span>
            }>
              <Toggle label={label} checked={local.visibleTypes.includes(type)} onChange={() => toggleType(type)} />
            </FormRow>
          ))}
        </FormGroup>

        <FormGroup header="Google Calendar">
          {calsLoading && <FormRow label="Loading calendars…" />}
          {calsError && (
            <FormRow alignTop label={
              <span className="flex flex-col">
                <span className="text-ruby">Calendar access not granted</span>
                <span className="text-[13px] text-ink-muted">Use “Connect Google Calendar” in Settings.</span>
              </span>
            } />
          )}
          {!calsLoading && !calsError && googleCals.length === 0 && <FormRow label="No calendars found" />}
          {!calsLoading && !calsError && googleCals.map(cal => (
            <FormRow key={cal.id} label={
              <span className="flex items-center gap-3 min-w-0">
                <ColorDot color={local.googleCalendarColors?.[cal.id] ?? cal.backgroundColor} onPick={r => setSwatchFor({ key: cal.id, kind: 'google', top: r.bottom + 6, left: r.left })} />
                <span className="flex flex-col min-w-0">
                  <span className="truncate">{cal.summary}</span>
                  {(cal.primary || !canWriteToCalendar(cal)) && (
                    <span className="text-[12px] text-ink-muted">{cal.primary ? 'Primary' : 'Read-only'}</span>
                  )}
                </span>
              </span>
            }>
              <Toggle label={cal.summary} checked={local.googleCalendarIds.includes(cal.id)} onChange={() => toggleCal(cal.id)} />
            </FormRow>
          ))}
        </FormGroup>

        {enabledCals.length > 0 && (
          <FormGroup header="New events go to">
            {enabledCals.map(cal => {
              const calKey   = cal.primary ? 'primary' : cal.id
              const isActive = (local.defaultCalendarId ?? 'primary') === calKey
              return (
                <FormRow key={cal.id} onClick={() => setLocal(p => ({ ...p, defaultCalendarId: calKey }))} label={
                  <span className="flex items-center gap-3">
                    <span className="w-[10px] h-[10px] rounded-full flex-shrink-0" style={{ background: local.googleCalendarColors?.[cal.id] ?? cal.backgroundColor }} />
                    {cal.summary}
                  </span>
                }>
                  {isActive && <Check size={18} strokeWidth={2.5} className="text-gold" />}
                </FormRow>
              )
            })}
          </FormGroup>
        )}
      </Sheet>

      {/* Color palette — portaled so it floats above the sheet */}
      {swatchFor && createPortal((() => {
        const isFinance = swatchFor.kind === 'finance'
        const currentColor = isFinance
          ? (local.typeColors?.[swatchFor.key] ?? TYPE_META.find(t => t.type === swatchFor.key)?.color ?? '#4ADE80')
          : (local.googleCalendarColors?.[swatchFor.key] ?? googleCals.find(c => c.id === swatchFor.key)?.backgroundColor ?? '#4285F4')
        const isCustom = isFinance ? !!local.typeColors?.[swatchFor.key] : !!local.googleCalendarColors?.[swatchFor.key]
        const popW = 4 * 26 + 3 * 8 + 24
        return (
          <div ref={swatchRef} onMouseDown={e => e.stopPropagation()} className="select-menu" style={{
            position: 'fixed',
            top: Math.min(swatchFor.top, window.innerHeight - 220),
            left: Math.max(8, Math.min(swatchFor.left, window.innerWidth - popW - 8)),
            zIndex: 230,
            width: popW,
            background: 'var(--color-bg-elevated)',
            border: '0.5px solid rgb(var(--rgb-ink) / 0.12)',
            borderRadius: 14,
            padding: 12,
            boxShadow: '0 12px 36px rgba(0,0,0,0.45)',
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 26px)', gap: 8 }}>
              {COLOR_PALETTE.map(color => {
                const isSel = color.toLowerCase() === currentColor?.toLowerCase()
                return (
                  <button
                    key={color}
                    type="button"
                    onClick={() => {
                      if (isFinance) setLocal(p => ({ ...p, typeColors: { ...(p.typeColors ?? {}), [swatchFor.key]: color } }))
                      else           setLocal(p => ({ ...p, googleCalendarColors: { ...(p.googleCalendarColors ?? {}), [swatchFor.key]: color } }))
                      setSwatchFor(null)
                    }}
                    aria-label={color}
                    className="flex items-center justify-center active:scale-90 transition-transform"
                    style={{
                      width: 26, height: 26, borderRadius: '50%', background: color, padding: 0, border: 'none', cursor: 'pointer',
                      boxShadow: isSel ? `0 0 0 2px var(--color-bg-elevated), 0 0 0 4px ${color}` : 'none',
                    }}
                  >
                    {isSel && <Check size={13} strokeWidth={3} color="#fff" />}
                  </button>
                )
              })}
            </div>
            {isCustom && (
              <button
                type="button"
                onClick={() => {
                  if (isFinance) setLocal(p => { const c = { ...(p.typeColors ?? {}) }; delete c[swatchFor.key]; return { ...p, typeColors: c } })
                  else           setLocal(p => { const c = { ...(p.googleCalendarColors ?? {}) }; delete c[swatchFor.key]; return { ...p, googleCalendarColors: c } })
                  setSwatchFor(null)
                }}
                className="mt-3 w-full text-center text-[13px] text-gold"
              >
                Reset to default
              </button>
            )}
          </div>
        )
      })(), document.body)}
    </>
  )
}
