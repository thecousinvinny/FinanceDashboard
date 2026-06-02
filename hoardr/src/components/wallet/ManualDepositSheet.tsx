'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { X, Banknote } from 'lucide-react'
import { cn, localToday, $fd } from '@/lib/utils'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { showToast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'

export interface IncomeInitial {
  id:      string
  name:    string
  amount:  number
  date:    string
  bank_id: string | null
  source:  string | null
}

interface Props {
  open:           boolean
  onClose:        () => void
  banks:          { id: string; name: string }[]
  onDone:         () => void
  defaultBankId?: string | null
  defaultLabel?:  string
  initial?:       IncomeInitial | null   // when set → edit mode
}

export function ManualDepositSheet({ open, onClose, banks, onDone, defaultBankId, defaultLabel, initial }: Props) {
  const isEdit    = !!initial
  const supabase      = useMemo(() => createClient(), [])
  const sheetRef      = useRef<HTMLDivElement>(null)
  const dragStartY    = useRef<number | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  const [label,   setLabel]   = useState('')
  const [amount,  setAmount]  = useState('')
  const [source,  setSource]  = useState<string>('Other')
  const [bankId,  setBankId]  = useState<string | null>(null)
  const [date,    setDate]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const banksRef     = useRef(banks)
  const defBankRef   = useRef(defaultBankId)
  const defLabelRef  = useRef(defaultLabel)
  const initialRef   = useRef(initial)
  useEffect(() => { banksRef.current = banks }, [banks])
  useEffect(() => { defBankRef.current = defaultBankId }, [defaultBankId])
  useEffect(() => { defLabelRef.current = defaultLabel }, [defaultLabel])
  useEffect(() => { initialRef.current = initial }, [initial])

  // Only reset when the sheet opens — not when prop references change mid-entry
  useEffect(() => {
    if (!open) return
    const ini = initialRef.current
    if (ini) {
      setLabel(ini.name)
      setAmount(String(ini.amount))
      setSource(ini.source ?? 'Other')
      setBankId(ini.bank_id)
      setDate(ini.date)
    } else {
      setLabel(defLabelRef.current ?? '')
      setAmount('')
      setSource('Other')
      setBankId(defBankRef.current ?? banksRef.current[0]?.id ?? null)
      setDate(localToday())
    }
  }, [open])

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

  // Keyboard-aware scroll: scroll focused field above keyboard
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const sc = scrollAreaRef.current
      if (!sc) return
      const kbH = Math.max(0, window.innerHeight - vv.height)
      if (kbH > 50) {
        sc.style.paddingBottom = `${kbH + 24}px`
        requestAnimationFrame(() => {
          const focused = document.activeElement as HTMLElement | null
          if (!focused || !sc.contains(focused)) return
          const clearance = vv.height - 16
          if (focused.getBoundingClientRect().bottom > clearance) {
            sc.scrollTop += focused.getBoundingClientRect().bottom - clearance
          }
        })
      } else {
        sc.style.paddingBottom = ''
      }
    }
    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      if (scrollAreaRef.current) scrollAreaRef.current.style.paddingBottom = ''
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
  const valid = date && !isNaN(amt) && amt > 0

  async function handleSave() {
    if (!valid) return
    setSaving(true)
    if (isEdit && initial) {
      const { error } = await supabase.from('income').update({
        name:    label.trim() || 'Income',
        amount:  amt,
        date,
        source,
        bank_id: bankId ?? null,
      }).eq('id', initial.id)
      setSaving(false)
      if (error) { console.error('income update error:', error); showToast('Failed to save — try again', { type: 'delete' }); return }
      showToast('Income updated', { type: 'add' })
    } else {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setSaving(false); return }
      const { error } = await supabase.from('income').insert({
        user_id: user.id,
        name:    label.trim() || 'Income',
        amount:  amt,
        date,
        source,
        bank_id: bankId ?? null,
      })
      setSaving(false)
      if (error) { console.error('income insert error:', error); showToast('Failed to save — try again', { type: 'delete' }); return }
      showToast(`${$fd(amt)} added`, { type: 'add' })
    }
    onClose()
    onDone()
  }

  return (
    <>
      <div onClick={onClose}
        className={`fixed inset-0 z-[55] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        ref={sheetRef}
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(100dvh - env(safe-area-inset-top, 44px) - 8px)', display: 'flex', flexDirection: 'column' }}
      >
        <div onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3" style={{ touchAction: 'none' }}>
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">{isEdit ? 'Edit Income' : 'Add Income'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>

        <div ref={scrollAreaRef} className="px-5 space-y-4 overflow-y-auto"
          style={{ flex: 1, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Label */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Label</p>
            <input type="text" value={label} onChange={e => setLabel(e.target.value)} placeholder="Venmo, Zelle, freelance…"
              className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"/>
          </div>

          {/* Amount */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Amount</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3 focus-within:border-gold/40">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input type="number" inputMode="decimal" placeholder="0.00" value={amount} onChange={e => setAmount(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-mono text-ink outline-none placeholder:text-ink-faint"/>
            </div>
          </div>

          {/* Bank */}
          {banks.length > 0 && (
            <div>
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Bank account</p>
              <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
                <button onClick={() => setBankId(null)}
                  className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                    bankId === null ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  None
                </button>
                {banks.map(b => (
                  <button key={b.id} onClick={() => setBankId(b.id)}
                    className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-semibold transition-all select-none',
                      bankId === b.id ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                    {b.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Category */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Category</p>
            <div className="grid grid-cols-4 gap-2">
              {(['Other', 'Projects', 'Repayment', 'Refund'] as const).map(s => (
                <button key={s} onClick={() => setSource(s)}
                  className={cn(
                    'flex flex-col items-center gap-1 py-2.5 rounded-[14px] transition-all select-none',
                    source === s ? 'bg-gold/15 ring-1 ring-gold/40' : 'bg-bg-overlay',
                  )}>
                  <CategoryIcon category={s} type="Income" size={18} className={source === s ? 'text-gold' : 'text-ink-muted'} />
                  <span className="text-[9px] font-medium text-ink-muted leading-tight text-center px-0.5">{s}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Date */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Date</p>
            <div className="overflow-hidden rounded-[14px]">
              <input type="date" value={date} onChange={e => setDate(e.target.value)}
                className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none focus:border-gold/40"
                style={{ colorScheme: 'dark' }}/>
            </div>
          </div>

          {/* Preview */}
          {valid && (
            <div className="bg-bg-overlay border border-emerald/20 rounded-[14px] px-4 py-3.5 flex items-center gap-3">
              <Banknote size={18} className="text-emerald flex-shrink-0" strokeWidth={1.75} />
              <p className="text-[14px] font-semibold text-ink">
                {$fd(amt)} · {date}
              </p>
            </div>
          )}

          <button onClick={handleSave} disabled={!valid || saving}
            className="w-full gradient-gold rounded-[14px] py-3.5 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity">
            {saving ? 'Saving…' : isEdit ? 'Save Changes' : (valid ? `Add ${$fd(amt)}` : 'Add Income')}
          </button>
        </div>
      </div>
    </>
  )
}
