'use client'

import { useEffect, useState } from 'react'
import { Landmark, Percent, Repeat, CalendarDays } from 'lucide-react'
import type { Bank } from '@/types'
import { localToday, $fd, fmtDate } from '@/lib/utils'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, Segmented, rowInput } from '@/components/ui/Form'

export type InterestFreq = 'Monthly' | 'Quarterly'
const FREQS: InterestFreq[] = ['Monthly', 'Quarterly']

export interface BankEdits {
  balance:            number
  apy:                number | null
  interest_freq:      InterestFreq | null
  next_interest_date: string | null
}

interface Props {
  bank:        Bank | null
  open:        boolean
  onClose:     () => void
  onSave:      (edits: BankEdits) => void
  linkedCards: number
}

/** Tap a bank on In → Accounts: its balance and interest schedule. */
export function BankSheet({ bank, open, onClose, onSave, linkedCards }: Props) {
  const [balance, setBalance] = useState('')
  const [apy,     setApy]     = useState('')
  const [freq,    setFreq]    = useState<InterestFreq>('Monthly')
  const [date,    setDate]    = useState(localToday())

  useEffect(() => {
    if (!open || !bank) return
    setBalance(bank.balance ? String(+Number(bank.balance).toFixed(2)) : '')
    setApy(bank.apy ? String(bank.apy) : '')
    setFreq((bank.interest_freq as InterestFreq) ?? 'Monthly')
    setDate(bank.next_interest_date ?? localToday())
  }, [open, bank])

  const bal = parseFloat(balance)
  const rate = parseFloat(apy)
  const hasInterest = rate > 0 && !!date
  const payout = hasInterest && bal > 0 ? bal * (rate / 100) / (freq === 'Quarterly' ? 4 : 12) : 0
  const canSave = !isNaN(bal) && bal >= 0

  function save() {
    if (!canSave) return
    onSave({
      balance:            bal,
      apy:                hasInterest ? rate : null,
      interest_freq:      hasInterest ? freq : null,
      next_interest_date: hasInterest ? date : null,
    })
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={bank?.name ?? 'Account'}
      action={{ label: 'Save', onClick: save, disabled: !canSave }}
    >
      {/* Who this is */}
      <div className="flex items-center justify-center gap-2 pt-2 text-[13px] text-ink-muted">
        <Landmark size={14} strokeWidth={1.9} />
        <span>
          {bank?.type ?? 'Bank'}{bank?.last4 ? ` ••••${bank.last4}` : ''}
          {` · ${linkedCards} ${linkedCards === 1 ? 'card' : 'cards'}`}
        </span>
      </div>

      <AmountHero value={balance} onChange={setBalance} caption="Current balance" />

      <FormGroup
        header="Interest"
        footer={payout > 0
          ? <span><span className="text-emerald font-semibold">+{$fd(payout)}</span> on {fmtDate(date)} · {rate}% APY, paid {freq.toLowerCase()}</span>
          : 'Add the APY to schedule interest payouts. They’re added to In automatically.'}
      >
        <FormRow icon={Percent} label="APY">
          <input
            type="text" inputMode="decimal" placeholder="None" value={apy}
            onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,3}$/.test(v)) setApy(v) }}
            className={`${rowInput} tabular-nums`}
          />
          {apy && <span className="text-ink-muted">%</span>}
        </FormRow>
        {rate > 0 && (
          <>
            <FormRow icon={Repeat} label="Paid">
              <div className="w-[170px]">
                <Segmented options={FREQS} value={freq} onChange={setFreq} />
              </div>
            </FormRow>
            <FormRow icon={CalendarDays} label="Next payout">
              <CustomDateInput
                value={date}
                onChange={setDate}
                className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
              />
            </FormRow>
          </>
        )}
      </FormGroup>
    </Sheet>
  )
}
