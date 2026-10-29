'use client'

import { useState, useEffect, useRef } from 'react'
import { Landmark } from 'lucide-react'
import type { BankType } from '@/types'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented, rowInput } from '@/components/ui/Form'

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
  const last4Ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => { setName(''); setType('Checking'); setLast4('') }, 360)
      return () => clearTimeout(t)
    }
  }, [open])

  const canAdd = !!name.trim()

  function handleAdd() {
    if (!canAdd) return
    onAdd({ name: name.trim(), type, last4: last4 || null })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Account"
      action={{ label: 'Add', onClick: handleAdd, disabled: !canAdd }}
    >
      {/* Live preview header, Wallet-style */}
      <div className="flex flex-col items-center pt-4 pb-2">
        <span
          className="flex items-center justify-center w-[64px] h-[64px] rounded-[18px]"
          style={{ background: 'linear-gradient(160deg, #E9CD7A, #B08A2A)', boxShadow: 'inset 0 1px 0 rgb(var(--rgb-ink) / 0.4), 0 8px 20px rgba(212,175,55,0.25)' }}
        >
          <Landmark size={30} strokeWidth={1.9} color="#1a1200" />
        </span>
        <p className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-ink truncate max-w-full">
          {name.trim() || 'Account'}
        </p>
        <p className="text-[13px] text-ink-muted">
          {type}{last4 ? ` ••••${last4}` : ''}
        </p>
      </div>

      <FormGroup>
        <FormRow label="Bank">
          <input
            type="text" placeholder="Chase" value={name}
            onChange={e => setName(e.target.value)}
            enterKeyHint="next"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); last4Ref.current?.focus() } }}
            className={rowInput}
          />
        </FormRow>
        <FormRow label="Last 4 digits">
          <input
            ref={last4Ref}
            type="text" inputMode="numeric" placeholder="Optional" value={last4}
            onChange={e => setLast4(e.target.value.replace(/\D/g, '').slice(0, 4))}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={`${rowInput} tabular-nums`}
          />
        </FormRow>
      </FormGroup>

      <FormGroup header="Account type" plain>
        <Segmented options={BANK_TYPES} value={type} onChange={setType} />
      </FormGroup>
    </Sheet>
  )
}
