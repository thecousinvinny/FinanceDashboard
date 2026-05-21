'use client'

import { useState, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'

interface WishSnapshot {
  id:            string
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
}

export interface WishEdits {
  name:          string
  original_cost: number | null
  category:      string | null
  url:           string | null
}

interface Props {
  item:    WishSnapshot | null
  open:    boolean
  onClose: () => void
  onSave:  (id: string, edits: WishEdits) => void
}

export function EditWishlistSheet({ item, open, onClose, onSave }: Props) {
  const [name,     setName]     = useState('')
  const [amount,   setAmount]   = useState('')
  const [category, setCategory] = useState('')
  const [url,      setUrl]      = useState('')

  useEffect(() => {
    if (item) {
      setName(item.name)
      setAmount(item.original_cost != null ? String(item.original_cost) : '')
      setCategory(item.category ?? '')
      setUrl(item.url ?? '')
    }
  }, [item])

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
    if (!open) {
      const t = setTimeout(() => { setName(''); setAmount(''); setCategory(''); setUrl('') }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleSave() {
    if (!name.trim() || !item) return
    const parsed = parseFloat(amount)
    onSave(item.id, {
      name:          name.trim(),
      original_cost: parsed > 0 ? parsed : null,
      category:      category.trim() || null,
      url:           url.trim() || null,
    })
    onClose()
  }

  const canSave = !!name.trim()

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

        <div className="flex items-center justify-between px-5 mb-5">
          <h2 className="text-[18px] font-bold tracking-tight text-ink">Edit Item</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div ref={scrollAreaRef} className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Item Name</p>
            <input
              type="text" value={name} onChange={e => setName(e.target.value)}
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
                onChange={e => { const v = e.target.value; if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setAmount(v) }}
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
            onClick={handleSave} disabled={!canSave}
            className={cn(
              'w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none',
              canSave ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint',
            )}
          >
            Save Changes
          </button>
        </div>
      </div>
    </>
  )
}
