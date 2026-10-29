'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowUpDown, ArrowUpRight, ArrowDownLeft, CalendarDays } from 'lucide-react'
import { localToday, $fd, haptic } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, rowInput } from '@/components/ui/Form'

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
  const [spin,    setSpin]    = useState(0)
  const noteRef = useRef<HTMLInputElement>(null)

  // Seed from/to when banks load or sheet opens
  useEffect(() => {
    if (!open) return
    setFromId(banks[0]?.id ?? '')
    setToId(banks[1]?.id ?? '')
    setAmount('')
    setDate(localToday())
    setNote('')
  }, [open, banks])

  function swap() {
    haptic('tap')
    setSpin(s => s + 180)
    setFromId(toId)
    setToId(fromId)
  }

  const canAdd = !!parseFloat(amount) && !!fromId && !!toId && fromId !== toId

  function handleAdd() {
    const parsed = parseFloat(amount)
    if (!canAdd) return
    onAdd({ from_bank_id: fromId, to_bank_id: toId, amount: parsed, date, note: note.trim() || null })
    onClose()
  }

  const bankRow = (role: 'From' | 'To', id: string, set: (v: string) => void) => {
    const b = banks.find(x => x.id === id)
    return (
      <Select
        value={id}
        onChange={e => set(e.target.value)}
        aria-label={role}
        className="w-full text-left"
        trigger={
          <FormRow
            icon={role === 'From' ? ArrowUpRight : ArrowDownLeft}
            iconColor={role === 'From' ? '#FF9F0A' : '#30D158'}
            label={role}
            chevron
          >
            <span className="flex flex-col items-end min-w-0 leading-tight">
              <span className="truncate text-ink">{b?.name ?? 'Choose'}</span>
              {b?.balance != null && <span className="text-[12px] text-ink-muted tabular-nums">{$fd(Number(b.balance))}</span>}
            </span>
          </FormRow>
        }
      >
        {banks.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
      </Select>
    )
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="New Transfer"
      action={{ label: 'Transfer', onClick: handleAdd, disabled: !canAdd }}
    >
      <AmountHero value={amount} onChange={setAmount} onEnter={() => noteRef.current?.focus()} />

      {banks.length < 2 ? (
        <FormGroup footer="Add a second account to move money between them." >
          <FormRow label="Accounts">{banks.length} of 2</FormRow>
        </FormGroup>
      ) : (
        <FormGroup
          header={
            <span className="flex items-end justify-between">
              <span>Accounts</span>
              <button
                type="button"
                onClick={swap}
                className="sheet-nav-btn flex items-center gap-1 normal-case tracking-normal text-[14px] text-gold -mb-0.5"
              >
                <ArrowUpDown size={14} strokeWidth={2.25} style={{ transform: `rotate(${spin}deg)`, transition: 'transform 0.45s cubic-bezier(0.32, 0.72, 0, 1)' }} />
                Swap
              </button>
            </span>
          }
          footer={fromId && fromId === toId ? <span className="text-ruby">Choose two different accounts.</span> : undefined}
        >
          {bankRow('From', fromId, setFromId)}
          {bankRow('To',   toId,   setToId)}
        </FormGroup>
      )}

      <FormGroup>
        <FormRow icon={CalendarDays} iconColor="#FF453A" label="Date">
          <CustomDateInput
            value={date}
            onChange={setDate}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
        <FormRow label="Note">
          <input
            ref={noteRef}
            type="text" placeholder="Optional" value={note}
            onChange={e => setNote(e.target.value)}
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
      </FormGroup>
    </Sheet>
  )
}
