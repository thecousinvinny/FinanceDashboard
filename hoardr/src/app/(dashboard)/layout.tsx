import BottomNav from '@/components/nav/BottomNav'
import { ToastContainer } from '@/components/ui/ToastContainer'

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col min-h-screen bg-bg-base">
      <ToastContainer />
      <main className="flex-1 pb-[72px]">
        {children}
      </main>
      <BottomNav />
    </div>
  )
}
