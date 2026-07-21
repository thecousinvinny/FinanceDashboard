'use client'

import { useState, useEffect } from 'react'
import { ChevronLeft, Check } from 'lucide-react'
import { CustomDateInput } from '@/components/ui/CustomDateInput'

const DOW_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']
const DOW_RRULE  = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_NAMES  = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const MON_SHORT  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const ORDINALS   = ['1st','2nd','3rd','4th','5th']

interface Preset { label: string; rule: string }

function makePresets(dateStr: string): Preset[] {
  if (!dateStr || dateStr.length < 10) return []
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt   = new Date(y, m - 1, d)
  const dow  = dt.getDay()
  const code = DOW_RRULE[dow]
  const name = DAY_NAMES[dow]
  const ord  = Math.ceil(d / 7)
  const ordLbl = ORDINALS[ord - 1] ?? `${ord}th`
  const short  = name.slice(0, 3)
  return [
    { label: 'Every day',                                rule: 'FREQ=DAILY' },
    { label: 'Every weekday (Mon–Fri)',                  rule: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
    { label: `Every week (on ${name})`,                  rule: `FREQ=WEEKLY;BYDAY=${code}` },
    { label: `Every 2 weeks (on ${name})`,               rule: `FREQ=WEEKLY;INTERVAL=2;BYDAY=${code}` },
    { label: `Every month (on the ${ordLbl})`,           rule: `FREQ=MONTHLY;BYMONTHDAY=${d}` },
    { label: `Every month (on the ${ordLbl} ${short})`,  rule: `FREQ=MONTHLY;BYDAY=${ord}${code}` },
    { label: `Every year (on ${MON_SHORT[m-1]} ${d})`,   rule: `FREQ=YEARLY;BYMONTH=${m};BYMONTHDAY=${d}` },
  ]
}

type Freq = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
interface Custom { freq: Freq; interval: number; byDays: string[]; byMonths: number[]; endType: 'never' | 'date' | 'count'; endDate: string; endCount: number }

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

const M = 'var(--font-montserrat)'
const GOLD = '#C9A84C'

interface Props {
  open:      boolean
  date:      string
  value:     string
  elevated?: boolean   // render above z-200 popovers (desktop CalendarPopover)
  onClose:   () => void
  onChange:  (rule: string) => void
}

export function RecurrencePicker({ open, date, value, elevated, onClose, onChange }: Props) {
  const [view, setView]     = useState<'presets' | 'custom'>('presets')
  const [custom, setCustom] = useState<Custom>(DEFAULT_CUSTOM)
  const presets = makePresets(date)

  useEffect(() => { if (open) setView('presets') }, [open])

  if (!open) return null

  function selectPreset(rule: string) { onChange(rule); onClose() }
  function handleCustomDone() { onChange(customToRule(custom)); onClose() }

  const isCustomActive = !!value && !presets.some(p => p.rule === value)

  return (
    <>
      <div data-recur-picker className={`fixed inset-0 ${elevated ? 'z-[205]' : 'z-[60]'}`} style={{ background: 'rgba(0,0,0,0.55)' }} onClick={onClose} />
      <div data-recur-picker className={`fixed inset-x-0 bottom-0 ${elevated ? 'z-[210]' : 'z-[70]'} rounded-t-[24px]`} style={{ background: '#1a1a1a', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full" style={{ background: 'rgba(255,255,255,0.2)' }} />
        </div>

        {view === 'presets' ? (
          <>
            <div className="flex items-center justify-between px-5 mb-3">
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: '#fff' }}>Repeat</h2>
              <button onClick={onClose} style={{ fontFamily: M, fontSize: 15, color: GOLD, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>Done</button>
            </div>

            <div>
              {/* Never */}
              <button onClick={() => selectPreset('')} className="w-full flex items-center justify-between px-5 py-[14px]"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'none', cursor: 'pointer' }}>
                <span style={{ fontFamily: M, fontSize: 15, color: '#fff' }}>Never</span>
                {!value && <Check size={16} color={GOLD} strokeWidth={2.5} />}
              </button>

              {presets.map(({ label, rule }) => (
                <button key={rule} onClick={() => selectPreset(rule)} className="w-full flex items-center justify-between px-5 py-[14px]"
                  style={{ borderBottom: '1px solid rgba(255,255,255,0.07)', background: 'none', cursor: 'pointer' }}>
                  <span style={{ fontFamily: M, fontSize: 15, color: '#fff' }}>{label}</span>
                  {value === rule && <Check size={16} color={GOLD} strokeWidth={2.5} />}
                </button>
              ))}

              <button onClick={() => setView('custom')} className="w-full flex items-center justify-between px-5 py-[14px]"
                style={{ background: 'none', cursor: 'pointer', marginBottom: 8 }}>
                <span style={{ fontFamily: M, fontSize: 15, color: '#fff' }}>Custom…</span>
                {isCustomActive && <Check size={16} color={GOLD} strokeWidth={2.5} />}
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center justify-between px-5 mb-3">
              <button onClick={() => setView('presets')} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 4px 4px 0', display: 'flex', alignItems: 'center' }}>
                <ChevronLeft size={20} color={GOLD} />
              </button>
              <h2 style={{ fontFamily: M, fontSize: 17, fontWeight: 700, color: '#fff' }}>Custom</h2>
              <button onClick={handleCustomDone} style={{ fontFamily: M, fontSize: 15, color: GOLD, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>Done</button>
            </div>

            <div style={{ maxHeight: '62vh', overflowY: 'auto', padding: '0 20px', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overscrollBehavior: 'contain' }}>

              {/* Frequency */}
              <p style={{ fontFamily: M, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Frequency</p>
              <div style={{ display: 'flex', gap: 7, marginBottom: 20 }}>
                {(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'] as Freq[]).map(f => (
                  <button key={f} onClick={() => setCustom(c => ({ ...c, freq: f }))} style={{
                    flex: 1, padding: '9px 4px', borderRadius: 10, fontFamily: M, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                    background: custom.freq === f ? 'linear-gradient(135deg,#F6DF9E,#D4AF37,#A47F23)' : 'rgba(255,255,255,0.07)',
                    color: custom.freq === f ? '#1a1a1a' : 'rgba(255,255,255,0.55)',
                  }}>
                    {f === 'DAILY' ? 'Day' : f === 'WEEKLY' ? 'Week' : f === 'MONTHLY' ? 'Month' : 'Year'}
                  </button>
                ))}
              </div>

              {/* Interval */}
              <p style={{ fontFamily: M, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>Every</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '10px 14px', marginBottom: 20 }}>
                <button onClick={() => setCustom(c => ({ ...c, interval: Math.max(1, c.interval - 1) }))} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, fontWeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>−</button>
                <span style={{ fontFamily: M, fontSize: 22, fontWeight: 700, color: '#fff', flex: 1, textAlign: 'center' }}>{custom.interval}</span>
                <button onClick={() => setCustom(c => ({ ...c, interval: Math.min(99, c.interval + 1) }))} style={{ width: 30, height: 30, borderRadius: 8, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 20, fontWeight: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>+</button>
                <span style={{ fontFamily: M, fontSize: 14, color: 'rgba(255,255,255,0.45)', minWidth: 50 }}>
                  {custom.freq === 'DAILY'   ? (custom.interval === 1 ? 'day'   : 'days')   :
                   custom.freq === 'WEEKLY'  ? (custom.interval === 1 ? 'week'  : 'weeks')  :
                   custom.freq === 'MONTHLY' ? (custom.interval === 1 ? 'month' : 'months') :
                                               (custom.interval === 1 ? 'year'  : 'years')}
                </span>
              </div>

              {/* Day picker — WEEKLY only */}
              {custom.freq === 'WEEKLY' && (
                <>
                  <p style={{ fontFamily: M, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>On</p>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
                    {DOW_LABELS.map((lbl, i) => {
                      const code   = DOW_RRULE[i]
                      const active = custom.byDays.includes(code)
                      return (
                        <button key={i} onClick={() => setCustom(c => ({ ...c, byDays: active ? c.byDays.filter(d => d !== code) : [...c.byDays, code] }))} style={{
                          flex: 1, height: 36, borderRadius: 8, fontFamily: M, fontSize: 12, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: active ? 'linear-gradient(135deg,#F6DF9E,#D4AF37,#A47F23)' : 'rgba(255,255,255,0.07)',
                          color: active ? '#1a1a1a' : 'rgba(255,255,255,0.45)',
                        }}>{lbl}</button>
                      )
                    })}
                  </div>
                </>
              )}

              {/* Month picker — YEARLY only */}
              {custom.freq === 'YEARLY' && (
                <>
                  <p style={{ fontFamily: M, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>In</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 6, marginBottom: 20 }}>
                    {MON_SHORT.map((lbl, i) => {
                      const mo     = i + 1
                      const active = custom.byMonths.includes(mo)
                      return (
                        <button key={mo} onClick={() => setCustom(c => ({ ...c, byMonths: active ? c.byMonths.filter(x => x !== mo) : [...c.byMonths, mo] }))} style={{
                          height: 34, borderRadius: 8, fontFamily: M, fontSize: 11, fontWeight: 600, cursor: 'pointer', border: 'none',
                          background: active ? 'linear-gradient(135deg,#F6DF9E,#D4AF37,#A47F23)' : 'rgba(255,255,255,0.07)',
                          color: active ? '#1a1a1a' : 'rgba(255,255,255,0.45)',
                        }}>{lbl}</button>
                      )
                    })}
                  </div>
                  <p style={{ fontFamily: M, fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: -12, marginBottom: 20 }}>
                    Repeats on day {date && date.length >= 10 ? Number(date.split('-')[2]) : ''} of each selected month.
                  </p>
                </>
              )}

              {/* End condition */}
              <p style={{ fontFamily: M, fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.3)', marginBottom: 8 }}>End</p>
              <div style={{ borderRadius: 12, overflow: 'hidden', marginBottom: 8 }}>
                {([
                  { type: 'never' as const, label: 'Never' },
                  { type: 'date'  as const, label: 'On date' },
                  { type: 'count' as const, label: 'After' },
                ] as const).map(({ type, label }, i, arr) => (
                  /* div, not button — the row hosts nested buttons (date picker / stepper) */
                  <div key={type} role="button" tabIndex={0} onClick={() => setCustom(c => ({ ...c, endType: type }))} className="w-full flex items-center justify-between px-4 py-[14px]"
                    style={{ background: 'rgba(255,255,255,0.06)', borderBottom: i < arr.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none', cursor: 'pointer' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${custom.endType === type ? GOLD : 'rgba(255,255,255,0.2)'}`, background: custom.endType === type ? GOLD : 'transparent', flexShrink: 0, transition: 'all 0.15s', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {custom.endType === type && <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#1a1a1a', display: 'block' }} />}
                      </span>
                      <span style={{ fontFamily: M, fontSize: 15, color: '#fff' }}>{label}</span>
                    </div>
                    {type === 'date' && custom.endType === 'date' && (
                      <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 8 }} onClick={e => e.stopPropagation()}>
                        <CustomDateInput value={custom.endDate} min={date}
                          onChange={v => setCustom(c => ({ ...c, endDate: v }))}
                          placeholder="Pick a date"
                          style={{ background: 'transparent', border: 'none', color: GOLD, fontSize: 14, fontFamily: M, padding: '4px 8px', outline: 'none' }} />
                      </div>
                    )}
                    {type === 'count' && custom.endType === 'count' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => setCustom(c => ({ ...c, endCount: Math.max(1, c.endCount - 1) }))} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>−</button>
                        <span style={{ fontFamily: M, fontSize: 15, color: GOLD, minWidth: 24, textAlign: 'center' }}>{custom.endCount}</span>
                        <button onClick={() => setCustom(c => ({ ...c, endCount: Math.min(999, c.endCount + 1) }))} style={{ width: 26, height: 26, borderRadius: 6, background: 'rgba(255,255,255,0.1)', border: 'none', color: '#fff', cursor: 'pointer', fontSize: 16, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>+</button>
                        <span style={{ fontFamily: M, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>times</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>

            </div>
          </>
        )}
      </div>
    </>
  )
}
