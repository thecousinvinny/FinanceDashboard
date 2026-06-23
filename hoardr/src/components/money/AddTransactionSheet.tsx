'use client'

import { useState, useEffect, useRef } from 'react'
import { PillGroup } from '@/components/ui/Pill'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'
import {
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  type SeedTx,
} from '@/lib/data/transactions'
import { localToday, cn, $fd } from '@/lib/utils'
import { ChevronDown } from 'lucide-react'

type TxType = 'Expense' | 'Income'

export interface CardOption { id: string; name: string; last4: string | null }
export interface BankOption { id: string; name: string }

interface Props {
  open:              boolean
  onClose:           () => void
  onAdd:             (tx: SeedTx) => void
  cards?:            CardOption[]
  banks?:            BankOption[]
  defaultCardId?:    string | null
  defaultBankId?:    string | null
  defaultCategory?:  string | null
}

export function AddTransactionSheet({ open, onClose, onAdd, cards = [], banks = [], defaultCardId, defaultBankId, defaultCategory }: Props) {
  const [type,          setType]          = useState<TxType>('Expense')
  const [amount,        setAmount]        = useState('')
  const [originalPrice, setOriginalPrice] = useState('')
  const [hasDiscount,   setHasDiscount]   = useState(false)
  const [name,          setName]          = useState('')
  const [description,   setDescription]   = useState('')
  const [category,      setCategory]      = useState<string | null>(null)
  const [date,          setDate]          = useState(localToday())
  const [cardId,        setCardId]        = useState<string | null>(null)
  const [bankId,        setBankId]        = useState<string | null>(null)

  const categories = type === 'Expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

  useEffect(() => {
    // On tab switch (and mount): restore the default category for expenses, clear for income.
    // Setting the default here instead of null avoids clobbering it on mount.
    setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
    if (type === 'Income') { setHasDiscount(false); setOriginalPrice('') }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [type])

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

  // Keyboard-aware scroll: scroll focused field above keyboard
  useEffect(() => {
    if (!open) return
    const vv = window.visualViewport
    if (!vv) return
    const onResize = () => {
      const sc = scrollAreaRef.current
      if (!sc) return
      const kbH = Math.max(0, window.innerHeight - vv.height)
      if (kbH > 50) {
        sc.style.paddingBottom = `${kbH + 24}px`
        requestAnimationFrame(() => {
          const focused = document.activeElement as HTMLElement | null
          if (!focused || !sc.contains(focused)) return
          const clearance = vv.height - 16
          if (focused.getBoundingClientRect().bottom > clearance) {
            sc.scrollTop += focused.getBoundingClientRect().bottom - clearance
          }
        })
      } else {
        sc.style.paddingBottom = ''
      }
    }
    vv.addEventListener('resize', onResize)
    return () => {
      vv.removeEventListener('resize', onResize)
      if (scrollAreaRef.current) scrollAreaRef.current.style.paddingBottom = ''
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
      setCategory(type === 'Expense' ? (defaultCategory ?? null) : null)
    } else {
      const t = setTimeout(() => {
        setType('Expense')
        setAmount('')
        setOriginalPrice('')
        setHasDiscount(false)
        setName('')
        setDescription('')
        setCategory(defaultCategory ?? null)
        setDate(localToday())
        setCardId(defaultCardId ?? null)
        setBankId(defaultBankId ?? null)
      }, 300)
      return () => clearTimeout(t)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }
  function handleOriginalChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setOriginalPrice(raw)
  }

  const parsedPaid     = parseFloat(amount)     || 0
  const parsedOriginal = parseFloat(originalPrice) || 0
  const savings        = hasDiscount && parsedOriginal > parsedPaid && parsedOriginal > 0 && parsedPaid > 0
                           ? parsedOriginal - parsedPaid : 0

  function handleAdd() {
    if (!parsedPaid || !name.trim() || !category) return
    onAdd({
      id:            `t${Date.now()}`,
      type,
      name:          name.trim(),
      description:   description.trim() || null,
      category,
      date,
      amount:        parsedPaid,
      original_cost: hasDiscount && parsedOriginal > 0 ? parsedOriginal : null,
      card_id:       type === 'Expense' ? cardId : undefined,
      bank_id:       type === 'Income'  ? bankId : undefined,
    })
    onClose()
  }

  const canAdd = !!parsedPaid && !!name.trim() && !!category &&
                 (!hasDiscount || !!parsedOriginal)

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
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)', height: 'calc(100dvh - env(safe-area-inset-top, 44px) - 8px)', display: 'flex', flexDirection: 'column' }}
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
          <h2 className="text-[18px] font-bold tracking-tight text-ink">{type === 'Income' ? 'New Income' : 'New Expense'}</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div ref={scrollAreaRef} className="px-5 space-y-4 overflow-y-auto" style={{ flex: 1, paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 80px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          <PillGroup options={['Expense', 'Income'] as TxType[]} value={type} onChange={setType} />

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              {type === 'Expense' ? 'Merchant' : 'Source'}
            </p>
            <input
              type="text" placeholder={type === 'Expense' ? 'e.g. Blue Bottle' : 'e.g. Studio Co'}
              value={name} onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint">Amount</p>
              {type === 'Expense' && (
                <button
                  onClick={() => { setHasDiscount(v => !v); setOriginalPrice('') }}
                  className={cn(
                    'text-[9px] font-semibold tracking-[0.08em] uppercase px-2.5 py-1 rounded-full transition-all select-none',
                    hasDiscount ? 'bg-emerald/15 text-emerald' : 'bg-bg-overlay text-ink-faint',
                  )}
                >
                  Discount
                </button>
              )}
            </div>

            {hasDiscount ? (
              <div className="space-y-2">
                <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-2.5">
                  <span className="text-[16px] font-light text-ink-faint font-mono">$</span>
                  <input
                    type="text" inputMode="decimal" placeholder="0.00"
                    value={originalPrice}
                    onChange={e => handleOriginalChange(e.target.value)}
                    className="flex-1 bg-transparent text-[18px] font-semibold font-mono text-ink-muted outline-none placeholder:text-ink-faint"
                  />
                  <span className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint">original</span>
                </div>
                <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-2.5">
                  <span className="text-[20px] font-light text-ink-muted font-mono">$</span>
                  <input
                    type="text" inputMode="decimal" placeholder="0.00"
                    value={amount}
                    onChange={e => handleAmountChange(e.target.value)}
                    className="flex-1 bg-transparent text-[22px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
                  />
                  <span className="text-[9px] font-medium tracking-[0.08em] uppercase text-ink-faint">paid</span>
                </div>
                {savings > 0 && (
                  <p className="text-[11px] font-semibold text-emerald font-mono text-right pr-1">
                    You save {$fd(savings)}
                  </p>
                )}
              </div>
            ) : (
              <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-2.5">
                <span className="text-[20px] font-light text-ink-muted font-mono">$</span>
                <input
                  type="text" inputMode="decimal" placeholder="0.00" value={amount}
                  onChange={e => handleAmountChange(e.target.value)}
                  className="flex-1 bg-transparent text-[22px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
                />
              </div>
            )}
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Description</p>
            <textarea
              placeholder="Optional note"
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3 text-[15px] text-ink placeholder:text-ink-faint outline-none resize-none"
            />
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Category</p>
            <div className="grid grid-cols-4 gap-2">
              {categories.map(cat => {
                const Icon = getCategoryIcon(cat.name, type)
                const active = category === cat.name
                return (
                  <button
                    key={cat.name} onClick={() => setCategory(cat.name)}
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

          {/* Card picker (expenses) */}
          {type === 'Expense' && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Card</p>
              {cards.length === 0 ? (
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
              )}
            </div>
          )}

          {/* Bank picker (income) */}
          {type === 'Income' && (
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Bank</p>
              {banks.length === 0 ? (
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
                    {[...banks]
                      .sort((a, b) => (a.id === defaultBankId ? -1 : b.id === defaultBankId ? 1 : 0))
                      .map(b => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                  </select>
                  <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
                </div>
              )}
            </div>
          )}

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Date</p>
            <div className="overflow-hidden rounded-[14px] bg-bg-overlay">
              <input
                type="date" value={date} onChange={e => setDate(e.target.value)}
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
            Add Transaction
          </button>
        </div>
      </div>
    </>
  )
}
