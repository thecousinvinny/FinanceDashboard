'use client'

import { useState } from 'react'
import { RefreshCw, CheckCircle, XCircle } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { daysUntilLabel, $fc, localToday, nextRenewalDate } from '@/lib/utils'
import type { BillingCycle } from '@/types'

export interface UpcomingSub {
  id:           string
  name:         string
  cost:         number
  next_renewal: string | null
  billing:      BillingCycle
  category:     string | null
  card_id:      string | null
}

function billingShort(b: BillingCycle) {
  switch (b) {
    case 'Annual':    return '/ yr'
    case 'Weekly':    return '/ wk'
    case 'BiWeekly':  return '/ 2wk'
    case 'Quarterly': return '/ qtr'
    default:          return '/ mo'
  }
}

export function UpcomingBills({ initial }: { initial: UpcomingSub[] }) {
  const [items, setItems] = useState<UpcomingSub[]>(initial)

  async function handlePay(id: string) {
    const sub = items.find(s => s.id === id)
    if (!sub) return

    const today      = localToday()
    const newRenewal = nextRenewalDate(sub.next_renewal ?? today, sub.billing)
    setItems(prev => prev.map(s => s.id === id ? { ...s, next_renewal: newRenewal } : s))

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const categoryName = sub.category ?? 'Subscriptions'
    const { data: existingCat } = await supabase
      .from('categories').select('id').eq('user_id', user.id).eq('name', categoryName).maybeSingle()
    let categoryId: string | null = existingCat?.id ?? null
    if (!categoryId) {
      const { data: created } = await supabase
        .from('categories').insert({ user_id: user.id, name: categoryName }).select('id').single()
      categoryId = created?.id ?? null
    }

    await Promise.all([
      supabase.from('expenses').insert({
        user_id: user.id, name: sub.name, cost: sub.cost,
        date: today, category_id: categoryId, card_id: sub.card_id,
      }),
      supabase.from('subscriptions').update({ next_renewal: newRenewal }).eq('id', id),
    ])
  }

  async function handleCancel(id: string) {
    setItems(prev => prev.filter(s => s.id !== id))
    const supabase = createClient()
    await supabase.from('subscriptions').update({ status: 'Cancelled' }).eq('id', id)
  }

  if (items.length === 0) return null

  return (
    <div className="mx-4 mt-6">
      <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Upcoming</p>
      <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
        {items.map(sub => {
          const Icon = sub.category ? getCategoryIcon(sub.category, 'Expense') : RefreshCw
          return (
            <SwipeToDelete
              key={sub.id}
              onDelete={() => handleCancel(sub.id)}
              actionLabel={<XCircle size={18} strokeWidth={1.5} />}
              actionBg="bg-ruby"
              onRight={() => handlePay(sub.id)}
              rightLabel={<CheckCircle size={18} strokeWidth={1.5} />}
              rightBg="bg-emerald-600"
            >
              <div className="flex items-center gap-3 px-4 py-3.5">
                <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <Icon size={15} strokeWidth={1.75} className="text-gold" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink">{sub.name}</p>
                  <p className="text-[11px] text-ink-muted">{daysUntilLabel(sub.next_renewal)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-semibold font-mono text-ink">{$fc(sub.cost)}</p>
                  <p className="text-[10px] text-ink-faint">{billingShort(sub.billing)}</p>
                </div>
              </div>
            </SwipeToDelete>
          )
        })}
      </div>
    </div>
  )
}
