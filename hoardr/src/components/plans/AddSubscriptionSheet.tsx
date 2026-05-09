'use client'

import { useState, useEffect } from 'react'
import { localToday, cn } from '@/lib/utils'
import type { BillingCycle } from '@/types'

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'Weekly',    label: 'Weekly'    },
  { value: 'BiWeekly',  label: 'Bi-Weekly' },
  { value: 'Monthly',   label: 'Monthly'   },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Annual',    label: 'Annual'    },
]

export interface NewSub {
  name:         string
  cost:         number
  billing:      BillingCycle
  next_renewal: string
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (sub: NewSub) => void
}

export function AddSubscriptionSheet({ open, onClose, onAdd }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [billing,     setBilling]     = useState<BillingCycle>('Monthly')
  const [nextRenewal, setNextRenewal] = useState(localToday())

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName('')
        setAmount('')
        setBilling('Monthly')
        setNextRenewal(localToday())
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }

  function handleAdd() {
    const parsed = parseFloat(amount)
    if (!parsed || !name.trim()) return
    onAdd({ name: name.trim(), cost: parsed, billing, next_renewal: nextRenewal })
    onClose()
  }

  const canAdd = !!parseFloat(amount) && !!name.trim()

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
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Handle */}
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Title */}
        <div className="flex items-center justify-between px-5 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Subscription</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">
            ×
          </button>
        </div>

        {/* Body */}
        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Name */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Name</p>
            <input
              type="text"
              placeholder="e.g. Spotify"
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          {/* Cost */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Cost</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-3">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-[28px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          {/* Billing cycle */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Billing Cycle</p>
            <div className="grid grid-cols-3 gap-2">
              {BILLING_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => setBilling(opt.value)}
                  className={cn(
                    'py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none',
                    billing === opt.value
                      ? 'gradient-gold text-white'
                      : 'bg-bg-overlay text-ink-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Next renewal */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Next Renewal</p>
            <input
              type="date"
              value={nextRenewal}
              onChange={e => setNextRenewal(e.target.value)}
              style={{ colorScheme: 'dark' }}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink outline-none"
            />
          </div>

          {/* Submit */}
          <button
            onClick={handleAdd}
            disabled={!canAdd}
            className={cn(
              'w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canAdd
                ? 'gradient-gold text-white shadow-gold'
                : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Add Subscription
          </button>
        </div>
      </div>
    </>
  )
}
