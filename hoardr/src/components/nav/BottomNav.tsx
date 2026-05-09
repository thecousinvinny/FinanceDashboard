'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'

const tabs = [
  {
    href:  '/home',
    label: 'Home',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="3" width="7" height="7" rx="1.5"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5"/>
      </svg>
    ),
  },
  {
    href:  '/money',
    label: 'Money',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M7 16l-4-4 4-4"/>
        <path d="M3 12h11"/>
        <path d="M17 8l4 4-4 4"/>
        <path d="M21 12H10"/>
      </svg>
    ),
  },
  {
    href:  '/plans',
    label: 'Plans',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2l2.4 7.4H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.3 2.4-7.4L2 9.4h7.6L12 2z"/>
      </svg>
    ),
  },
  {
    href:  '/studio',
    label: 'Studio',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <circle cx="13.5" cy="6.5" r="2"/>
        <circle cx="6.5"  cy="7.5" r="2"/>
        <circle cx="17.5" cy="11" r="2"/>
        <circle cx="6"    cy="13" r="2"/>
        <path d="M12 20a8 8 0 100-16"/>
        <path d="M18 18l3 3-1.5-7.5L12 12l2 2-2 4z"/>
      </svg>
    ),
  },
  {
    href:  '/wallet',
    label: 'Wallet',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="2" y="5" width="20" height="14" rx="2.5"/>
        <path d="M2 10h20"/>
        <circle cx="17" cy="15.5" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
  {
    href:  '/calendar',
    label: 'Calendar',
    icon:  (active: boolean) => (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2 : 1.5} strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="18" rx="2"/>
        <path d="M16 2v4M8 2v4M3 10h18"/>
        <circle cx="8"  cy="15" r="1" fill="currentColor" stroke="none"/>
        <circle cx="12" cy="15" r="1" fill="currentColor" stroke="none"/>
        <circle cx="16" cy="15" r="1" fill="currentColor" stroke="none"/>
      </svg>
    ),
  },
]

export default function BottomNav() {
  const pathname = usePathname()

  return (
    <nav
      className="fixed bottom-0 inset-x-0 h-[72px] z-50 flex items-stretch justify-around px-2"
      style={{
        background:              'rgba(8,8,16,0.88)',
        backdropFilter:          'blur(32px) saturate(200%)',
        WebkitBackdropFilter:    'blur(32px) saturate(200%)',
      }}
    >
      {/* Hairline gradient at top */}
      <div
        aria-hidden
        className="absolute top-0 inset-x-[8%] h-px pointer-events-none"
        style={{
          background: 'linear-gradient(to right, transparent, rgba(255,255,255,0.18) 30%, rgba(255,255,255,0.18) 70%, transparent)',
        }}
      />

      {tabs.map(({ href, label, icon }) => {
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
                'transition-[filter] duration-200',
                active && 'drop-shadow-[0_0_8px_rgba(245,158,11,0.65)]',
              )}
            >
              {icon(active)}
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
