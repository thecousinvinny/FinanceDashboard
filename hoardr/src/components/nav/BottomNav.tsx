'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Coins, ArrowLeftRight, Sparkles, Palette, SlidersHorizontal, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/home',     label: 'Hoard',    Icon: Coins             },
  { href: '/money',    label: 'Money',    Icon: ArrowLeftRight    },
  { href: '/plans',    label: 'Plans',    Icon: Sparkles          },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays      },
  { href: '/studio',   label: 'Studio',   Icon: Palette           },
  { href: '/settings', label: 'Settings', Icon: SlidersHorizontal },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 h-[72px] z-50 flex items-stretch justify-around px-2"
      style={{
        background:           'var(--nav-bg)',
        backdropFilter:       'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      }}
    >
      <div
        aria-hidden
        className="absolute top-0 inset-x-[8%] h-px pointer-events-none"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.18) 70%, transparent)',
        }}
      />

      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              'relative flex flex-col items-center justify-center gap-[3px] flex-1 min-w-0 transition-colors duration-200 select-none',
              active ? 'text-gold' : 'text-ink-faint',
            )}
          >
            {/* Gold bar at top of tab */}
            <span className={cn(
              'absolute top-0 inset-x-3 h-[2px] rounded-full transition-all duration-200',
              active ? 'bg-gold opacity-100' : 'opacity-0',
            )} />
            <span className="transition-colors duration-200">
              <Icon size={22} strokeWidth={active ? 2 : 1.5} />
            </span>
            <span className="text-[9px] font-medium tracking-[0.07em] uppercase leading-none">
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
