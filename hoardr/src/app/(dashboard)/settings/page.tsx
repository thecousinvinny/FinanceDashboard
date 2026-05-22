'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Check, ChevronRight, CreditCard, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { type Theme, THEMES, applyTheme, readTheme } from '@/lib/theme'

export default function SettingsPage() {
  const router = useRouter()
  const [theme, setTheme]   = useState<Theme>('obsidian')
  const [email, setEmail]   = useState<string | null>(null)

  useEffect(() => { setTheme(readTheme()) }, [])

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null)
    })
  }, [])

  function selectTheme(t: Theme) {
    setTheme(t)
    applyTheme(t)
  }

  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      {/* Header */}
      <div className="px-5 pt-14 pb-6">
        <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-1">Hoardr</p>
        <h1 className="text-[32px] font-bold tracking-[-0.04em] text-ink">Settings</h1>
      </div>

      {/* ── Accounts ───────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Accounts</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden">
          <button
            onClick={() => router.push('/wallet')}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CreditCard size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Cards &amp; Banks</p>
              <p className="text-[11px] text-ink-muted">Manage payment methods</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Appearance ─────────────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
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

      {/* ── App ────────────────────────────────────────────────────────────── */}
      <div className="px-5">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">App</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {email && (
            <div className="px-4 py-3.5 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full gradient-gold flex items-center justify-center flex-shrink-0">
                <span className="text-[11px] font-bold text-white">
                  {email.charAt(0).toUpperCase()}
                </span>
              </div>
              <p className="text-[13px] text-ink-muted truncate">{email}</p>
            </div>
          )}
          <button
            onClick={signOut}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:opacity-70 transition-opacity"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <LogOut size={15} className="text-ruby" strokeWidth={1.75} />
            </div>
            <span className="text-[14px] font-medium text-ink">Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  )
}
