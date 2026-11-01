'use client'

import { useState, useEffect } from 'react'
import { Check } from 'lucide-react'
import { haptic } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented, Stepper } from '@/components/ui/Form'

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_RRULE  = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ORDINALS   = ['1st','2nd','3rd','4th','5th']

interface Preset { label: string; rule: string }

function makePresets(dateStr: string): Preset[] {
  if (!dateStr || dateStr.length < 10) return []
  const [y, m, d] = dateStr.split('-').map(Number)
  const dow  = new Date(y, m - 1, d).getDay()
  const code = DOW_RRULE[dow]
  const name = DAY_NAMES[dow]
  const ord  = Math.ceil(d / 7)
  const ordLbl = ORDINALS[ord - 1] ?? `${ord}th`
  return [
    { label: 'Every day',                                       rule: 'FREQ=DAILY' },
    { label: 'Every weekday',                                   rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { label: `Every week on ${name}`,                           rule: `FREQ=WEEKLY;BYDAY=${code}` },
    { label: `Every 2 weeks on ${name}`,                        rule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${code}` },
    { label: `Every month on the ${ordLbl}`,                    rule: `FREQ=MONTHLY;BYMONTHDAY=${d}` },
    { label: `Every month on the ${ordLbl} ${name.slice(0, 3)}`, rule: `FREQ=MONTHLY;BYDAY=${ord}${code}` },
    { label: `Every year on ${MON_SHORT[m - 1]} ${d}`,          rule: `FREQ=YEARLY;BYMONTH=${m};BYMONTHDAY=${d}` },
  ]
}

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
const FREQS: Freq[] = ['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']
const FREQ_LABEL: Record<Freq, string> = { DAILY: 'Day', WEEKLY: 'Week', MONTHLY: 'Month', YEARLY: 'Year' }
type EndType = 'never' | 'date' | 'count'
const END_TYPES: EndType[] = ['never', 'date', 'count']
const END_LABEL: Record<EndType, string> = { never: 'Never', date: 'On date', count: 'After' }

interface Custom { freq: Freq; interval: number; byDays: string[]; byMonths: number[]; endType: EndType; endDate: string; endCount: number }
const DEFAULT_CUSTOM: Custom = { freq: 'WEEKLY', interval: 1, byDays: [], byMonths: [], endType: 'never', endDate: '', endCount: 5 }

function customToRule(c: Custom): string {
  let rule = `FREQ=${c.freq}`
  if (c.interval > 1) rule += `;INTERVAL=${c.interval}`
  if (c.freq === 'WEEKLY' && c.byDays.length > 0)
    rule += `;BYDAY=${[...c.byDays].sort((a, b) => DOW_RRULE.indexOf(a) - DOW_RRULE.indexOf(b)).join(',')}`
  if (c.freq === 'YEARLY' && c.byMonths.length > 0)
    rule += `;BYMONTH=${[...c.byMonths].sort((a, b) => a - b).join(',')}`
  if (c.endType === 'date' && c.endDate) rule += `;UNTIL=${c.endDate.replace(/-/g, '')}`
  if (c.endType === 'count' && c.endCount > 0) rule += `;COUNT=${c.endCount}`
  return rule
}

const unit = (f: Freq, n: number) => `${FREQ_LABEL[f].toLowerCase()}${n === 1 ? '' : 's'}`

interface Props {
  open:     boolean
  date:     string
  value:    string
  onClose:  () => void
  onChange: (rule: string) => void
}

/** Toggle chips in a row (weekdays, months) */
function Chips<T extends string | number>({ items, labels, on, toggle, cols }: {
  items: T[]; labels: string[]; on: (v: T) => boolean; toggle: (v: T) => void; cols: number
}) {
  return (
    <div className="grid gap-1.5 px-3 py-3" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
      {items.map((v, i) => (
        <button key={String(v)} type="button" onClick={() => { haptic('tap'); toggle(v) }}
          className="h-[36px] rounded-[9px] text-[13px] font-semibold transition-colors"
          style={on(v)
            ? { background: 'linear-gradient(160deg, #E9CD7A, #D4AF37 45%, #B08A2A)', color: '#1a1200' }
            : { background: 'rgb(var(--rgb-ink) / 0.07)', color: 'rgb(var(--rgb-ink-muted))' }}>
          {labels[i]}
        </button>
      ))}
    </div>
  )
}

/** Repeat picker for the phone event sheet: presets, or a custom rule. */
export function RecurrencePicker({ open, date, value, onClose, onChange }: Props) {
  const [view, setView]     = useState<'presets' | 'custom'>('presets')
  const [custom, setCustom] = useState<Custom>(DEFAULT_CUSTOM)
  const presets = makePresets(date)

  useEffect(() => { if (open) setView('presets') }, [open])

  function pick(rule: string) { haptic('tap'); onChange(rule); onClose() }
  const isCustomActive = !!value && !presets.some(p => p.rule === value)
  const set = (patch: Partial<Custom>) => setCustom(c => ({ ...c, ...patch }))
  const tick = <Check size={18} strokeWidth={2.5} className="text-gold" />

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={view === 'presets' ? 'Repeat' : 'Custom'}
      cancelLabel={view === 'presets' ? 'Cancel' : 'Back'}
      onCancel={view === 'custom' ? () => setView('presets') : undefined}
      actionPlacement="nav"
      action={view === 'custom' ? { label: 'Done', onClick: () => { onChange(customToRule(custom)); onClose() } } : undefined}
    >
      {view === 'presets' ? (
        <>
          <FormGroup>
            <FormRow label="Never" onClick={() => pick('')}>{!value && tick}</FormRow>
          </FormGroup>
          <FormGroup>
            {presets.map(({ label, rule }) => (
              <FormRow key={rule} label={label} onClick={() => pick(rule)}>{value === rule && tick}</FormRow>
            ))}
          </FormGroup>
          <FormGroup>
            <FormRow label="Custom" onClick={() => setView('custom')} chevron>{isCustomActive && tick}</FormRow>
          </FormGroup>
        </>
      ) : (
        <>
          <FormGroup header="Repeats every" plain>
            <Segmented options={FREQS} value={custom.freq} onChange={f => set({ freq: f })} labels={FREQ_LABEL} />
          </FormGroup>
          <FormGroup footer={`Repeats every ${custom.interval === 1 ? '' : `${custom.interval} `}${unit(custom.freq, custom.interval)}.`}>
            <FormRow label="Every">
              <Stepper value={custom.interval} min={1} max={99} onChange={n => set({ interval: n })} />
              <span className="w-[56px] text-left">{unit(custom.freq, custom.interval)}</span>
            </FormRow>
          </FormGroup>

          {custom.freq === 'WEEKLY' && (
            <FormGroup header="On">
              <Chips items={DOW_RRULE} labels={DOW_LABELS} cols={7}
                on={c => custom.byDays.includes(c)}
                toggle={c => set({ byDays: custom.byDays.includes(c) ? custom.byDays.filter(d => d !== c) : [...custom.byDays, c] })} />
            </FormGroup>
          )}
          {custom.freq === 'YEARLY' && (
            <FormGroup header="In" footer={`On day ${date && date.length >= 10 ? Number(date.split('-')[2]) : ''} of each month picked.`}>
              <Chips items={MON_SHORT.map((_, i) => i + 1)} labels={MON_SHORT} cols={6}
                on={m => custom.byMonths.includes(m)}
                toggle={m => set({ byMonths: custom.byMonths.includes(m) ? custom.byMonths.filter(x => x !== m) : [...custom.byMonths, m] })} />
            </FormGroup>
          )}

          <FormGroup header="Ends" plain>
            <Segmented options={END_TYPES} value={custom.endType} onChange={t => set({ endType: t })} labels={END_LABEL} />
          </FormGroup>
          {custom.endType === 'date' && (
            <FormGroup>
              <FormRow label="End date">
                <CustomDateInput value={custom.endDate} min={date} onChange={v => set({ endDate: v })} placeholder="Pick a date"
                  className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none" />
              </FormRow>
            </FormGroup>
          )}
          {custom.endType === 'count' && (
            <FormGroup>
              <FormRow label="After">
                <Stepper value={custom.endCount} min={1} max={999} onChange={n => set({ endCount: n })} />
                <span className="w-[56px] text-left">{custom.endCount === 1 ? 'time' : 'times'}</span>
              </FormRow>
            </FormGroup>
          )}
        </>
      )}
    </Sheet>
  )
}
