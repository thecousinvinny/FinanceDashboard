'use client'

import { Repeat } from 'lucide-react'
import type { BillingCycle, BillingUnit } from '@/types'
import { billingLabel, cycleOf } from '@/lib/utils'
import { Select } from '@/components/ui/Select'
import { FormRow, Segmented, Stepper } from '@/components/ui/Form'

export interface BillingValue {
  billing:       BillingCycle
  billing_every: number | null
  billing_unit:  BillingUnit | null
}

const PRESETS: { value: BillingCycle; label: string }[] = [
  { value: 'Weekly',    label: 'Weekly'        },
  { value: 'BiWeekly',  label: 'Every 2 Weeks' },
  { value: 'Monthly',   label: 'Monthly'       },
  { value: 'Quarterly', label: 'Quarterly'     },
  { value: 'Annual',    label: 'Yearly'        },
  { value: 'Custom',    label: 'Custom…'       },
]
const UNITS: BillingUnit[] = ['day', 'week', 'month', 'year']
const UNIT_LABEL: Record<BillingUnit, string> = { day: 'Days', week: 'Weeks', month: 'Months', year: 'Years' }

/** Caption for a subscription's amount: "Monthly", "Every 3 weeks" */
export const billingCaption = (v: BillingValue) =>
  v.billing === 'Annual' ? 'Yearly' : v.billing === 'BiWeekly' ? 'Every 2 Weeks' : billingLabel(v)

/**
 * The Repeats rows of the subscription sheets: a preset, or Custom — every N
 * days / weeks / months / years. Rendered as a fragment so its rows sit in
 * the caller's FormGroup.
 */
export function BillingPicker({ value, onChange }: { value: BillingValue; onChange: (v: BillingValue) => void }) {
  const custom = value.billing === 'Custom'
  const { every, unit } = cycleOf(value)

  function pick(b: BillingCycle) {
    // Custom starts from whatever the cycle was, so "Monthly → Custom" reads "every 1 month"
    if (b === 'Custom') onChange({ billing: 'Custom', billing_every: every, billing_unit: unit })
    else onChange({ billing: b, billing_every: null, billing_unit: null })
  }
  const word = (n: number) => `${unit}${n === 1 ? '' : 's'}`

  return (
    <>
      <Select
        value={value.billing}
        onChange={e => pick(e.target.value as BillingCycle)}
        aria-label="Repeats"
        className="w-full text-left"
        trigger={
          <FormRow icon={Repeat} iconColor="#BF5AF2" label="Repeats" chevron>
            <span>{custom ? 'Custom' : billingCaption(value)}</span>
          </FormRow>
        }
      >
        {PRESETS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </Select>
      {custom && (
        <>
          <FormRow label="Every">
            <Stepper value={every} min={1} max={999}
              onChange={n => onChange({ billing: 'Custom', billing_every: n, billing_unit: unit })} />
            <span className="w-[54px] text-left">{word(every)}</span>
          </FormRow>
          <div className="px-3 py-2.5">
            <Segmented options={UNITS} value={unit} labels={UNIT_LABEL}
              onChange={u => onChange({ billing: 'Custom', billing_every: every, billing_unit: u })} />
          </div>
        </>
      )}
    </>
  )
}
