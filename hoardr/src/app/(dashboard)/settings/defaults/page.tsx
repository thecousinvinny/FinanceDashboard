'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, CreditCard, LayoutGrid, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { getAppPrefs, setAppPrefs } from '@/lib/app-prefs'
import { reportDbError } from '@/lib/db-error'
import { expenseCategories } from '@/lib/data/transactions'
import { Select } from '@/components/ui/Select'
import { FormGroup, FormRow } from '@/components/ui/Form'
import type { BillingCycle } from '@/types'

interface SettingsCard { id: string; name: string; last4: string | null; is_default: boolean | null }
interface SettingsBank { id: string; name: string }

const BILLING_OPTIONS: BillingCycle[] = ['Weekly', 'BiWeekly', 'Monthly', 'Quarterly', 'Annual']
const BILLING_LABELS: Record<BillingCycle, string> = {
  Weekly: 'Weekly', BiWeekly: 'Bi-Weekly', Monthly: 'Monthly', Quarterly: 'Quarterly', Annual: 'Annual', Custom: 'Custom',
}

/** Settings → Form defaults: what new expenses, subscriptions and income start with. */
export default function DefaultsPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [cards, setCards] = useState<SettingsCard[]>([])
  const [banks, setBanks] = useState<SettingsBank[]>([])
  const [cardId,  setCardId]  = useState<string | null>(null)
  const [bankId,  setBankId]  = useState<string | null>(null)
  const [expCat,  setExpCat]  = useState<string | null>(null)
  const [billing, setBilling] = useState<BillingCycle>('Monthly')

  useEffect(() => {
    const p = getAppPrefs()
    setBankId(p.defaultBankId)
    setExpCat(p.defaultExpCat)
    setBilling((p.defaultBilling as BillingCycle) ?? 'Monthly')
    supabase.from('cards').select('id, name, last4, is_default')
      .order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      .then(({ data }) => {
        const list = (data ?? []) as SettingsCard[]
        setCards(list)
        setCardId(list.find(c => c.is_default)?.id ?? null)
      })
    supabase.from('banks').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => setBanks((data ?? []) as SettingsBank[]))
  }, [supabase])

  async function pickCard(id: string | null) {
    const prev = cardId
    setCardId(id)
    const { data } = await supabase.auth.getSession()
    const uid = data.session?.user.id
    if (!uid) return
    const { error } = await supabase.from('cards').update({ is_default: false }).eq('user_id', uid)
    const { error: e2 } = id ? await supabase.from('cards').update({ is_default: true }).eq('id', id) : { error: null }
    if (reportDbError(error ?? e2, 'save default card')) setCardId(prev)
  }

  function pickBank(id: string | null) {
    setBankId(id)
    setAppPrefs({ defaultBankId: id, defaultBankName: banks.find(b => b.id === id)?.name ?? null })
  }

  const card = cards.find(c => c.id === cardId)
  const bank = banks.find(b => b.id === bankId)

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      <div className="mx-auto w-full max-w-[640px] px-4 md:px-6">

        <div className="flex items-center gap-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
          <button
            onClick={() => router.back()}
            aria-label="Back"
            className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:scale-95 transition-transform"
          >
            <ArrowLeft size={18} strokeWidth={2} />
          </button>
          <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">Form defaults</h1>
        </div>

        <FormGroup header="Expenses">
          <Select
            value={cardId ?? ''} onChange={e => pickCard(e.target.value || null)}
            aria-label="Default card" className="w-full text-left"
            trigger={
              <FormRow icon={CreditCard} iconColor="#5E5CE6" label="Card" chevron>
                <span className="truncate">{card ? `${card.name}${card.last4 ? ` •${card.last4}` : ''}` : 'None'}</span>
              </FormRow>
            }
          >
            <option value="">None</option>
            {cards.map(c => <option key={c.id} value={c.id}>{c.name}{c.last4 ? ` ••••${c.last4}` : ''}</option>)}
          </Select>
          <Select
            value={expCat ?? ''}
            onChange={e => { const v = e.target.value || null; setExpCat(v); setAppPrefs({ defaultExpCat: v }) }}
            aria-label="Default category" className="w-full text-left"
            trigger={
              <FormRow icon={LayoutGrid} iconColor="#FF9F0A" label="Category" chevron>
                <span className="truncate">{expCat ?? 'None'}</span>
              </FormRow>
            }
          >
            <option value="">None</option>
            {expenseCategories().map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </Select>
        </FormGroup>

        <FormGroup header="Subscriptions">
          <Select
            value={billing}
            onChange={e => { const v = e.target.value as BillingCycle; setBilling(v); setAppPrefs({ defaultBilling: v }) }}
            aria-label="Default billing" className="w-full text-left"
            trigger={
              <FormRow icon={CalendarDays} iconColor="#FF453A" label="Billing" chevron>
                <span>{BILLING_LABELS[billing]}</span>
              </FormRow>
            }
          >
            {BILLING_OPTIONS.map(o => <option key={o} value={o}>{BILLING_LABELS[o]}</option>)}
          </Select>
        </FormGroup>

        <FormGroup
          header="Income"
          footer="New forms start with these filled in. Changes apply on every device."
        >
          <Select
            value={bankId ?? ''} onChange={e => pickBank(e.target.value || null)}
            aria-label="Default bank" className="w-full text-left"
            trigger={
              <FormRow icon={Landmark} iconColor="#30B0C7" label="Bank" chevron>
                <span className="truncate">{bank?.name ?? 'None'}</span>
              </FormRow>
            }
          >
            <option value="">None</option>
            {banks.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>
        </FormGroup>
      </div>
    </div>
  )
}
