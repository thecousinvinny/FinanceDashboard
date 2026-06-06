'use client'

import { useEffect, useState, useRef } from 'react'
import { Settings, LogOut, Check } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'

function SettingsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheetRef   = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const [theme, setTheme] = useState<Theme>('obsidian')

  useEffect(() => { setTheme(readTheme()) }, [])

  // Body lock while sheet is open
  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top      = `-${scrollY}px`
    document.body.style.width    = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    return () => {
      document.body.style.position = ''
      document.body.style.top      = ''
      document.body.style.width    = ''
      document.documentElement.style.overscrollBehavior = ''
      window.scrollTo(0, scrollY)
    }
  }, [open])

  function selectTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform  = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null
      ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current)
      : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) {
          sheetRef.current.style.transform  = ''
          sheetRef.current.style.transition = ''
        }
        onClose()
      }, 280)
    } else {
      sheetRef.current.style.transform  = ''
      sheetRef.current.style.transition = ''
    }
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-[55]"
          style={{ background: 'rgba(0,0,0,0.72)' }}
          onClick={onClose}
        />
      )}

      <div
        ref={sheetRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full'
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Drag handle */}
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="px-5 pb-4 flex items-center justify-between">
          <p className="text-[16px] font-semibold text-ink">Settings</p>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-bg-overlay flex items-center justify-center text-ink-muted text-[18px] leading-none"
          >
            ×
          </button>
        </div>

        {/* Appearance */}
        <div className="px-5 pb-5">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Appearance</p>
          <div className="grid grid-cols-3 gap-2.5">
            {THEMES.map(t => {
              const active = theme === t.id
              return (
                <button
                  key={t.id}
                  onClick={() => selectTheme(t.id)}
                  className={cn(
                    'rounded-[14px] p-2.5 text-left border transition-colors',
                    active
                      ? 'border-gold/50 bg-bg-overlay'
                      : 'border-white/[0.06] bg-bg-overlay'
                  )}
                >
                  {/* Color swatches */}
                  <div className="flex gap-1 mb-2">
                    {t.swatches.map((color, i) => (
                      <div
                        key={i}
                        className="h-6 rounded-[5px] flex-1"
                        style={{ backgroundColor: color, border: '1px solid rgba(0,0,0,0.08)' }}
                      />
                    ))}
                  </div>
                  <div className="flex items-start justify-between gap-1">
                    <div>
                      <p className="text-[11px] font-semibold text-ink leading-tight">{t.label}</p>
                      <p className="text-[9px] text-ink-muted leading-tight mt-0.5">{t.subtitle}</p>
                    </div>
                    {active && (
                      <div className="w-[15px] h-[15px] rounded-full gradient-gold flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check size={8} className="text-white" strokeWidth={2.5} />
                      </div>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Account */}
        <div className="px-5 pb-8">
          <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Account</p>
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-[14px] bg-bg-overlay text-left active:bg-white/[0.04]"
          >
            <LogOut size={15} className="text-ruby" strokeWidth={1.75} />
            <span className="text-[14px] font-medium text-ink">Sign Out</span>
          </button>
        </div>
      </div>
    </>
  )
}

export function ThemeToggle() {
  const [open, setOpen] = useState(false)

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted select-none active:scale-95 transition-transform"
        aria-label="Settings"
      >
        <Settings size={14} strokeWidth={1.75} />
      </button>
      <SettingsSheet open={open} onClose={() => setOpen(false)} />
    </>
  )
}

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      onClick={signOut}
      className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted select-none active:scale-95 transition-transform"
      aria-label="Sign out"
    >
      <LogOut size={14} strokeWidth={1.75} />
    </button>
  )
}
