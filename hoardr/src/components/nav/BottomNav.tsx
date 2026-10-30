'use client'

import Link from 'next/link'
import { Coins, TrendingDown, TrendingUp, CalendarDays } from 'lucide-react'
import { useActivePath, navigateTab } from '@/lib/tab-nav'
import { haptic } from '@/lib/utils'
import { cn } from '@/lib/utils'

const tabs = [
  { href: '/home',     label: 'Hoard',    Icon: Coins        },
  { href: '/money',    label: 'Out',      Icon: TrendingDown },
  { href: '/in',       label: 'In',       Icon: TrendingUp   },
  { href: '/calendar', label: 'Calendar', Icon: CalendarDays },
]

const N    = tabs.length
const PAD  = 6   // inner padding of the capsule
// Spring that settles quickly — the pill should feel attached to the finger
const SLIDE = 'transform 420ms cubic-bezier(0.32, 0.72, 0, 1)'

/**
 * Floating frosted-glass tab bar (iOS-style capsule). Content scrolls
 * underneath and shows through the blur. A glass pill slides behind the
 * active tab. Height + bottom offset are mirrored by the layout's bottom
 * padding (`--tabbar-space`).
 */
export default function BottomNav() {
  // Optimistic: highlights (and the keep-alive screen) switch on tap, not on route commit
  const pathname  = useActivePath()
  const activeIdx = tabs.findIndex(t => pathname === t.href || pathname.startsWith(t.href + '/'))

  return (
    <nav
      className="frost fixed z-50 left-1/2 flex items-stretch"
      style={{
        bottom:       'calc(env(safe-area-inset-bottom, 0px) + 10px)',
        width:        'min(calc(100% - 24px), 420px)',
        height:       62,
        padding:      PAD,
        borderRadius: 26,
        transform:    'translateX(-50%)',
        // Own layer in tab transitions: stays still while the screens slide
        viewTransitionName: 'tabbar',
      }}
    >
      {/* Sliding glass pill behind the active tab */}
      {activeIdx >= 0 && (
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={{
            top: PAD, bottom: PAD, left: PAD,
            width:        `calc((100% - ${PAD * 2}px) / ${N})`,
            borderRadius: 20,
            background:   'rgb(var(--rgb-ink) / 0.08)',
            boxShadow:    'inset 0 0.5px 0 var(--glass-hi), 0 0 0 0.5px rgb(var(--rgb-ink) / 0.05)',
            transform:    `translateX(${activeIdx * 100}%)`,
            transition:   SLIDE,
            willChange:   'transform',
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
            onClick={() => { if (!active) { haptic('tap'); navigateTab(href) } }}
            className={cn(
              'relative flex flex-col items-center justify-center gap-[3px] flex-1 min-w-0 select-none transition-colors duration-200',
              active ? 'text-gold' : 'text-ink-muted',
            )}
            style={{ WebkitTapHighlightColor: 'transparent' }}
          >
            <span style={{
              display:    'block',
              transform:  active ? 'scale(1.06)' : 'scale(1)',
              transition: 'transform 300ms cubic-bezier(0.34,1.56,0.64,1)',
            }}>
              <Icon size={21} strokeWidth={active ? 2.1 : 1.7} />
            </span>
            <span className={cn('text-[10px] leading-none tracking-[0.01em]', active ? 'font-semibold' : 'font-medium')}>
              {label}
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
