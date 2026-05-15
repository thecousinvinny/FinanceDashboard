import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { localToday, $fk, $fc } from '@/lib/utils'
import Link from 'next/link'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import { HomeHero } from '@/components/home/HomeHero'
import { ThemeToggle, SignOutButton } from '@/components/ui/ThemeToggle'
import { UpcomingBills, type UpcomingSub } from '@/components/home/UpcomingBills'

export const dynamic = 'force-dynamic'


export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Date helpers ────────────────────────────────────────────────────────
  const todayStr   = localToday()
  const [y, m]     = todayStr.split('-')
  const monthStart = `${y}-${m}-01`
  const monthEnd   = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`

  // 6-month lookback for expense/income sparkline
  const sixMonthsAgo = (() => {
    const d = new Date(Number(y), Number(m) - 1 - 5, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()

  // 14-day window start for sub sparkline
  const fourteenDaysAgo = (() => {
    const todayDay = Number(todayStr.split('-')[2])
    const d = new Date(Number(y), Number(m) - 1, todayDay - 13)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  })()

  // ── Parallel queries ────────────────────────────────────────────────────
  const [
    { data: profile },
    { data: monthExp },
    { data: monthInc },
    { data: activeSubs },
    { data: upcoming },
    { data: wishlistItems },
    { data: recentExp },
    { data: recentInc },
    { data: sparkExp },
    { data: sparkInc },
    { data: sparkSubs },
  ] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('expenses').select('cost').gte('date', monthStart).lte('date', monthEnd),
    supabase.from('income').select('amount').gte('date', monthStart).lte('date', monthEnd),
    supabase.from('subscriptions').select('monthly_cost').eq('status', 'Active'),
    supabase.from('subscriptions')
      .select('id, name, cost, next_renewal, billing, category, card_id')
      .eq('status', 'Active')
      .gte('next_renewal', todayStr)
      .order('next_renewal', { ascending: true })
      .limit(3),
    supabase.from('wishlist').select('original_cost').eq('status', 'Interested'),
    supabase.from('expenses').select('id, name, cost, date, categories(name)').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    supabase.from('income').select('id, name, amount, date, source').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    supabase.from('expenses').select('cost, date').gte('date', sixMonthsAgo),
    supabase.from('income').select('amount, date').gte('date', sixMonthsAgo),
    supabase.from('subscriptions').select('cost, next_renewal').eq('status', 'Active').gte('next_renewal', fourteenDaysAgo).lte('next_renewal', todayStr),
  ])

  // ── 14-day chart data (daily, non-cumulative) ───────────────────────────
  const sparkPoints = (() => {
    const todayDay = Number(todayStr.split('-')[2])
    const days: string[] = []
    for (let i = 13; i >= 0; i--) {
      const d = new Date(Number(y), Number(m) - 1, todayDay - i)
      days.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`)
    }
    const expByDay = new Array(14).fill(0)
    const incByDay = new Array(14).fill(0)
    const subByDay = new Array(14).fill(0)
    for (const r of sparkExp ?? []) {
      const idx = days.indexOf(String(r.date))
      if (idx >= 0) expByDay[idx] += Number(r.cost)
    }
    for (const r of sparkInc ?? []) {
      const idx = days.indexOf(String(r.date))
      if (idx >= 0) incByDay[idx] += Number(r.amount)
    }
    for (const r of sparkSubs ?? []) {
      const idx = days.indexOf(String(r.next_renewal))
      if (idx >= 0) subByDay[idx] += Number(r.cost)
    }
    return days.map((dateStr, i) => ({
      day:   String(Number(dateStr.split('-')[2])),
      label: new Date(dateStr + 'T12:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }),
      exp:   expByDay[i],
      inc:   incByDay[i],
      sub:   subByDay[i],
    }))
  })()

  // ── Self-heal: backfill profile if missing ──────────────────────────────
  if (!profile?.display_name) {
    const meta = user.user_metadata as Record<string, string> | undefined
    const name = meta?.full_name ?? meta?.name ?? user.email ?? null
    await supabase.from('profiles').upsert({ id: user.id, display_name: name })
  }

  // ── Computed stats ──────────────────────────────────────────────────────
  const spentExpenses = monthExp?.reduce((s, e) => s + Number(e.cost), 0)               ?? 0
  const earned        = monthInc?.reduce((s, i) => s + Number(i.amount), 0)             ?? 0
  const monthlySubs   = activeSubs?.reduce((s, r) => s + Number(r.monthly_cost ?? 0), 0) ?? 0
  const spent         = spentExpenses + monthlySubs
  const saved         = earned - spent
  const wishlistTotal = wishlistItems?.reduce((s, w) => s + Number(w.original_cost ?? 0), 0) ?? 0
  const hasData      = spent > 0 || earned > 0
  const netPositive  = saved >= 0

  // ── Display name ────────────────────────────────────────────────────────
  const meta      = user.user_metadata as Record<string, string> | undefined
  const fullName  = profile?.display_name ?? meta?.full_name ?? meta?.name ?? user.email ?? 'there'
  const firstName = fullName.includes('@') ? fullName.split('@')[0] : fullName.split(' ')[0]

  // ── Recent activity ─────────────────────────────────────────────────────
  const activity = [
    ...(recentExp ?? []).map(e => ({
      id: e.id, name: e.name,
      amount: -Number(e.cost), date: e.date as string,
      category: (e.categories as unknown as { name: string } | null)?.name ?? 'Other',
      isIncome: false,
    })),
    ...(recentInc ?? []).map(i => ({
      id: i.id, name: i.name,
      amount: Number(i.amount), date: i.date as string,
      category: String(i.source ?? 'Other'),
      isIncome: true,
    })),
  ]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 3)

  return (
    <div className="min-h-screen bg-bg-base tab-enter">

      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="px-5 pt-14 pb-0 relative">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
          Welcome back
        </p>
        <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">{firstName}</h1>
        <div className="absolute top-14 right-5 flex items-center gap-2">
          <SignOutButton />
          <ThemeToggle />
        </div>
      </div>

      {/* ── Monthly hero card (animated) ──────────────────────────────────── */}
      <HomeHero
        spent={spent}
        saved={saved}
        netPositive={netPositive}
        hasData={hasData}
        points={sparkPoints}
      />

      {/* ── Quick tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-3">
        <Link href="/plans" className="block">
          <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex flex-col gap-3 active:scale-[0.97] transition-transform">
            <div className="w-8 h-8 rounded-[10px] bg-gold/10 flex items-center justify-center text-gold text-sm">↻</div>
            <div>
              <p className="text-[22px] font-bold font-mono tracking-tight text-ink">{$fc(monthlySubs)}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Monthly Subs</p>
            </div>
          </div>
        </Link>
        <Link href="/plans?tab=Wishlist" className="block">
          <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex flex-col gap-3 active:scale-[0.97] transition-transform">
            <div className="w-8 h-8 rounded-[10px] bg-emerald/10 flex items-center justify-center text-emerald text-sm">✦</div>
            <div>
              <p className="text-[22px] font-bold font-mono tracking-tight text-ink">{$fc(wishlistTotal)}</p>
              <p className="text-[11px] text-ink-muted mt-0.5">Wishlist</p>
            </div>
          </div>
        </Link>
      </div>

      {/* ── Upcoming bills ────────────────────────────────────────────────── */}
      <UpcomingBills initial={(upcoming ?? []).map(s => ({
        id:           String(s.id),
        name:         String(s.name),
        cost:         Number(s.cost),
        next_renewal: s.next_renewal ? String(s.next_renewal) : null,
        billing:      s.billing as UpcomingSub['billing'],
        category:     s.category ? String(s.category) : null,
        card_id:      (s as { card_id?: string | null }).card_id ? String((s as { card_id?: string | null }).card_id) : null,
      }))} />

      {/* ── Recent activity ───────────────────────────────────────────────── */}
      <div className="mx-4 mt-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Recent Activity</p>
        {activity.length > 0 ? (
          <div className="space-y-2.5">
            {activity.map(row => (
              <div key={row.id} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
                <div className="w-10 h-10 rounded-full bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <CategoryIcon
                    category={row.category}
                    type={row.isIncome ? 'Income' : 'Expense'}
                    size={15}
                    className={row.isIncome ? 'text-emerald' : 'text-gold'}
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink truncate">{row.name}</p>
                  <p className="text-[11px] text-ink-muted">{row.date}</p>
                </div>
                <p className={`text-[15px] font-semibold font-mono flex-shrink-0 ${row.amount > 0 ? 'text-emerald' : 'text-ink'}`}>
                  {row.amount > 0 ? '+' : '−'}{$fc(Math.abs(row.amount))}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-bg-surface border border-white/[0.06] rounded-card py-10 text-center text-ink-faint text-[13px]">
            No transactions yet — add your first one in Money.
          </div>
        )}
      </div>

      <div className="h-10" />
    </div>
  )
}
