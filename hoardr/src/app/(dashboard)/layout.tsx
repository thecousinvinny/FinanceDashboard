import BottomNav from '@/components/nav/BottomNav'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ProfileDrawer } from '@/components/profile/ProfileDrawer'
import { GreetingOverlay } from '@/components/home/GreetingOverlay'
import type { GreetingInitialData } from '@/components/home/GreetingOverlay'
import { createClient } from '@/lib/supabase/server'
import { localToday } from '@/lib/utils'

async function fetchGreetingData(): Promise<GreetingInitialData | null> {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null

    const today = localToday()
    const monthStart = `${today.slice(0, 7)}-01`
    const chartStart = (() => {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() - 13)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    })()
    const chart14Days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(today + 'T12:00:00')
      d.setDate(d.getDate() - 13 + i)
      return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
    })

    const [
      { data: incData },
      { data: expData },
      { data: chartExpData },
      { data: chartIncData },
      { data: activeSubsData },
      { data: profile },
    ] = await Promise.all([
      supabase.from('income').select('amount').gte('date', monthStart).lte('date', today),
      supabase.from('expenses').select('cost, savings, name').gte('date', monthStart).lte('date', today),
      supabase.from('expenses').select('cost, date, name').gte('date', chartStart).lte('date', today),
      supabase.from('income').select('amount, date').gte('date', chartStart).lte('date', today),
      supabase.from('subscriptions').select('name').eq('status', 'Active'),
      supabase.from('profiles').select('display_name, avatar_url').eq('id', user.id).single(),
    ])

    const subNameSet = new Set((activeSubsData ?? []).map(s => String(s.name).toLowerCase()))

    type ExpRow = { cost: unknown; savings: unknown; name: unknown }
    const expArr = (expData ?? []) as ExpRow[]

    const income = (incData ?? []).reduce((s, r) => s + Number(r.amount), 0)
    const subs   = expArr.reduce((s, r) => subNameSet.has(String(r.name ?? '').toLowerCase()) ? s + Number(r.cost) : s, 0)
    const spent  = expArr.reduce((s, r) => subNameSet.has(String(r.name ?? '').toLowerCase()) ? s : s + Number(r.cost), 0)
    const saved  = expArr.reduce((s, r) => s + Number(r.savings ?? 0), 0)

    type ChartExpRow = { cost: unknown; date: unknown; name: unknown }
    const chartExpArr = (chartExpData ?? []) as ChartExpRow[]
    const dailyExp: Record<string, number> = {}
    const dailyInc: Record<string, number> = {}
    const dailySub: Record<string, number> = {}
    for (const e of chartExpArr) {
      const k = String(e.date)
      if (subNameSet.has(String(e.name ?? '').toLowerCase())) {
        dailySub[k] = (dailySub[k] ?? 0) + Number(e.cost)
      } else {
        dailyExp[k] = (dailyExp[k] ?? 0) + Number(e.cost)
      }
    }
    for (const i of chartIncData ?? []) {
      const k = String(i.date)
      dailyInc[k] = (dailyInc[k] ?? 0) + Number(i.amount)
    }

    const sparkPoints = chart14Days.map(d => ({
      day:   String(Number(d.split('-')[2])),
      label: new Date(d + 'T12:00:00').toLocaleString('en-US', { month: 'short', day: 'numeric' }),
      exp:   dailyExp[d] ?? 0,
      inc:   dailyInc[d] ?? 0,
      sub:   dailySub[d] ?? 0,
    }))

    const fullName = (profile?.display_name as string | null)
      ?? (user.user_metadata?.full_name as string | null)
      ?? ''
    const name = fullName.split(' ')[0]

    let avatarUrl: string | null = null
    if (profile?.avatar_url) {
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(profile.avatar_url as string)
      avatarUrl = `${publicUrl}?t=${Date.now()}`
    } else {
      avatarUrl = (user.user_metadata?.avatar_url as string | null) ?? null
    }

    return { name, avatarUrl, stats: { income, spent, subs, saved }, sparkPoints }
  } catch (err) {
    console.error('[layout] greeting data fetch failed:', err)
    return null
  }
}

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const greetingData = await fetchGreetingData()

  return (
    <div className="flex flex-col min-h-screen bg-bg-base">
      <ToastContainer />
      <ProfileDrawer />
      <GreetingOverlay initialData={greetingData} />
      <main className="flex-1 pb-[72px]">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
