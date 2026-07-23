'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { X, Banknote } from 'lucide-react'
import { cn, localToday } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { showToast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { advanceToField } from '@/lib/field-advance'

export interface BankOption { id: string; name: string }

type Frequency = 'Weekly' | 'Biweekly' | 'Semimonthly' | 'Monthly'

const FREQUENCIES: { id: Frequency; label: string; sub: string }[] = [
  { id: 'Weekly',       label: 'Weekly',       sub: 'Every 7 days'  },
  { id: 'Biweekly',    label: 'Bi-weekly',    sub: 'Every 14 days' },
  { id: 'Semimonthly', label: 'Semi-monthly', sub: 'Twice a month' },
  { id: 'Monthly',     label: 'Monthly',      sub: 'Once a month'  },
]

function getPayDates(startDate: string, freq: Frequency): string[] {
  const [y, m, d] = startDate.split('-').map(Number)
  let cur = new Date(y, m - 1, d)
  const today = new Date(); today.setHours(23, 59, 59, 999)
  const dates: string[] = []
  while (cur <= today) {
    dates.push(
      `${cur.getFullYear()}-${String(cur.getMonth() + 1).padStart(2, '0')}-${String(cur.getDate()).padStart(2, '0')}`
    )
    switch (freq) {
      case 'Weekly':       cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 7);  break
      case 'Biweekly':    cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 14); break
      case 'Semimonthly': cur = new Date(cur.getFullYear(), cur.getMonth(), cur.getDate() + 15); break
      case 'Monthly':     cur = new Date(cur.getFullYear(), cur.getMonth() + 1, cur.getDate());  break
    }
  }
  return dates
}

interface Props {
  open:    boolean
  onClose: () => void
  banks:   BankOption[]
  onDone:  () => void
}

export function PaycheckSheet({ open, onClose, banks, onDone }: Props) {
  const supabase      = useMemo(() => createClient(), [])
  const sheetRef      = useRef<HTMLDivElement>(null)
  const dragStartY    = useRef<number | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  // Auto-advance: refs so completing a field scrolls/focuses the next one
  const amountSecRef   = useRef<HTMLDivElement>(null)
  const amountInputRef = useRef<HTMLInputElement>(null)
  const freqSecRef     = useRef<HTMLDivElement>(null)
  const bankSecRef     = useRef<HTMLDivElement>(null)
  const dateSecRef     = useRef<HTMLDivElement>(null)
  const genBtnRef      = useRef<HTMLButtonElement>(null)
  const advanceTo = (sec: HTMLElement | null, focusEl?: HTMLElement | null) =>
    advanceToField(scrollAreaRef.current, sec, focusEl)

  const [name,      setName]      = useState('Paycheck')
  const [amount,    setAmount]    = useState('')
  const [freq,      setFreq]      = useState<Frequency>('Biweekly')
  const [bankId,    setBankId]    = useState<string | null>(null)
  const [startDate, setStartDate] = useState('')
  const [saving,    setSaving]    = useState(false)

  useEffect(() => {
    if (open) {
      setName('Paycheck'); setAmount(''); setFreq('Biweekly')
      setBankId(banks[0]?.id ?? null); setStartDate(localToday())
    }
  }, [open, banks])

  // Body lock
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'; document.body.style.top = `-${scrollY}px`; document.body.style.width = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    let lastY = 0
    const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY }
    const onMove  = (e: TouchEvent) => {
      const el = scrollAreaRef.current
      if (!el?.contains(e.target as Node)) { e.preventDefault(); return }
      const dy = e.touches[0].clientY - lastY; lastY = e.touches[0].clientY
      const { scrollTop, scrollHeight, clientHeight } = el
      if ((scrollTop <= 0 && dy > 0) || (scrollTop + clientHeight >= scrollHeight - 1 && dy < 0)) e.preventDefault()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove',  onMove,  { passive: false })
    return () => {
      document.body.style.position = ''; document.body.style.top = ''; document.body.style.width = ''
      document.documentElement.style.overscrollBehavior = ''
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove',  onMove)
      window.scrollTo(0, scrollY)
    }
  }, [open])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform = `translateY(${dy}px)`; sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
        onClose()
      }, 280)
    } else { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
  }

  const amt   = parseFloat(amount)
  const valid = startDate && !isNaN(amt) && amt > 0
  const dates = valid ? getPayDates(startDate, freq) : []

  async function handleGenerate() {
    if (!dates.length || !valid) return
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSaving(true)
    const rows = dates.map(date => ({
      user_id: user.id,
      name:    name.trim() || 'Paycheck',
      amount:  amt,
      date,
      source:  'Salary',
      bank_id: bankId ?? null,
    }))
    const { error } = await supabase.from('income').insert(rows)
    setSaving(false)
    if (error) { console.error('paycheck insert error:', error); return }
    showToast(`${dates.length} paychecks added`, { type: 'add' })
    onClose()
    onDone()
  }

  const total = !isNaN(amt) && amt > 0 ? amt * dates.length : 0

  return (
    <>
      <div
        onClick={onClose}
        className={`fixed inset-0 z-[55] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        ref={sheetRef}
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3" style={{ touchAction: 'none' }}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Paycheck Generator</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>

        <div ref={scrollAreaRef} className="px-5 space-y-4 overflow-y-auto"
          style={{ maxHeight: '70vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Label */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Label</p>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Paycheck"
              enterKeyHint="next"
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); advanceTo(amountSecRef.current, amountInputRef.current) } }}
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"
            />
          </div>

          {/* Amount */}
          <div ref={amountSecRef}>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Amount per paycheck</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input
                ref={amountInputRef}
                type="number"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                enterKeyHint="next"
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur(); advanceTo(freqSecRef.current) } }}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          {/* Frequency */}
          <div ref={freqSecRef}>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Frequency</p>
            <div className="grid grid-cols-2 gap-2">
              {FREQUENCIES.map(f => (
                <button key={f.id} onClick={() => { setFreq(f.id); advanceTo(bankSecRef.current ?? dateSecRef.current) }}
                  className={cn('rounded-[14px] p-3 text-left border transition-colors',
                    freq === f.id ? 'border-gold/50 bg-bg-overlay' : 'border-white/[0.06] bg-bg-overlay')}>
                  <p className={cn('text-[13px] font-semibold leading-tight', freq === f.id ? 'text-gold' : 'text-ink')}>{f.label}</p>
                  <p className="text-[10px] text-ink-muted leading-tight mt-0.5">{f.sub}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Bank */}
          {banks.length > 0 && (
            <div ref={bankSecRef}>
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Bank account</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => { setBankId(null); advanceTo(dateSecRef.current) }}
                  className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                    bankId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  None
                </button>
                {banks.map(b => (
                  <button key={b.id} onClick={() => { setBankId(b.id); advanceTo(dateSecRef.current) }}
                    className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                      bankId === b.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Start date */}
          <div ref={dateSecRef}>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">First paycheck date</p>
            <div className="overflow-hidden rounded-[14px]">
              <CustomDateInput
                value={startDate}
                max={localToday()}
                onChange={d => { setStartDate(d); advanceTo(genBtnRef.current) }}
                className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink outline-none focus:border-gold/40"
              />
            </div>
          </div>

          {/* Preview */}
          {dates.length > 0 && (
            <div className="bg-bg-overlay border border-emerald/20 rounded-[14px] px-4 py-3.5 flex items-center gap-3">
              <Banknote size={18} className="text-emerald flex-shrink-0" strokeWidth={1.75} />
              <div>
                <p className="text-[14px] font-semibold text-ink">{dates.length} paychecks · ${total.toLocaleString()} total</p>
                <p className="text-[11px] text-ink-muted">{dates[0]} → {dates[dates.length - 1]}</p>
              </div>
            </div>
          )}

          <button
            ref={genBtnRef}
            onClick={handleGenerate}
            disabled={!dates.length || saving}
            className="w-full gradient-gold rounded-[14px] py-3.5 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity"
          >
            {saving ? 'Adding…' : dates.length > 0 ? `Generate ${dates.length} Paychecks` : 'Generate Paychecks'}
          </button>
        </div>
      </div>
    </>
  )
}
