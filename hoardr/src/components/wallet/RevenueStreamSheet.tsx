'use client'

import { useEffect, useRef, useState } from 'react'
import { Landmark, CalendarDays, Repeat } from 'lucide-react'
import { localToday } from '@/lib/utils'
import { resolveDefaultBankId } from '@/lib/app-prefs'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, rowInput, amountStr } from '@/components/ui/Form'

export interface BankOption { id: string; name: string }

export type Frequency = 'Weekly' | 'Biweekly' | 'Semimonthly' | 'Monthly'

export interface RevenueStreamConfig {
  id:             string
  name:           string
  amount:         number
  freq:           Frequency
  bankId:         string | null
  nextPayDate:    string
  // Legacy fields kept for migration — not used in new streams
  startDate?:     string
  lastGenerated?: string
}

const FREQUENCIES: { id: Frequency; label: string }[] = [
  { id: 'Weekly',      label: 'Weekly'        },
  { id: 'Biweekly',    label: 'Every 2 Weeks' },
  { id: 'Semimonthly', label: 'Twice a Month' },
  { id: 'Monthly',     label: 'Monthly'       },
]

interface Props {
  open:     boolean
  onClose:  () => void
  banks:    BankOption[]
  onDone:   (config: RevenueStreamConfig) => void
  initial?: RevenueStreamConfig
}

/** Add / edit a recurring income stream (paycheck etc.). No DB ops — the caller saves. */
export function RevenueStreamSheet({ open, onClose, banks, onDone, initial }: Props) {
  const [name,        setName]        = useState('Main Job')
  const [amount,      setAmount]      = useState('')
  const [freq,        setFreq]        = useState<Frequency>('Biweekly')
  const [bankId,      setBankId]      = useState<string | null>(null)
  const [nextPayDate, setNextPayDate] = useState('')

  const banksRef   = useRef(banks)
  const initialRef = useRef(initial)
  useEffect(() => { banksRef.current = banks },     [banks])
  useEffect(() => { initialRef.current = initial }, [initial])

  useEffect(() => {
    if (!open) return
    const ini = initialRef.current
    const bk  = banksRef.current
    setName(ini?.name ?? 'Main Job')
    setAmount(ini?.amount ? amountStr(ini.amount) : '')
    setFreq(ini?.freq ?? 'Biweekly')
    setBankId(ini ? ini.bankId : resolveDefaultBankId(bk))
    setNextPayDate(ini?.nextPayDate ?? localToday())
  }, [open])

  const amt   = parseFloat(amount)
  const valid = !!nextPayDate && !isNaN(amt) && amt > 0

  function handleSave() {
    if (!valid) return
    onDone({
      id:          initial?.id ?? crypto.randomUUID(),
      name:        name.trim() || 'Main Job',
      amount:      amt,
      freq,
      bankId:      bankId ?? null,
      nextPayDate,
    })
    onClose()
  }

  const freqLabel = FREQUENCIES.find(f => f.id === freq)?.label ?? freq
  const bank = banks.find(b => b.id === bankId)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={initial ? 'Edit Income Stream' : 'New Income Stream'}
      action={{ label: initial ? 'Save' : 'Add', onClick: handleSave, disabled: !valid }}
    >
      <AmountHero value={amount} onChange={setAmount} caption={`${freqLabel} · per paycheck`} />

      <FormGroup>
        <FormRow label="Name">
          <input
            type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Main Job"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        <Select
          value={freq}
          onChange={e => setFreq(e.target.value as Frequency)}
          aria-label="Repeats"
          className="w-full text-left"
          trigger={<FormRow icon={Repeat} label="Repeats" chevron><span>{freqLabel}</span></FormRow>}
        >
          {FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
        </Select>
        <FormRow icon={CalendarDays} label="Next payday">
          <CustomDateInput
            value={nextPayDate}
            onChange={setNextPayDate}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
        {banks.length > 0 && (
          <Select
            value={bankId ?? ''}
            onChange={e => setBankId(e.target.value || null)}
            aria-label="Deposit to"
            className="w-full text-left"
            trigger={<FormRow icon={Landmark} label="Deposit to" chevron><span className="truncate">{bank?.name ?? 'None'}</span></FormRow>}
          >
            <option value="">None</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
      </FormGroup>
    </Sheet>
  )
}
