'use client'

import { useState, useEffect, useRef } from 'react'
import { localToday, cn } from '@/lib/utils'
import type { BillingCycle } from '@/types'
import type { CardOption, BankOption } from '@/components/money/AddTransactionSheet'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import { ChevronDown } from 'lucide-react'

const BILLING_OPTIONS: { value: BillingCycle; label: string }[] = [
  { value: 'Weekly',    label: 'Weekly'    },
  { value: 'BiWeekly',  label: 'Bi-Weekly' },
  { value: 'Monthly',   label: 'Monthly'   },
  { value: 'Quarterly', label: 'Quarterly' },
  { value: 'Annual',    label: 'Annual'    },
]

export interface NewSub {
  name:         string
  cost:         number
  billing:      BillingCycle
  next_renewal: string
  card_id:      string | null
  bank_id:      string | null
  category:     string | null
}

interface Props {
  open:             boolean
  onClose:          () => void
  onAdd:            (sub: NewSub) => void
  cards?:           CardOption[]
  banks?:           BankOption[]
  defaultCardId?:   string | null
  defaultBilling?:  BillingCycle
}

export function AddSubscriptionSheet({ open, onClose, onAdd, cards = [], banks = [], defaultCardId, defaultBilling }: Props) {
  const [name,        setName]        = useState('')
  const [amount,      setAmount]      = useState('')
  const [billing,     setBilling]     = useState<BillingCycle>('Monthly')
  const [nextRenewal, setNextRenewal] = useState(localToday())
  const [cardId,      setCardId]      = useState<string | null>(null)
  const [bankId,      setBankId]      = useState<string | null>(null)
  const [direct,      setDirect]      = useState(false)
  const [category,    setCategory]    = useState<string | null>(null)

  const backdropRef = useRef<HTMLDivElement>(null)
  const sheetRef    = useRef<HTMLDivElement>(null)
  const dragStartY    = useRef<number | null>(null)
  const scrollAreaRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const scrollY = window.scrollY
    document.body.style.position = 'fixed'
    document.body.style.top = `-${scrollY}px`
    document.body.style.width = '100%'
    document.documentElement.style.overscrollBehavior = 'none'
    let lastY = 0
    const onStart = (e: TouchEvent) => { lastY = e.touches[0].clientY }
    const onMove = (e: TouchEvent) => {
      const el = scrollAreaRef.current
      if (!el?.contains(e.target as Node)) { e.preventDefault(); return }
      const dy = e.touches[0].clientY - lastY
      lastY = e.touches[0].clientY
      const { scrollTop, scrollHeight, clientHeight } = el
      if ((scrollTop <= 0 && dy > 0) || (scrollTop + clientHeight >= scrollHeight - 1 && dy < 0)) e.preventDefault()
    }
    document.addEventListener('touchstart', onStart, { passive: true })
    document.addEventListener('touchmove', onMove, { passive: false })
    return () => {
      document.body.style.position = ''
      document.body.style.top = ''
      document.body.style.width = ''
      document.documentElement.style.overscrollBehavior = ''
      document.removeEventListener('touchstart', onStart)
      document.removeEventListener('touchmove', onMove)
      window.scrollTo(0, scrollY)
    }
  }, [open])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform = `translateY(${dy}px)`
    sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => {
        if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
        onClose()
      }, 280)
    } else {
      sheetRef.current.style.transform = ''
      sheetRef.current.style.transition = ''
    }
  }

  useEffect(() => {
    if (open) {
      setCardId(defaultCardId ?? null)
      setBilling(defaultBilling ?? 'Monthly')
      setDirect(false)
      setBankId(null)
    } else {
      const t = setTimeout(() => {
        setName(''); setAmount(''); setBilling(defaultBilling ?? 'Monthly')
        setNextRenewal(localToday()); setCardId(defaultCardId ?? null); setCategory(null)
        setDirect(false); setBankId(null)
      }, 300)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }

  function handleAdd() {
    const parsed = parseFloat(amount) || 0
    if (!name.trim()) return
    onAdd({ name: name.trim(), cost: parsed, billing, next_renewal: nextRenewal, card_id: direct ? null : cardId, bank_id: direct ? bankId : null, category })
    onClose()
  }

  const canAdd = !!name.trim()

  return (
    <>
      <div
        ref={backdropRef}
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      <div
        ref={sheetRef}
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div
          onTouchStart={onDragStart}
          onTouchMove={onDragMove}
          onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3"
          style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Subscription</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div ref={scrollAreaRef} className="px-5 space-y-4 overflow-y-auto" style={{ maxHeight: '70vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Name</p>
            <input
              type="text" placeholder="e.g. Spotify" value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Cost</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-2.5">
              <span className="text-[20px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-[22px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Category <span className="normal-case">(optional)</span></p>
            <div className="grid grid-cols-4 gap-2">
              {EXPENSE_CATEGORIES.map(cat => {
                const Icon = getCategoryIcon(cat.name, 'Expense')
                const active = category === cat.name
                return (
                  <button
                    key={cat.name}
                    onClick={() => setCategory(active ? null : cat.name)}
                    className={cn(
                      'flex flex-col items-center gap-1 py-2.5 rounded-[14px] text-[10px] font-semibold transition-all select-none',
                      active ? 'bg-gold/15 text-gold ring-1 ring-gold/40' : 'bg-bg-overlay text-ink-muted',
                    )}
                  >
                    <Icon size={16} strokeWidth={1.75} />
                    {cat.name}
                  </button>
                )
              })}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Billing Cycle</p>
            <div className="grid grid-cols-3 gap-2">
              {BILLING_OPTIONS.map(opt => (
                <button
                  key={opt.value} onClick={() => setBilling(opt.value)}
                  className={cn(
                    'py-2.5 rounded-[14px] text-[12px] font-semibold transition-all select-none',
                    billing === opt.value ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted',
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Payment method: Direct toggle + Card or Bank picker */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint">
                {direct ? 'Bank' : 'Card'}
              </p>
              <button
                onClick={() => setDirect(v => !v)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-semibold transition-all select-none',
                  direct ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted ring-1 ring-white/[0.08]',
                )}
              >
                Direct
              </button>
            </div>
            {direct ? (
              banks.length === 0 ? (
                <p className="text-[12px] text-ink-faint py-2">No banks yet — add one in Wallet</p>
              ) : (
                <div className="relative">
                  <select
                    value={bankId ?? ''}
                    onChange={e => setBankId(e.target.value || null)}
                    className="w-full bg-bg-overlay border border-white/[0.06] rounded-[14px] px-4 py-3 text-[15px] text-ink appearance-none outline-none pr-10"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="">None</option>
                    {[...banks].map(b => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                </div>
              )
            ) : (
              cards.length === 0 ? (
                <p className="text-[12px] text-ink-faint py-2">No cards yet — add one in Wallet</p>
              ) : (
                <div className="relative">
                  <select
                    value={cardId ?? ''}
                    onChange={e => setCardId(e.target.value || null)}
                    className="w-full bg-bg-overlay border border-white/[0.06] rounded-[14px] px-4 py-3 text-[15px] text-ink appearance-none outline-none pr-10"
                    style={{ colorScheme: 'dark' }}
                  >
                    <option value="">None</option>
                    {[...cards]
                      .sort((a, b) => (a.id === defaultCardId ? -1 : b.id === defaultCardId ? 1 : 0))
                      .map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name}{c.last4 ? ` ••••${c.last4}` : ''}
                        </option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                </div>
              )
            )}
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Next Renewal</p>
            <div className="overflow-hidden rounded-[14px] bg-bg-overlay">
              <input
                type="date" value={nextRenewal} onChange={e => setNextRenewal(e.target.value)}
                style={{ colorScheme: 'dark' }}
                className="w-full bg-transparent px-4 py-3 text-[15px] text-ink outline-none"
              />
            </div>
          </div>

          <button
            onClick={handleAdd} disabled={!canAdd}
            className={cn(
              'w-full py-3.5 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canAdd ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Add Subscription
          </button>
        </div>
      </div>
    </>
  )
}
