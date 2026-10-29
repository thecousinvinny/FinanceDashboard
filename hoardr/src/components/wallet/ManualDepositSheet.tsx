'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import { Landmark, CalendarDays } from 'lucide-react'
import { localToday, $fd } from '@/lib/utils'
import { resolveDefaultBankId } from '@/lib/app-prefs'
import { CustomDateInput } from '@/components/ui/CustomDateInput'
import { showToast } from '@/lib/toast'
import { createClient } from '@/lib/supabase/client'
import { Select } from '@/components/ui/Select'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, AmountHero, CategoryPicker, rowInput } from '@/components/ui/Form'

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

const SOURCES = [{ name: 'Other' }, { name: 'Projects' }, { name: 'Repayment' }, { name: 'Refund' }]

export function ManualDepositSheet({ open, onClose, banks, onDone, defaultBankId, defaultLabel, initial }: Props) {
  const isEdit   = !!initial
  const supabase = useMemo(() => createClient(), [])
  const labelRef = useRef<HTMLInputElement>(null)

  const [label,   setLabel]   = useState('')
  const [amount,  setAmount]  = useState('')
  const [source,  setSource]  = useState<string>('Other')
  const [bankId,  setBankId]  = useState<string | null>(null)
  const [date,    setDate]    = useState('')
  const [saving,  setSaving]  = useState(false)

  const banksRef     = useRef(banks)
  const defLabelRef  = useRef(defaultLabel)
  const initialRef   = useRef(initial)
  useEffect(() => { banksRef.current = banks }, [banks])
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
      setBankId(resolveDefaultBankId(banksRef.current))
      setDate(localToday())
    }
  }, [open])

  const amt   = parseFloat(amount)
  const valid = !!date && !isNaN(amt) && amt > 0

  async function handleSave() {
    if (!valid || saving) return
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

  const sortedBanks = [...banks].sort((a, b) => (a.id === defaultBankId ? -1 : b.id === defaultBankId ? 1 : 0))
  const bank = banks.find(b => b.id === bankId)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Income' : 'New Income'}
      action={{ label: saving ? 'Saving…' : isEdit ? 'Save' : 'Add', onClick: handleSave, disabled: !valid || saving }}
    >
      <AmountHero value={amount} onChange={setAmount} onEnter={() => labelRef.current?.focus()} />

      <FormGroup>
        <FormRow label="From">
          <input
            ref={labelRef}
            type="text" value={label} onChange={e => setLabel(e.target.value)}
            placeholder="Venmo, Zelle…"
            enterKeyHint="done"
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() } }}
            className={rowInput}
          />
        </FormRow>
        {banks.length > 0 && (
          <Select
            value={bankId ?? ''}
            onChange={e => setBankId(e.target.value || null)}
            aria-label="Deposit to"
            className="w-full text-left"
            trigger={
              <FormRow icon={Landmark} iconColor="#30B0C7" label="Deposit to" chevron>
                <span className="truncate">{bank?.name ?? 'None'}</span>
              </FormRow>
            }
          >
            <option value="">None</option>
            {sortedBanks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        )}
        <FormRow icon={CalendarDays} iconColor="#FF453A" label="Date">
          <CustomDateInput
            value={date}
            onChange={setDate}
            className="sheet-date-input bg-transparent text-right text-[16px] text-ink-muted outline-none"
          />
        </FormRow>
      </FormGroup>

      <FormGroup header="Category">
        <CategoryPicker categories={SOURCES} value={source} type="Income" onChange={s => s && setSource(s)} />
      </FormGroup>
    </Sheet>
  )
}
