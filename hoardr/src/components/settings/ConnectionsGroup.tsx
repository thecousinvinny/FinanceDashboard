'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, RefreshCw } from 'lucide-react'
import { FormGroup } from '@/components/ui/Form'
import { CONNECTIONS, type ConnStatus } from '@/lib/connections'
import { useOnScreenReturn } from '@/lib/tab-nav'
import { haptic } from '@/lib/utils'

const DOT: Record<ConnStatus['state'], string> = {
  ok:     'var(--sem-income)',
  action: '#D4AF37',
  error:  '#ef4444',
  off:    'rgb(var(--rgb-ink) / 0.25)',
}

/**
 * Settings → Connections: every service from lib/connections.ts with a live
 * status. Something wrong shows its fix right on the row; tapping a row opens
 * what the service is for, "Check again" and (where it has one) "Reconnect".
 * Checked when Settings opens and each time you come back to it.
 */
export function ConnectionsGroup({ email }: { email: string | null }) {
  const [status,   setStatus]   = useState<Record<string, ConnStatus | undefined>>({})
  const [checking, setChecking] = useState<Set<string>>(new Set())
  const [open,     setOpen]     = useState<string | null>(null)
  const [busy,     setBusy]     = useState<string | null>(null)
  const gen = useRef(0)
  const emailRef = useRef(email)
  emailRef.current = email

  const check = useCallback(async (ids = CONNECTIONS.map(c => c.id)) => {
    const g = ++gen.current
    setChecking(new Set(ids))
    await Promise.all(CONNECTIONS.filter(c => ids.includes(c.id)).map(async c => {
      let s: ConnStatus
      try { s = await c.check({ email: emailRef.current }) }
      catch { s = { state: 'error', detail: 'Couldn’t check — try again' } }
      if (g !== gen.current && ids.length > 1) return
      setStatus(prev => ({ ...prev, [c.id]: s }))
      setChecking(prev => { const n = new Set(prev); n.delete(c.id); return n })
    }))
  }, [])

  useEffect(() => { check() }, [check])
  useOnScreenReturn(() => check())

  async function runAction(id: string, run: () => Promise<void> | void) {
    haptic('tap')
    setBusy(id)
    try { await run() } finally { setBusy(null) }
    // Most fixes (OAuth) leave the page; the rest are re-checked here
    check([id])
  }

  const needsAttention = CONNECTIONS.filter(c => { const s = status[c.id]?.state; return s === 'action' || s === 'error' }).length

  return (
    <FormGroup
      header={needsAttention ? `Connections · ${needsAttention} need${needsAttention === 1 ? 's' : ''} attention` : 'Connections'}
      footer="Each service is checked when you open Settings. Reconnecting keeps you signed in."
    >
      {CONNECTIONS.map(c => {
        const s = status[c.id]
        const isChecking = checking.has(c.id) && !s
        const isOpen = open === c.id
        const needs = s && (s.state === 'action' || s.state === 'error')
        return (
          <div key={c.id} className="form-row relative" style={{ ['--sep-inset' as string]: '50px' }}>
            <div
              role="button"
              tabIndex={0}
              onClick={() => { haptic('tap'); setOpen(isOpen ? null : c.id) }}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(isOpen ? null : c.id) } }}
              className="flex items-center gap-3 px-4 py-[9px] min-h-[58px] w-full text-left active:bg-[rgb(var(--rgb-ink)/0.06)] transition-colors cursor-pointer select-none"
            >
              <span className="flex items-center justify-center w-[22px] flex-shrink-0 text-ink-muted">
                <c.icon size={18} strokeWidth={1.75} />
              </span>
              <span className="flex-1 min-w-0">
                <span className="block text-[16px] text-ink">{c.name}</span>
                <span className="flex items-center gap-1.5 text-[13px] text-ink-muted min-w-0">
                  <span className="w-[7px] h-[7px] rounded-full flex-shrink-0"
                    style={{ background: isChecking ? 'rgb(var(--rgb-ink) / 0.2)' : DOT[s?.state ?? 'off'] }} />
                  <span className="truncate">{isChecking ? 'Checking…' : s?.detail ?? ''}</span>
                </span>
              </span>
              {needs && s?.action ? (
                <button
                  type="button"
                  onClick={e => { e.stopPropagation(); runAction(c.id, s.action!.run) }}
                  disabled={busy === c.id}
                  className="flex-shrink-0 h-[30px] px-3.5 rounded-full text-[14px] font-semibold text-[#1a1200] disabled:opacity-50"
                  style={{ background: 'linear-gradient(160deg, #E9CD7A 0%, #D4AF37 45%, #B08A2A 100%)' }}
                >
                  {busy === c.id ? '…' : s.action.label}
                </button>
              ) : (
                <ChevronDown size={16} className="text-ink-faint flex-shrink-0 transition-transform duration-200"
                  style={{ transform: isOpen ? 'rotate(180deg)' : 'none' }} />
              )}
            </div>
            {isOpen && (
              <div className="pl-[50px] pr-4 pb-3 -mt-1">
                <p className="text-[13px] text-ink-muted leading-snug">{c.purpose}</p>
                <div className="flex gap-2 mt-2.5">
                  <button
                    type="button"
                    onClick={() => { haptic('tap'); check([c.id]) }}
                    disabled={checking.has(c.id)}
                    className="flex items-center gap-1.5 h-[30px] px-3 rounded-full text-[13px] text-ink disabled:opacity-50"
                    style={{ background: 'rgb(var(--rgb-ink) / 0.08)' }}
                  >
                    <RefreshCw size={13} strokeWidth={2} className={checking.has(c.id) ? 'animate-spin' : ''} />
                    Check again
                  </button>
                  {s?.action && !needs && (
                    <button
                      type="button"
                      onClick={() => runAction(c.id, s.action!.run)}
                      disabled={busy === c.id}
                      className="h-[30px] px-3 rounded-full text-[13px] text-ink disabled:opacity-50"
                      style={{ background: 'rgb(var(--rgb-ink) / 0.08)' }}
                    >
                      {s.action.label}
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </FormGroup>
  )
}
