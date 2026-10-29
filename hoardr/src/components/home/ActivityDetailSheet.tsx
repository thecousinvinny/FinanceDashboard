'use client'

import { useEffect, useMemo, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow } from '@/components/ui/Form'
import { $fd, fmtDate } from '@/lib/utils'

/** Read-only details for a Recent Activity row on Home. */
export interface ActivityRef {
  id:       string
  isIncome: boolean
  isSub:    boolean
  name:     string
  amount:   number      // signed, as shown in the list
  date:     string
  category: string
}

interface Detail {
  note:     string | null
  account:  string | null      // card (expense) or bank (income)
  original: number | null
  savings:  number
}

export function ActivityDetailSheet({ item, onClose }: { item: ActivityRef | null; onClose: () => void }) {
  const supabase = useMemo(() => createClient(), [])
  const [detail, setDetail] = useState<Detail | null>(null)
  // Keep the last item rendered while the sheet animates closed
  const [shown, setShown] = useState<ActivityRef | null>(item)
  useEffect(() => { if (item) setShown(item) }, [item])

  useEffect(() => {
    if (!item) return
    let live = true
    setDetail(null)
    ;(async () => {
      if (item.isIncome) {
        const { data } = await supabase.from('income').select('banks(name)').eq('id', item.id).maybeSingle()
        if (!live) return
        setDetail({ note: null, account: (data?.banks as { name?: string } | null)?.name ?? null, original: null, savings: 0 })
      } else {
        const { data } = await supabase.from('expenses')
          .select('description, original_cost, savings, cards(name, last4)')
          .eq('id', item.id).maybeSingle()
        if (!live) return
        const card = data?.cards as { name?: string; last4?: string | null } | null
        setDetail({
          note:     (data?.description as string | null) ?? null,
          account:  card?.name ? `${card.name}${card.last4 ? ` ••••${card.last4}` : ''}` : null,
          original: data?.original_cost != null ? Number(data.original_cost) : null,
          savings:  Number(data?.savings ?? 0),
        })
      }
    })()
    return () => { live = false }
  }, [item, supabase])

  const it = shown
  return (
    <Sheet open={!!item} onClose={onClose} title={it?.isIncome ? 'Income' : it?.isSub ? 'Subscription Payment' : 'Expense'} cancelLabel="Done">
      {it && (
        <>
          <div className="flex flex-col items-center pt-5 pb-2 text-center">
            <div className="w-14 h-14 rounded-[16px] bg-bg-overlay ring-1 ring-ink/[0.06] flex items-center justify-center mb-3">
              <CategoryIcon
                category={it.category}
                type={it.isIncome ? 'Income' : 'Expense'}
                isSub={it.isSub}
                size={24}
                className={it.isIncome ? 'text-emerald' : it.isSub ? 'text-ink/60' : 'text-gold'}
              />
            </div>
            <p className={`text-[40px] font-semibold tracking-[-0.03em] tabular-nums leading-none ${it.isIncome ? 'text-emerald' : 'text-ink'}`}>
              {it.isIncome ? '+' : '−'}{$fd(Math.abs(it.amount))}
            </p>
            <p className="mt-2 text-[17px] font-medium text-ink truncate max-w-full">{it.name}</p>
            <p className="text-[13px] text-ink-muted">{fmtDate(it.date)}</p>
          </div>

          <FormGroup>
            <FormRow label="Category">{it.category}</FormRow>
            <FormRow label={it.isIncome ? 'Deposited to' : 'Card'}>
              {detail ? (detail.account ?? 'None') : <span className="inline-block h-3 w-20 rounded bg-ink/[0.08]" />}
            </FormRow>
            {detail?.note && <FormRow label="Note"><span className="truncate">{detail.note}</span></FormRow>}
          </FormGroup>

          {!it.isIncome && detail && detail.original != null && detail.savings > 0 && (
            <FormGroup>
              <FormRow label="Original price"><span className="tabular-nums">{$fd(detail.original)}</span></FormRow>
              <FormRow label="You saved"><span className="text-emerald tabular-nums">{$fd(detail.savings)}</span></FormRow>
            </FormGroup>
          )}
        </>
      )}
    </Sheet>
  )
}
