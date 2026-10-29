import BottomNav from '@/components/nav/BottomNav'
import { ToastContainer } from '@/components/ui/ToastContainer'
import { ProfileDrawer } from '@/components/profile/ProfileDrawer'
import { GreetingOverlay } from '@/components/home/GreetingOverlay'
import { AuthWatcher } from '@/components/auth/AuthWatcher'
import { ScreenKeepAlive } from '@/components/nav/ScreenKeepAlive'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-bg-base">
      <AuthWatcher />
      <ToastContainer />
      <ProfileDrawer />
      <GreetingOverlay />
      {/* Clears the floating tab bar: 62px capsule + 10px gap + safe area */}
      <main className="flex-1" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 84px)' }}>
        <ScreenKeepAlive />
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
