'use client'

import { useState, useEffect } from 'react'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { cn } from '@/lib/utils'
import { COLOR_PALETTE } from '@/lib/category-meta'
import {
  type ColorPref,
  type SemanticColors,
  getSemanticColors,
  setSemanticColors as persistSemanticColors,
} from '@/lib/semantic-colors'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow } from '@/components/ui/Form'

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
  const isGrad  = value.type === 'gradient'
  const fromHex = isGrad ? value.from  : value.hex
  const toHex   = isGrad ? value.to    : value.hex
  const angle   = isGrad ? value.angle : 135

  const activeHex    = gradTarget === 'from' ? fromHex : toHex
  const previewBg    = isGrad ? `linear-gradient(${angle}deg, ${fromHex}, ${toHex})` : fromHex

  function setActiveHex(hex: string) {
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
    <div className="space-y-4">
      {/* Preview bar */}
      <div className="h-12 rounded-[14px] ring-1 ring-ink/[0.08]" style={{ background: previewBg }} />

      {/* Flat / Gradient toggle */}
      <div className="flex rounded-[10px] overflow-hidden border border-ink/[0.08]">
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

      {/* From / To selector (gradient only) */}
      {isGrad && (
        <div className="flex gap-2">
          {(['from', 'to'] as const).map(target => (
            <button
              key={target}
              onClick={() => setGradTarget(target)}
              className={cn(
                'flex-1 flex items-center gap-2.5 px-3 py-2.5 rounded-[12px] border transition-colors',
                gradTarget === target ? 'border-gold/50 bg-bg-overlay' : 'border-ink/[0.06] bg-bg-overlay',
              )}
            >
              <div
                className="w-5 h-5 rounded-full ring-1 ring-ink/[0.12] flex-shrink-0"
                style={{ background: target === 'from' ? fromHex : toHex }}
              />
              <p className="text-[13px] font-medium text-ink">{target === 'from' ? 'From' : 'To'}</p>
            </button>
          ))}
        </div>
      )}

      {/* Color wheel */}
      <HexColorPicker color={activeHex} onChange={setActiveHex} />

      {/* Hex input */}
      <div className="flex items-center gap-2 bg-bg-overlay border border-ink/[0.08] rounded-[12px] px-3 py-2.5">
        <span className="text-ink-muted text-[14px] font-mono select-none">#</span>
        <HexColorInput
          color={activeHex}
          onChange={setActiveHex}
          className="flex-1 bg-transparent text-[14px] font-mono text-ink outline-none uppercase tracking-wider"
          style={{ colorScheme: 'dark' }}
        />
        <div className="w-6 h-6 rounded-full ring-1 ring-ink/[0.12] flex-shrink-0" style={{ background: activeHex }} />
      </div>

      {/* Quick-select palette */}
      <div>
        <p className="text-[10px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Quick Select</p>
        <div className="grid grid-cols-8 gap-2">
          {COLOR_PALETTE.map(hex => {
            const selected = hex.toLowerCase() === activeHex.toLowerCase()
            return (
              <button
                key={hex}
                onClick={() => setActiveHex(hex)}
                className="aspect-square rounded-[8px] transition-transform active:scale-90"
                style={{
                  background: hex,
                  boxShadow:  selected
                    ? `0 0 0 2px #fff, 0 0 0 4px ${hex}`
                    : '0 0 0 1px rgb(var(--rgb-ink) / 0.08)',
                }}
              />
            )
          })}
        </div>
      </div>

      {/* Angle chips (gradient only) */}
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
                    : 'border-ink/[0.06] text-ink-muted bg-bg-overlay',
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
            className="flex-1 py-3 rounded-[14px] border border-ink/[0.08] text-[14px] font-semibold text-ink-muted"
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
    if (!c) return key === 'sub' ? 'rgb(var(--rgb-ink) / 0.5)' : TYPES.find(t => t.key === key)!.defaultHex
    if (c.type === 'flat') return c.hex
    return `linear-gradient(${c.angle}deg, ${c.from}, ${c.to})`
  }

  const editingMeta = editing ? TYPES.find(t => t.key === editing) : null

  return (
    <Sheet
      open={open}
      onClose={editing ? () => setEditing(null) : onClose}
      title={editingMeta?.label ?? 'Accent Colors'}
      cancelLabel={editing ? 'Back' : 'Done'}
    >
      {!editing ? (
        <FormGroup footer="Used for amounts, charts and icons across the app.">
          {TYPES.map(({ key, label }) => (
            <FormRow key={key} chevron onClick={() => openEditor(key)} label={
              <span className="flex items-center gap-3">
                <span className="w-[22px] h-[22px] rounded-full flex-shrink-0" style={{ background: getCurrentSwatch(key), boxShadow: '0 0 0 0.5px rgb(var(--rgb-ink) / 0.15)' }} />
                {label}
              </span>
            }>
              {colors[key] ? 'Custom' : 'Default'}
            </FormRow>
          ))}
        </FormGroup>
      ) : (
        <div className="pt-3">
          <ColorPicker
            key={editing}
            value={draft}
            onChange={setDraft}
            onApply={applyDraft}
            onReset={colors[editing] ? resetCurrent : undefined}
          />
        </div>
      )}
    </Sheet>
  )
}
