'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Coins, TrendingDown, TrendingUp, Palette, CalendarDays } from 'lucide-react'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/home',     label: 'Hoard',    Icon: Coins        },
  { href: '/money',    label: 'Out',      Icon: TrendingDown },
  { href: '/in',       label: 'In',       Icon: TrendingUp   },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
  { href: '/studio',   label: 'Studio',   Icon: Palette      },
]

const N       = tabs.length
// nav has px-2 (8px each side = 16px total). Each tab is (100% - 16px) / N wide.
// Bar inset within each tab: 12px each side (Tailwind inset-x-3).
// bar left  = 8px nav-pad + activeIdx * tabWidth + 12px inset
//           = 20px + activeIdx * (100% - 16px) / N
// bar width = tabWidth - 24px
//           = (100% - 16px) / N - 24px
const BAR_W = `calc((100% - 16px) / ${N} - 24px)`
const barL  = (i: number) => `calc(20px + ${i} * (100% - 16px) / ${N})`

export default function BottomNav() {
  const pathname  = usePathname()
  const activeIdx = tabs.findIndex(t => pathname === t.href || pathname.startsWith(t.href + '/'))

  return (
    <nav
      className="fixed bottom-0 inset-x-0 h-[72px] z-50 flex items-stretch justify-around px-2"
      style={{
        background:           'var(--nav-bg)',
        backdropFilter:       'blur(32px) saturate(180%)',
        WebkitBackdropFilter: 'blur(32px) saturate(180%)',
      }}
    >
      {/* Subtle separator line */}
      <div
        aria-hidden
        className="absolute top-0 inset-x-[8%] h-px pointer-events-none"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.18) 70%, transparent)',
        }}
      />

      {/* Single sliding gold bar */}
      {activeIdx >= 0 && (
        <div
          aria-hidden
          className="absolute top-0 h-[2px] rounded-full bg-gold pointer-events-none"
          style={{
            width:      BAR_W,
            left:       barL(activeIdx),
            transition: 'left 340ms cubic-bezier(0.34,1.56,0.64,1)',
          }}
        />
      )}

      {tabs.map(({ href, label, Icon }) => {
        const active = pathname === href || pathname.startsWith(href + '/')
        return (
          <Link
            key={href}
            href={href}
            replace
            className={cn(
              'flex flex-col items-center justify-center gap-[3px] flex-1 min-w-0 transition-colors duration-200 select-none',
              active ? 'text-gold' : 'text-ink-faint',
            )}
          >
            <span style={{
              display:    'block',
              transform:  active ? 'scale(1.12)' : 'scale(1)',
              transition: 'transform 340ms cubic-bezier(0.34,1.56,0.64,1)',
            }}>
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
