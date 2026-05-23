'use client'

import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Check, Plus, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, haptic } from '@/lib/utils'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { showToast } from '@/lib/toast'
import {
  ICON_REGISTRY, ICON_LIST, COLOR_PALETTE,
  BUILTIN_EXPENSE_CATEGORIES, BUILTIN_INCOME_CATEGORIES,
  setCategoryMeta,
} from '@/lib/category-meta'

interface Category {
  id:      string
  name:    string
  icon:    string
  color:   string
  tx_type: string
}

interface SheetState {
  mode:    'add' | 'edit'
  cat?:    Category
}

const GROUPS = ['Food & Drink', 'Shopping', 'Transport', 'Health', 'Entertainment', 'Home', 'Finance', 'Tech']

function IconPicker({ value, onChange }: { value: string; onChange: (name: string) => void }) {
  const [group, setGroup] = useState<string | null>(null)
  const icons = group ? ICON_LIST.filter(i => i.group === group) : ICON_LIST

  return (
    <div>
      {/* Group filter chips */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3" style={{ scrollbarWidth: 'none' }}>
        <button
          onClick={() => setGroup(null)}
          className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors', !group ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted border border-white/[0.06]')}
        >
          All
        </button>
        {GROUPS.map(g => (
          <button
            key={g}
            onClick={() => setGroup(g === group ? null : g)}
            className={cn('flex-shrink-0 px-3 py-1.5 rounded-full text-[11px] font-medium transition-colors', group === g ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted border border-white/[0.06]')}
          >
            {g}
          </button>
        ))}
      </div>
      {/* Icon grid — 8 per row */}
      <div className="grid grid-cols-8 gap-2">
        {icons.map(({ name }) => {
          const Icon   = ICON_REGISTRY[name]
          const active = value === name
          if (!Icon) return null
          return (
            <button
              key={name}
              onClick={() => onChange(name)}
              className={cn(
                'aspect-square rounded-[10px] flex items-center justify-center transition-colors',
                active ? 'bg-gold/20 ring-1 ring-gold/60' : 'bg-bg-overlay'
              )}
            >
              <Icon size={18} strokeWidth={1.75} className={active ? 'text-gold' : 'text-ink-muted'} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function ColorPicker({ value, onChange }: { value: string; onChange: (hex: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-2">
      {COLOR_PALETTE.map(hex => (
        <button
          key={hex}
          onClick={() => onChange(hex)}
          className="aspect-square rounded-full relative flex items-center justify-center transition-transform active:scale-90"
          style={{ backgroundColor: hex }}
        >
          {value === hex && <Check size={10} className="text-white" strokeWidth={3} />}
        </button>
      ))}
    </div>
  )
}

function CategorySheet({
  state, onClose, onSave,
}: {
  state:   SheetState | null
  onClose: () => void
  onSave:  (data: { name: string; icon: string; color: string; tx_type: string }) => void
}) {
  const open    = state !== null
  const isEdit  = state?.mode === 'edit'
  const sheetRef   = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const [name,    setName]    = useState('')
  const [icon,    setIcon]    = useState('LayoutGrid')
  const [color,   setColor]   = useState('#D4AF37')
  const [txType,  setTxType]  = useState<'Expense' | 'Income'>('Expense')
  const [dragY,   setDragY]   = useState(0)

  useEffect(() => {
    if (open) {
      if (state?.cat) {
        setName(state.cat.name)
        setIcon(state.cat.icon)
        setColor(state.cat.color)
        setTxType(state.cat.tx_type as 'Expense' | 'Income')
      } else {
        setName(''); setIcon('LayoutGrid'); setColor('#D4AF37'); setTxType('Expense')
      }
      setDragY(0)
    } else {
      setTimeout(() => { setName(''); setIcon('LayoutGrid'); setColor('#D4AF37'); setTxType('Expense'); setDragY(0) }, 300)
    }
  }, [open, state])

  useEffect(() => {
    const el = backdropRef.current
    if (!el || !open) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
  }, [open])

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null) return
    setDragY(Math.max(0, e.touches[0].clientY - dragStartY.current))
  }
  function onDragEnd() {
    const dy = dragY; dragStartY.current = null; setDragY(0)
    if (dy > 80) onClose()
  }

  const PreviewIcon = ICON_REGISTRY[icon] ?? ICON_REGISTRY.LayoutGrid

  return (
    <>
      <div
        ref={backdropRef}
        className={`fixed inset-0 z-[55] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.72)' }}
        onClick={onClose}
      />
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface"
        style={{
          willChange: 'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform: open ? `translateY(${dragY}px)` : 'translateY(100%)',
          transition: dragY > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Handle */}
        <div
          onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          className="flex justify-center pt-3 pb-3" style={{ touchAction: 'none' }}
        >
          <div className="w-9 h-1 rounded-full bg-white/20" />
        </div>

        {/* Header */}
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">{isEdit ? 'Edit Category' : 'New Category'}</h2>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center">
            <X size={14} className="text-ink-muted" />
          </button>
        </div>

        <div
          className="px-5 overflow-y-auto space-y-5"
          style={{ maxHeight: '72vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}
        >
          {/* Preview */}
          <div className="flex items-center gap-4 bg-bg-overlay border border-white/[0.06] rounded-[16px] px-4 py-3.5">
            <div className="w-10 h-10 rounded-[12px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: color + '22' }}>
              <PreviewIcon size={18} strokeWidth={1.75} style={{ color }} />
            </div>
            <p className="text-[15px] font-semibold text-ink">{name || 'Category name'}</p>
          </div>

          {/* Name */}
          {!isEdit && (
            <div>
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Name</p>
              <input
                type="text"
                placeholder="e.g. Dining, Commute…"
                value={name}
                onChange={e => setName(e.target.value)}
                maxLength={24}
                className="w-full bg-bg-overlay border border-white/[0.08] rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none focus:border-gold/40"
              />
            </div>
          )}

          {/* Type toggle (only when adding) */}
          {!isEdit && (
            <div>
              <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">Type</p>
              <div className="flex gap-2">
                {(['Expense', 'Income'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => setTxType(t)}
                    className={cn(
                      'flex-1 py-2.5 rounded-[12px] text-[13px] font-semibold border transition-colors',
                      txType === t ? 'gradient-gold text-white border-transparent' : 'bg-bg-overlay text-ink-muted border-white/[0.06]'
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Icon picker */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Icon</p>
            <IconPicker value={icon} onChange={setIcon} />
          </div>

          {/* Color picker */}
          <div>
            <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Color</p>
            <ColorPicker value={color} onChange={setColor} />
          </div>

          {/* Save */}
          <button
            onClick={() => { if (!isEdit && !name.trim()) return; onSave({ name: name.trim() || state!.cat!.name, icon, color, tx_type: txType }); onClose() }}
            disabled={!isEdit && !name.trim()}
            className="w-full gradient-gold rounded-[14px] py-4 text-[15px] font-bold text-white disabled:opacity-40 transition-opacity"
          >
            {isEdit ? 'Save Changes' : 'Add Category'}
          </button>
        </div>
      </div>
    </>
  )
}

export default function CategoriesPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [categories,   setCategories]   = useState<Category[]>([])
  const [loading,      setLoading]      = useState(true)
  const [needsMigration, setNeedsMigration] = useState(false)
  const [sheet,        setSheet]        = useState<SheetState | null>(null)

  const loadAndSeed = useCallback(async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    // Probe for the new columns — if they're missing the migration hasn't been run
    const { error: probe } = await supabase
      .from('categories')
      .select('icon, color, tx_type')
      .limit(1)

    if (probe) {
      setNeedsMigration(true)
      setLoading(false)
      return
    }

    // Upsert built-ins — always writes icon/color so the DB stays in sync with the defaults
    const builtins = [
      ...BUILTIN_EXPENSE_CATEGORIES.map(c => ({ ...c, tx_type: 'Expense', user_id: user.id })),
      ...BUILTIN_INCOME_CATEGORIES.map(c => ({ ...c, tx_type: 'Income',  user_id: user.id })),
    ]
    await supabase.from('categories').upsert(builtins, { onConflict: 'user_id,name' })

    const { data } = await supabase
      .from('categories')
      .select('id, name, icon, color, tx_type')
      .eq('user_id', user.id)
      .order('tx_type').order('name')

    const cats = (data ?? []) as Category[]
    setCategories(cats)
    setCategoryMeta(cats)
    setLoading(false)
  }, [supabase])

  useEffect(() => { loadAndSeed() }, [loadAndSeed])

  async function handleSave(data: { name: string; icon: string; color: string; tx_type: string }) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    if (sheet?.mode === 'edit' && sheet.cat) {
      await supabase.from('categories')
        .update({ icon: data.icon, color: data.color })
        .eq('id', sheet.cat.id)
      setCategories(prev => prev.map(c => c.id === sheet.cat!.id ? { ...c, icon: data.icon, color: data.color } : c))
      setCategoryMeta([...categories.map(c => c.id === sheet.cat!.id ? { ...c, icon: data.icon, color: data.color } : c)])
      showToast('Category updated', { type: 'add' })
    } else {
      const { data: row } = await supabase.from('categories')
        .insert({ user_id: user.id, name: data.name, icon: data.icon, color: data.color, tx_type: data.tx_type })
        .select('id, name, icon, color, tx_type')
        .single()
      if (row) {
        const next = [...categories, row as Category].sort((a, b) => a.tx_type.localeCompare(b.tx_type) || a.name.localeCompare(b.name))
        setCategories(next)
        setCategoryMeta(next)
        showToast('Category added', { type: 'add' })
      }
    }
  }

  async function handleDelete(cat: Category) {
    const snapshot = [...categories]
    setCategories(prev => prev.filter(c => c.id !== cat.id))
    showToast(`${cat.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo:   () => setCategories(snapshot),
        onCommit: async () => {
          await supabase.from('categories').delete().eq('id', cat.id)
          setCategoryMeta(categories.filter(c => c.id !== cat.id))
        },
      },
    })
  }

  const expenseCats = categories.filter(c => c.tx_type === 'Expense')
  const incomeCats  = categories.filter(c => c.tx_type === 'Income')

  function renderSection(title: string, cats: Category[]) {
    if (cats.length === 0) return null
    return (
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">{title}</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          {cats.map(cat => {
            const Icon = ICON_REGISTRY[cat.icon] ?? ICON_REGISTRY.LayoutGrid
            return (
              <SwipeToDelete
                key={cat.id}
                onDelete={() => handleDelete(cat)}
                onTap={() => { haptic('tap'); setSheet({ mode: 'edit', cat }) }}
              >
                <div className="flex items-center gap-3 px-4 py-3">
                  <div className="w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0" style={{ backgroundColor: cat.color + '22' }}>
                    <Icon size={16} strokeWidth={1.75} style={{ color: cat.color }} />
                  </div>
                  <p className="text-[14px] font-medium text-ink flex-1">{cat.name}</p>
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: cat.color }} />
                </div>
              </SwipeToDelete>
            )
          })}
        </div>
      </div>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-bg-base tab-enter pb-28">
        {/* Header */}
        <div className="px-5 pt-14 pb-6 flex items-center gap-3">
          <button onClick={() => router.back()} className="w-8 h-8 rounded-full bg-bg-overlay flex items-center justify-center flex-shrink-0">
            <ArrowLeft size={15} className="text-ink-muted" strokeWidth={1.75} />
          </button>
          <div>
            <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold">Settings</p>
            <h1 className="text-[26px] font-bold tracking-[-0.04em] text-ink leading-tight">Categories</h1>
          </div>
        </div>

        {loading ? (
          <div className="px-5 space-y-2 mt-2">
            {[...Array(6)].map((_, i) => <div key={i} className="skeleton h-14 rounded-[14px]" />)}
          </div>
        ) : needsMigration ? (
          <div className="px-5 mt-4">
            <div className="bg-bg-surface border border-white/[0.06] rounded-card p-5">
              <p className="text-[14px] font-semibold text-ink mb-2">Database migration required</p>
              <p className="text-[13px] text-ink-muted mb-4 leading-relaxed">
                Run this SQL in your Supabase dashboard (SQL Editor) to enable category icons and colors:
              </p>
              <div className="bg-bg-base rounded-[10px] p-3 mb-4">
                <p className="text-[11px] font-mono text-ink-muted leading-relaxed whitespace-pre-wrap">{`alter table categories
  add column if not exists icon text not null default 'LayoutGrid',
  add column if not exists color text not null default '#D4AF37',
  add column if not exists tx_type text not null default 'Expense';

alter table categories
  drop constraint if exists categories_user_id_name_key;

alter table categories
  add constraint categories_user_id_name_key unique (user_id, name);`}</p>
              </div>
              <button
                onClick={() => { setLoading(true); setNeedsMigration(false); loadAndSeed() }}
                className="w-full gradient-gold rounded-[12px] py-3 text-[14px] font-bold text-white"
              >
                Retry after running migration
              </button>
            </div>
          </div>
        ) : (
          <>
            {renderSection('Expense', expenseCats)}
            {renderSection('Income', incomeCats)}
          </>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => setSheet({ mode: 'add' })}
        className="fixed gradient-gold rounded-full flex items-center justify-center text-white select-none"
        style={{ right: 16, bottom: 80, width: 56, height: 56, zIndex: 40, boxShadow: '0 4px 24px rgba(0,0,0,0.5), 0 0 0 1px rgba(212,175,55,0.25)' }}
        aria-label="Add category"
      >
        <Plus size={24} strokeWidth={2} />
      </button>

      <CategorySheet state={sheet} onClose={() => setSheet(null)} onSave={handleSave} />
    </>
  )
}
