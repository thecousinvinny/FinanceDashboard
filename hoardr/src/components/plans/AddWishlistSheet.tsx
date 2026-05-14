'use client'

import { useState, useEffect } from 'react'
import { cn } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'

export interface NewWishItem {
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: NewWishItem) => void
}

export function AddWishlistSheet({ open, onClose, onAdd }: Props) {
  const [name,     setName]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [category, setCategory] = useState('')
  const [url,      setUrl]      = useState('')

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [open])

  useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setName(''); setAmount(''); setCategory(''); setUrl('')
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAmountChange(raw: string) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) setAmount(raw)
  }

  function handleAdd() {
    if (!name.trim()) return
    const parsed = parseFloat(amount)
    onAdd({
      name:          name.trim(),
      original_cost: parsed > 0 ? parsed : null,
      category:      category.trim() || null,
      url:           url.trim() || null,
    })
    onClose()
  }

  const canAdd = !!name.trim()

  return (
    <>
      <div
        onClick={onClose}
        className={cn(
          'fixed inset-0 z-[59] transition-opacity duration-300',
          open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none',
        )}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />

      <div
        className={cn(
          'fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300',
          open ? 'translate-y-0' : 'translate-y-full',
        )}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-2">
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        <div className="flex items-center justify-between px-5 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Wishlist Item</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Item Name</p>
            <input
              type="text" placeholder="e.g. Sony WH-1000XM5" value={name}
              onChange={e => setName(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              List Price <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-3">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text" inputMode="decimal" placeholder="0.00" value={amount}
                onChange={e => handleAmountChange(e.target.value)}
                className="flex-1 bg-transparent text-[28px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-3">
              Category <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <div className="grid grid-cols-4 gap-2">
              {EXPENSE_CATEGORIES.map(cat => {
                const Icon = getCategoryIcon(cat.name, 'Expense')
                const active = category === cat.name
                return (
                  <button
                    key={cat.name}
                    onClick={() => setCategory(active ? '' : cat.name)}
                    className={cn(
                      'flex flex-col items-center gap-1.5 py-2.5 rounded-[14px] text-[10px] font-semibold transition-all select-none',
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
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              Buy Link <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <input
              type="url" placeholder="https://..." value={url}
              onChange={e => setUrl(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none"
            />
          </div>

          <button
            onClick={handleAdd} disabled={!canAdd}
            className={cn(
              'w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canAdd ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Add to Wishlist
          </button>
        </div>
      </div>
    </>
  )
}
