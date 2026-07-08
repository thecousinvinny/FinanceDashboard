'use client'

import { useState, useEffect, useRef } from 'react'
import { ChevronDown, ArrowLeftRight } from 'lucide-react'
import { cn, localToday } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'

export interface TransferPayload {
  from_bank_id: string
  to_bank_id:   string
  amount:       number
  date:         string
  note:         string | null
}

interface BankOption { id: string; name: string; balance?: number | null }

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (t: TransferPayload) => void
  banks:   BankOption[]
}

export function AddTransferSheet({ open, onClose, onAdd, banks }: Props) {
  const [fromId,  setFromId]  = useState<string>('')
  const [toId,    setToId]    = useState<string>('')
  const [amount,  setAmount]  = useState('')
  const [date,    setDate]    = useState(localToday())
  const [note,    setNote]    = useState('')

  const sheetRef      = useRef<HTMLDivElement>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)
  const dragStartY    = useRef<number | null>(null)

  // Seed from/to when banks load or sheet opens
  useEffect(() => {
    if (!open) return
    setFromId(banks[0]?.id ?? '')
    setToId(banks[1]?.id ?? '')
    setAmount('')
    setDate(localToday())
    setNote('')
  }, [open, banks])

  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top      = `-${scrollY}px`
    document.body.style.width    = '100%'
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
      document.body.style.position = ''
      document.body.style.top      = ''
      document.body.style.width    = ''
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
    sheetRef.current.style.transform  = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
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
    } else {
      sheetRef.current.style.transform  = ''
      sheetRef.current.style.transition = ''
    }
  }

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setAmount(''); setNote(''); setDate(localToday()) }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }

  function swap() {
    const tmp = fromId
    setFromId(toId)
    setToId(tmp)
  }

  function handleAdd() {
    const parsed = parseFloat(amount)
    if (!parsed || !fromId || !toId || fromId === toId) return
    onAdd({ from_bank_id: fromId, to_bank_id: toId, amount: parsed, date, note: note.trim() || null })
    onClose()
  }

  const fromBank = banks.find(b => b.id === fromId)
  const toBank   = banks.find(b => b.id === toId)
  const canAdd   = !!parseFloat(amount) && !!fromId && !!toId && fromId !== toId

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      <div
        ref={sheetRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Transfer</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div
          ref={scrollAreaRef}
          className="px-5 space-y-4 overflow-y-auto"
          style={{ maxHeight: '72vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}
        >

          {/* Amount */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Amount</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-2.5">
              <span className="text-[20px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          {/* From / To banks with swap button */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">From</p>
            {banks.length < 2 ? (
              <p className="text-[12px] text-ink-faint py-2">Need at least 2 banks to transfer.</p>
            ) : (
              <div className="relative">
                <select
                  value={fromId}
                  onChange={e => setFromId(e.target.value)}
                  className="w-full bg-bg-overlay border border-white/[0.06] rounded-[14px] px-4 py-3 text-[15px] text-ink appearance-none outline-none pr-10"
                  style={{ colorScheme: 'dark' }}
                >
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.balance != null ? ` — $${Number(b.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>
            )}
          </div>

          {/* Swap button */}
          {banks.length >= 2 && (
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px bg-white/[0.06]" />
              <button
                onClick={swap}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-bg-overlay text-ink-muted text-[11px] font-medium select-none"
              >
                <ArrowLeftRight size={12} strokeWidth={2} />
                Swap
              </button>
              <div className="flex-1 h-px bg-white/[0.06]" />
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">To</p>
            {banks.length >= 2 && (
              <div className="relative">
                <select
                  value={toId}
                  onChange={e => setToId(e.target.value)}
                  className="w-full bg-bg-overlay border border-white/[0.06] rounded-[14px] px-4 py-3 text-[15px] text-ink appearance-none outline-none pr-10"
                  style={{ colorScheme: 'dark' }}
                >
                  {banks.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.balance != null ? ` — $${Number(b.balance).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ''}</option>
                  ))}
                </select>
                <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
              </div>
            )}
            {fromId && toId && fromId === toId && (
              <p className="text-[11px] text-ruby mt-1.5">From and To must be different banks.</p>
            )}
          </div>

          {/* Transfer summary */}
          {canAdd && fromBank && toBank && (
            <div className="bg-bg-overlay rounded-[14px] px-4 py-3 flex items-center gap-2">
              <span className="text-[13px] text-ink-muted">{fromBank.name}</span>
              <ArrowLeftRight size={12} className="text-gold flex-shrink-0" strokeWidth={2} />
              <span className="text-[13px] text-ink-muted">{toBank.name}</span>
              <span className="text-[13px] font-semibold font-mono text-gold ml-auto">${parseFloat(amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
            </div>
          )}

          {/* Date */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Date</p>
            <div className="overflow-hidden rounded-[14px] bg-bg-overlay">
              <CustomDateInput
                value={date} onChange={setDate}
                className="w-full bg-transparent px-4 py-3 text-[15px] text-ink outline-none"
              />
            </div>
          </div>

          {/* Note */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Note <span className="normal-case">(optional)</span></p>
            <input
              type="text" placeholder="e.g. Monthly savings" value={note}
              onChange={e => setNote(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <button
            onClick={handleAdd} disabled={!canAdd}
            className={cn(
              'w-full py-3.5 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canAdd ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Transfer
          </button>
        </div>
      </div>
    </>
  )
}
