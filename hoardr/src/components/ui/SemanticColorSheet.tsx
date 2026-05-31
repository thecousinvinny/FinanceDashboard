'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils'
import { COLOR_PALETTE } from '@/lib/category-meta'
import {
  type ColorPref,
  type SemanticColors,
  getSemanticColors,
  setSemanticColors as persistSemanticColors,
} from '@/lib/semantic-colors'

const TYPES: Array<{ key: keyof SemanticColors; label: string; defaultHex: string }> = [
  { key: 'income',  label: 'Income',        defaultHex: '#22c55e' },
  { key: 'expense', label: 'Expense',        defaultHex: '#D4AF37' },
  { key: 'sub',     label: 'Subscriptions',  defaultHex: '#94a3b8' },
]

const ANGLES = [45, 90, 135, 180]

// ── Inner picker ──────────────────────────────────────────────────────────────

interface PickerProps {
  value:    ColorPref
  onChange: (v: ColorPref) => void
  onApply:  () => void
  onReset?: () => void
}

function ColorPicker({ value, onChange, onApply, onReset }: PickerProps) {
  const [gradTarget, setGradTarget] = useState<'from' | 'to'>('from')
  const isGrad   = value.type === 'gradient'
  const fromHex  = isGrad ? value.from  : value.hex
  const toHex    = isGrad ? value.to    : value.hex
  const angle    = isGrad ? value.angle : 135
  const activeHex = gradTarget === 'from' ? fromHex : toHex
  const previewBg = isGrad ? `linear-gradient(${angle}deg, ${fromHex}, ${toHex})` : fromHex

  function selectColor(hex: string) {
    if (isGrad) {
      const g = value as { type: 'gradient'; from: string; to: string; angle: number }
      onChange(gradTarget === 'from' ? { ...g, from: hex } : { ...g, to: hex })
    } else {
      onChange({ type: 'flat', hex })
    }
  }

  function switchMode(to: 'flat' | 'gradient') {
    if (to === 'flat') {
      onChange({ type: 'flat', hex: fromHex })
    } else {
      onChange({ type: 'gradient', from: fromHex, to: fromHex, angle: 135 })
    }
    setGradTarget('from')
  }

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div
        className="h-12 rounded-[14px] ring-1 ring-white/[0.08]"
        style={{ background: previewBg }}
      />

      {/* Flat / Gradient toggle */}
      <div className="flex rounded-[10px] overflow-hidden border border-white/[0.08]">
        {(['flat', 'gradient'] as const).map(mode => (
          <button
            key={mode}
            onClick={() => switchMode(mode)}
            className={cn(
              'flex-1 py-2.5 text-[13px] font-semibold transition-colors',
              (mode === 'flat' ? !isGrad : isGrad)
                ? 'gradient-gold text-white'
                : 'bg-bg-overlay text-ink-muted',
            )}
          >
            {mode === 'flat' ? 'Flat' : 'Gradient'}
          </button>
        ))}
      </div>

      {/* From / To selector */}
      {isGrad && (
        <div className="flex gap-2">
          {(['from', 'to'] as const).map(target => (
            <button
              key={target}
              onClick={() => setGradTarget(target)}
              className={cn(
                'flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] border transition-colors',
                gradTarget === target ? 'border-gold/50 bg-bg-overlay' : 'border-white/[0.06] bg-bg-overlay',
              )}
            >
              <div
                className="w-5 h-5 rounded-full ring-1 ring-white/[0.12] flex-shrink-0"
                style={{ background: target === 'from' ? fromHex : toHex }}
              />
              <p className="text-[13px] font-medium text-ink">{target === 'from' ? 'From' : 'To'}</p>
            </button>
          ))}
        </div>
      )}

      {/* Color palette */}
      <div className="grid grid-cols-8 gap-2">
        {COLOR_PALETTE.map(hex => {
          const selected = hex === activeHex
          return (
            <button
              key={hex}
              onClick={() => selectColor(hex)}
              className="aspect-square rounded-[8px] transition-transform active:scale-90"
              style={{
                background: hex,
                boxShadow:  selected
                  ? `0 0 0 2px #fff, 0 0 0 4px ${hex}`
                  : '0 0 0 1px rgba(255,255,255,0.08)',
              }}
            />
          )
        })}
      </div>

      {/* Angle chips */}
      {isGrad && (
        <div>
          <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Direction</p>
          <div className="flex gap-2">
            {ANGLES.map(a => (
              <button
                key={a}
                onClick={() => onChange({ ...(value as { type: 'gradient'; from: string; to: string; angle: number }), angle: a })}
                className={cn(
                  'flex-1 py-2 rounded-[10px] text-[12px] font-semibold border transition-colors',
                  angle === a
                    ? 'border-gold/50 text-gold bg-bg-overlay'
                    : 'border-white/[0.06] text-ink-muted bg-bg-overlay',
                )}
              >
                {a}°
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="flex gap-3 pt-1">
        {onReset && (
          <button
            onClick={onReset}
            className="flex-1 py-3 rounded-[14px] border border-white/[0.08] text-[14px] font-semibold text-ink-muted"
          >
            Reset
          </button>
        )}
        <button
          onClick={onApply}
          className={cn(
            'py-3 rounded-[14px] gradient-gold text-[14px] font-semibold text-white',
            onReset ? 'flex-1' : 'w-full',
          )}
        >
          Apply
        </button>
      </div>
    </div>
  )
}

// ── Sheet ─────────────────────────────────────────────────────────────────────

interface Props {
  open:    boolean
  onClose: () => void
}

export function SemanticColorSheet({ open, onClose }: Props) {
  const sheetRef      = useRef<HTMLDivElement>(null)
  const dragStartY    = useRef<number | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const [colors,  setColors]  = useState<SemanticColors>({})
  const [editing, setEditing] = useState<keyof SemanticColors | null>(null)
  const [draft,   setDraft]   = useState<ColorPref>({ type: 'flat', hex: '#22c55e' })

  useEffect(() => {
    if (open) {
      setColors(getSemanticColors())
      setEditing(null)
    }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => setEditing(null), 300)
      return () => clearTimeout(t)
    }
  }, [open])

  // Body scroll lock
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position  = 'fixed'
    document.body.style.top       = `-${scrollY}px`
    document.body.style.width     = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    let lastY = 0
    const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY }
    const onMove  = (e: TouchEvent) => {
      const el = scrollAreaRef.current
      if (!el?.contains(e.target as Node)) { e.preventDefault(); return }
      const dy = e.touches[0].clientY - lastY
      lastY = e.touches[0].clientY
      const { scrollTop, scrollHeight, clientHeight } = el
      if ((scrollTop <= 0 && dy > 0) || (scrollTop + clientHeight >= scrollHeight - 1 && dy < 0)) e.preventDefault()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: false })
    return () => {
      document.body.style.position  = ''
      document.body.style.top       = ''
      document.body.style.width     = ''
      document.documentElement.style.overscrollBehavior = ''
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      window.scrollTo(0, scrollY)
    }
  }, [open])

  function openEditor(key: keyof SemanticColors) {
    const meta = TYPES.find(t => t.key === key)!
    setDraft(colors[key] ?? { type: 'flat', hex: meta.defaultHex })
    setEditing(key)
  }

  function applyDraft() {
    const next = { ...colors, [editing!]: draft }
    setColors(next)
    persistSemanticColors(next)
    setEditing(null)
  }

  function resetCurrent() {
    const next = { ...colors }
    delete next[editing!]
    setColors(next)
    persistSemanticColors(next)
    setEditing(null)
  }

  function getCurrentSwatch(key: keyof SemanticColors): string {
    const c = colors[key]
    if (!c) return key === 'sub' ? 'rgba(255,255,255,0.5)' : TYPES.find(t => t.key === key)!.defaultHex
    if (c.type === 'flat') return c.hex
    return `linear-gradient(${c.angle}deg, ${c.from}, ${c.to})`
  }

  // Drag dismiss
  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform  = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null
      ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
      : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
        onClose()
      }, 280)
    } else {
      sheetRef.current.style.transform  = ''
      sheetRef.current.style.transition = ''
    }
  }

  const editingMeta = editing ? TYPES.find(t => t.key === editing) : null

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle */}
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
        <div className="flex items-center justify-between px-5 mb-5">
          {editing ? (
            <button onClick={() => setEditing(null)} className="flex items-center gap-1 text-gold">
              <ChevronLeft size={18} strokeWidth={2} />
              <span className="text-[14px] font-medium">Back</span>
            </button>
          ) : (
            <h2 className="text-[18px] font-bold text-ink">Accent Colors</h2>
          )}
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center text-[22px] leading-none text-ink-muted"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div
          ref={scrollAreaRef}
          className="px-5 overflow-y-auto"
          style={{
            maxHeight:          '70vh',
            paddingBottom:      'calc(env(safe-area-inset-bottom, 0px) + 32px)',
            overflowX:          'hidden',
            overscrollBehavior: 'contain',
          }}
        >
          {!editing ? (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              {TYPES.map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => openEditor(key)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
                >
                  <div
                    className="w-7 h-7 rounded-full flex-shrink-0 ring-1 ring-white/[0.12]"
                    style={{ background: getCurrentSwatch(key) }}
                  />
                  <p className="flex-1 text-[14px] font-medium text-ink">{label}</p>
                  {colors[key] && (
                    <span className="text-[11px] text-gold mr-1">Custom</span>
                  )}
                  <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
                </button>
              ))}
            </div>
          ) : (
            <>
              {editingMeta && (
                <p className="text-[11px] text-ink-muted mb-4">{editingMeta.label}</p>
              )}
              <ColorPicker
                key={editing}
                value={draft}
                onChange={setDraft}
                onApply={applyDraft}
                onReset={colors[editing] ? resetCurrent : undefined}
              />
            </>
          )}
        </div>
      </div>
    </>
  )
}
