import { cn } from '@/lib/utils'
import type { CommissionStatus, ExpenseStatus, SubStatus, WishlistStatus } from '@/types'

type AnyStatus = CommissionStatus | ExpenseStatus | SubStatus | WishlistStatus | string

const STYLE: Record<string, string> = {
  // Commission
  Pending:       'bg-gold/10    text-gold',
  Approved:      'bg-emerald/10 text-emerald',
  'In Progress': 'bg-blue-400/10 text-blue-400',
  Completed:     'bg-purple-400/10 text-purple-400',
  Paid:          'bg-emerald/10 text-emerald',
  // Subscription / expense
  Active:        'bg-emerald/10 text-emerald',
  Cancelled:     'bg-white/[0.06] text-ink-faint',
  Ordered:       'bg-gold/10    text-gold',
  Procured:      'bg-emerald/10 text-emerald',
  // Wishlist
  Interested:    'bg-blue-400/10 text-blue-400',
  Purchased:     'bg-emerald/10 text-emerald',
}

export function Badge({ status, className }: { status: AnyStatus; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold tracking-wide whitespace-nowrap',
        STYLE[status] ?? 'bg-white/[0.06] text-ink-muted',
        className,
      )}
    >
      {status}
    </span>
  )
}
