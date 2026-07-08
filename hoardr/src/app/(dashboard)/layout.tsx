import BottomNav from '@/components/nav/BottomNav'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ProfileDrawer } from '@/components/profile/ProfileDrawer'
import { GreetingOverlay } from '@/components/home/GreetingOverlay'
import { AuthWatcher } from '@/components/auth/AuthWatcher'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-bg-base">
      <AuthWatcher />
      <ToastContainer />
      <ProfileDrawer />
      <GreetingOverlay />
      <main className="flex-1 pb-[72px]">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
