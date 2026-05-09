'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import type { BankType } from '@/types'

const BANK_TYPES: BankType[] = ['Checking', 'Savings', 'Investment', 'Business']

export interface NewBank {
  name:  string
  type:  BankType
  last4: string | null
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (bank: NewBank) => void
}

export function AddBankSheet({ open, onClose, onAdd }: Props) {
  const [name,  setName]  = useState('')
  const [type,  setType]  = useState<BankType>('Checking')
  const [last4, setLast4] = useState('')

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setName(''); setType('Checking'); setLast4('') }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAdd() {
    if (!name.trim()) return
    onAdd({ name: name.trim(), type, last4: last4 || null })
    onClose()
  }

  const canAdd = !!name.trim()

  return (
    <>
      <div
        onClick={onClose}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>
        <div className="flex items-center justify-between px-5 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Bank</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Name */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Bank Name</p>
            <input type="text" placeholder="e.g. Chase" value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Type */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">Account Type</p>
            <div className="grid grid-cols-2 gap-2">
              {BANK_TYPES.map(t => (
                <button key={t} onClick={() => setType(t)}
                  className={cn('py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none', type === t ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* Last 4 */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              Last 4 Digits <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <input type="text" inputMode="numeric" placeholder="1234" value={last4}
              onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] font-mono text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Submit */}
          <button onClick={handleAdd} disabled={!canAdd}
            className={cn('w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none', canAdd ? 'gradient-gold text-white shadow-gold' : 'bg-bg-overlay text-ink-faint')}>
            Add Bank
          </button>
        </div>
      </div>
    </>
  )
}
