import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { localToday, daysUntilLabel, $fk, $fc } from '@/lib/utils'
import { RefreshCw } from 'lucide-react'
import { CategoryIcon } from '@/components/ui/CategoryIcon'

export const dynamic = 'force-dynamic'

function billingShort(billing: string) {
  switch (billing) {
    case 'Annual':    return '/ yr'
    case 'Weekly':    return '/ wk'
    case 'BiWeekly':  return '/ 2wk'
    case 'Quarterly': return '/ qtr'
    default:          return '/ mo'
  }
}

export default async function HomePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // ── Date helpers ────────────────────────────────────────────────────────
  const todayStr   = localToday()
  const [y, m]     = todayStr.split('-')
  const monthStart = `${y}-${m}-01`
  const monthEnd   = `${y}-${m}-${new Date(Number(y), Number(m), 0).getDate()}`

  // 6-month lookback for sparkline
  const sixMonthsAgo = (() => {
    const d = new Date(Number(y), Number(m) - 1 - 5, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
  })()

  // ── Parallel queries ────────────────────────────────────────────────────
  const [
    { data: profile },
    { data: monthExp },
    { data: monthInc },
    { data: activeSubs },
    { data: upcoming },
    { count: wishlistCount },
    { data: recentExp },
    { data: recentInc },
    { data: sparkExp },
    { data: sparkInc },
  ] = await Promise.all([
    supabase.from('profiles').select('display_name').eq('id', user.id).single(),
    supabase.from('expenses').select('cost').gte('date', monthStart).lte('date', monthEnd),
    supabase.from('income').select('amount').gte('date', monthStart).lte('date', monthEnd),
    supabase.from('subscriptions').select('monthly_cost').eq('status', 'Active'),
    supabase.from('subscriptions')
      .select('id, name, cost, next_renewal, billing')
      .eq('status', 'Active')
      .gte('next_renewal', todayStr)
      .order('next_renewal', { ascending: true })
      .limit(3),
    supabase.from('wishlist').select('*', { count: 'exact', head: true }).eq('status', 'Interested'),
    supabase.from('expenses').select('id, name, cost, date, categories(name)').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    supabase.from('income').select('id, name, amount, date, source').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(5),
    supabase.from('expenses').select('cost, date').gte('date', sixMonthsAgo),
    supabase.from('income').select('amount, date').gte('date', sixMonthsAgo),
  ])

  // ── Sparkline: net (income − expenses) per month, last 6 months ────────
  const sparkPoints = (() => {
    const months: { key: string; label: string; net: number }[] = []
    for (let i = 5; i >= 0; i--) {
      const d   = new Date(Number(y), Number(m) - 1 - i, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const inc = (sparkInc ?? []).filter(r => String(r.date).startsWith(key)).reduce((s, r) => s + Number(r.amount), 0)
      const exp = (sparkExp ?? []).filter(r => String(r.date).startsWith(key)).reduce((s, r) => s + Number(r.cost),   0)
      months.push({ key, label: d.toLocaleString('en-US', { month: 'short' }), net: inc - exp })
    }
    const vals   = months.map(m => m.net)
    const minVal = Math.min(...vals, 0)
    const maxVal = Math.max(...vals, 1)
    const range  = maxVal - minVal || 1
    const H = 64, W = 300
    const pts = months.map((m, i) => ({
      x: (i / (months.length - 1)) * W,
      y: H - ((m.net - minVal) / range) * (H - 8) - 4,
    }))
    const d = pts.map((p, i) => {
      if (i === 0) return `M${p.x},${p.y}`
      const prev = pts[i - 1]
      const cx = (prev.x + p.x) / 2
      return `C${cx},${prev.y} ${cx},${p.y} ${p.x},${p.y}`
    }).join(' ')
    const area = `${d} L${W},${H} L0,${H} Z`
    const last  = pts[pts.length - 1]
    const allPositive = vals.every(v => v >= 0)
    const color = allPositive ? '#4ADE80' : '#E8C46B'
    const zeroY = minVal < 0 ? H - ((0 - minVal) / range) * (H - 8) - 4 : null
    return { d, area, last, color, months, zeroY }
  })()

  // ── Self-heal: backfill profile if missing ──────────────────────────────
  if (!profile?.display_name) {
    const meta = user.user_metadata as Record<string, string> | undefined
    const name = meta?.full_name ?? meta?.name ?? user.email ?? null
    await supabase.from('profiles').upsert({ id: user.id, display_name: name })
  }

  // ── Computed stats ──────────────────────────────────────────────────────
  const spent  = monthExp?.reduce((s, e) => s + Number(e.cost), 0)   ?? 0
  const earned = monthInc?.reduce((s, i) => s + Number(i.amount), 0) ?? 0
  const saved  = earned - spent
  const monthlySubs = activeSubs?.reduce((s, r) => s + Number(r.monthly_cost ?? 0), 0) ?? 0
  const hasData     = spent > 0 || earned > 0
  const netPositive = saved >= 0

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
      <div className="px-5 pt-14 pb-0">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">
          Welcome back
        </p>
        <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">{firstName}</h1>
      </div>

      {/* ── Monthly hero card ─────────────────────────────────────────────── */}
      <div className="mx-4 mt-5 bg-bg-surface border border-white/[0.06] rounded-card p-5">
        <div className="flex items-start justify-between mb-3">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint">
            This Month
          </p>
          {hasData && (
            <span className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
              netPositive ? 'text-emerald bg-emerald/10' : 'text-ruby bg-ruby/10'
            }`}>
              {netPositive ? '↑' : '↓'} {netPositive ? '+' : '−'}{$fk(Math.abs(saved))} net
            </span>
          )}
        </div>

        <div className="flex items-start mb-5">
          <span className="font-mono text-[22px] font-light text-ink-muted mt-[7px] mr-0.5">$</span>
          <span className={`font-mono text-[52px] font-light leading-none tracking-[-0.04em] text-ink ${netPositive ? 'glow-green' : 'glow-ruby'}`}>
            {Math.floor(earned).toLocaleString('en-US')}
            <span className="text-[32px] text-ink-muted">
              .{String(Math.round((earned % 1) * 100)).padStart(2, '0')}
            </span>
          </span>
        </div>

        {/* Sparkline — 6-month net (income − expenses) */}
        <div className="mb-1">
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint">6-mo net</p>
            <p className={`text-[12px] font-semibold font-mono ${sparkPoints.color === '#4ADE80' ? 'text-emerald' : 'text-gold'}`}>
              {sparkPoints.months[5].net >= 0 ? '+' : '−'}{$fk(Math.abs(sparkPoints.months[5].net))} this month
            </p>
          </div>
          <div className="h-16 w-full">
            <svg viewBox="0 0 300 64" className="w-full h-full" preserveAspectRatio="none">
              <defs>
                <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={sparkPoints.color} stopOpacity="0.3"/>
                  <stop offset="100%" stopColor={sparkPoints.color} stopOpacity="0"/>
                </linearGradient>
              </defs>
              {sparkPoints.zeroY !== null && (
                <line x1="0" y1={sparkPoints.zeroY} x2="300" y2={sparkPoints.zeroY}
                  stroke="rgba(255,255,255,0.12)" strokeWidth="1" strokeDasharray="4,4"/>
              )}
              <path d={sparkPoints.area} fill="url(#sg)"/>
              <path d={sparkPoints.d} fill="none" stroke={sparkPoints.color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <circle cx={sparkPoints.last.x} cy={sparkPoints.last.y} r="3" fill={sparkPoints.color}/>
            </svg>
          </div>
          <div className="flex justify-between mt-1">
            {sparkPoints.months.map(mo => (
              <span key={mo.key} className="text-[9px] text-ink-faint font-medium">{mo.label}</span>
            ))}
          </div>
        </div>

        <div className="flex border-t border-white/[0.06] pt-4 -mx-1">
          {[
            { label: 'Income', value: $fk(earned),           color: 'text-emerald' },
            { label: 'Spent',  value: $fk(spent),            color: 'text-ruby'    },
            { label: 'Saved',  value: $fk(Math.abs(saved)),  color: netPositive ? 'text-ink' : 'text-ruby' },
          ].map(({ label, value, color }) => (
            <div key={label} className="flex-1 px-1">
              <p className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint mb-1">{label}</p>
              <p className={`text-[16px] font-semibold font-mono tracking-tight ${color}`}>{value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Quick tiles ───────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 mx-4 mt-3">
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex flex-col gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-gold/10 flex items-center justify-center text-gold text-sm">↻</div>
          <div>
            <p className="text-[22px] font-bold font-mono tracking-tight text-ink">{$fc(monthlySubs)}</p>
            <p className="text-[11px] text-ink-muted mt-0.5">Monthly Subs</p>
          </div>
        </div>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card p-4 flex flex-col gap-3">
          <div className="w-8 h-8 rounded-[10px] bg-emerald/10 flex items-center justify-center text-emerald text-sm">✦</div>
          <div>
            <p className="text-[22px] font-bold tracking-tight text-ink">
              {wishlistCount ?? 0} {wishlistCount === 1 ? 'item' : 'items'}
            </p>
            <p className="text-[11px] text-ink-muted mt-0.5">Wishlist</p>
          </div>
        </div>
      </div>

      {/* ── Upcoming bills ────────────────────────────────────────────────── */}
      {(upcoming?.length ?? 0) > 0 && (
        <div className="mx-4 mt-6">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Upcoming</p>
          <div className="space-y-2.5">
            {upcoming!.map(sub => (
              <div key={sub.id} className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface border border-white/[0.06] rounded-[18px]">
                <div className="w-10 h-10 rounded-[12px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <RefreshCw size={15} className="text-gold" strokeWidth={1.75} />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-[14px] font-medium text-ink">{sub.name}</p>
                  <p className="text-[11px] text-ink-muted">{daysUntilLabel(sub.next_renewal)}</p>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-[15px] font-semibold font-mono text-ink">{$fc(Number(sub.cost))}</p>
                  <p className="text-[10px] text-ink-faint">{billingShort(sub.billing)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

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
