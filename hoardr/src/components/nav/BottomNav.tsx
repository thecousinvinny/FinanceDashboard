'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutGrid, ArrowLeftRight, Sparkles, Palette, CreditCard, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/home',     label: 'Home',     Icon: LayoutGrid     },
  { href: '/money',    label: 'Money',    Icon: ArrowLeftRight },
  { href: '/plans',    label: 'Plans',    Icon: Sparkles       },
  { href: '/studio',   label: 'Studio',   Icon: Palette        },
  { href: '/wallet',   label: 'Wallet',   Icon: CreditCard     },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays   },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 h-[72px] z-50 flex items-stretch justify-around px-2"
      style={{
        background:           'rgba(8,8,16,0.88)',
        backdropFilter:       'blur(32px) saturate(200%)',
        WebkitBackdropFilter: 'blur(32px) saturate(200%)',
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
              'flex flex-col items-center justify-center gap-[3px] flex-1 min-w-0 transition-colors duration-200 select-none',
              active ? 'text-gold' : 'text-ink-faint',
            )}
          >
            <span
              className={cn(
                'relative flex items-center justify-center w-8 h-7 rounded-full transition-all duration-200',
                active
                  ? 'drop-shadow-[0_0_8px_rgba(232,196,107,0.7)]'
                  : '',
              )}
              style={active ? {
                background: 'linear-gradient(135deg, rgba(246,223,158,0.18), rgba(232,196,107,0.12), rgba(164,127,35,0.08))',
              } : undefined}
            >
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
