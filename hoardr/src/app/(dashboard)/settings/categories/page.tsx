'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, ChevronRight, Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, haptic } from '@/lib/utils'
import { SwipeToDelete } from '@/components/ui/SwipeToDelete'
import { GlobalFAB } from '@/components/ui/GlobalFAB'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup, FormRow, Segmented, rowInput } from '@/components/ui/Form'
import { LoadBars } from '@/components/ui/LoadBars'
import { showToast } from '@/lib/toast'
import { reportDbError } from '@/lib/db-error'
import {
  ICON_REGISTRY, ICON_LIST,
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

type TxType = 'Expense' | 'Income'
const TX_TYPES: TxType[] = ['Expense', 'Income']

interface SheetState { mode: 'add' | 'edit'; cat?: Category }

const GROUPS = ['Food & Drink', 'Shopping', 'Transport', 'Health', 'Entertainment', 'Home', 'Finance', 'Tech']

// Icons are always the semantic color, like everywhere else in the app
const tone = (t: string) => (t === 'Income' ? 'text-emerald' : 'text-gold')

function IconPicker({ value, onChange, txType }: { value: string; onChange: (name: string) => void; txType: string }) {
  const [group, setGroup] = useState<string | null>(null)
  const icons = group ? ICON_LIST.filter(i => i.group === group) : ICON_LIST
  const chip = (on: boolean) => cn(
    'flex-shrink-0 px-3 py-1.5 rounded-full text-[12px] font-medium transition-colors',
    on ? 'gradient-gold text-white' : 'text-ink-muted',
  )

  return (
    <div>
      <div className="flex gap-1.5 overflow-x-auto pb-3 -mx-1 px-1" style={{ scrollbarWidth: 'none' }}>
        <button onClick={() => setGroup(null)} className={chip(!group)} style={group ? { background: 'rgb(var(--rgb-ink) / 0.06)' } : undefined}>All</button>
        {GROUPS.map(g => (
          <button key={g} onClick={() => setGroup(g === group ? null : g)} className={chip(group === g)}
            style={group !== g ? { background: 'rgb(var(--rgb-ink) / 0.06)' } : undefined}>
            {g}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-8 gap-2">
        {icons.map(({ name }) => {
          const Icon = ICON_REGISTRY[name]
          const active = value === name
          if (!Icon) return null
          return (
            <button
              key={name}
              onClick={() => { haptic('tap'); onChange(name) }}
              aria-label={name}
              className={cn('aspect-square rounded-[10px] flex items-center justify-center transition-colors', active && 'ring-1 ring-gold/60')}
              style={{ background: active ? 'rgb(212 175 55 / 0.16)' : 'rgb(var(--rgb-ink) / 0.06)' }}
            >
              <Icon size={18} strokeWidth={1.75} className={active ? tone(txType) : 'text-ink-muted'} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

function CategorySheet({ state, onClose, onSave, taken }: {
  state:   SheetState | null
  onClose: () => void
  onSave:  (data: { name: string; icon: string; tx_type: TxType }) => void
  taken:   Set<string>
}) {
  const open   = state !== null
  const isEdit = state?.mode === 'edit'
  const [name,   setName]   = useState('')
  const [icon,   setIcon]   = useState('LayoutGrid')
  const [txType, setTxType] = useState<TxType>('Expense')

  useEffect(() => {
    if (!state) return
    setName(state.cat?.name ?? '')
    setIcon(state.cat?.icon ?? 'LayoutGrid')
    setTxType((state.cat?.tx_type as TxType) ?? 'Expense')
  }, [state])

  const trimmed = name.trim()
  const clash = !isEdit && taken.has(trimmed.toLowerCase())
  const canSave = isEdit || (!!trimmed && !clash)
  const Preview = ICON_REGISTRY[icon] ?? ICON_REGISTRY.LayoutGrid

  function save() {
    if (!canSave) return
    onSave({ name: isEdit ? state!.cat!.name : trimmed, icon, tx_type: txType })
    onClose()
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={isEdit ? 'Edit Category' : 'New Category'}
      action={{ label: isEdit ? 'Save' : 'Add', onClick: save, disabled: !canSave }}
    >
      <div className="flex flex-col items-center pt-4 pb-2">
        <span className="flex items-center justify-center w-[64px] h-[64px] rounded-full" style={{ background: 'rgb(var(--rgb-ink) / 0.07)' }}>
          <Preview size={28} strokeWidth={1.75} className={tone(txType)} />
        </span>
        <p className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-ink truncate max-w-full px-6">
          {(isEdit ? state?.cat?.name : trimmed) || 'Category'}
        </p>
        <p className="text-[13px] text-ink-muted">{txType}</p>
      </div>

      {!isEdit && (
        <>
          <FormGroup footer={clash ? <span className="text-ruby">You already have a category with this name.</span> : undefined}>
            <FormRow label="Name">
              <input
                type="text" placeholder="Dining" value={name} maxLength={24}
                onChange={e => setName(e.target.value)}
                className={rowInput}
              />
            </FormRow>
          </FormGroup>
          <FormGroup header="Type" plain>
            <Segmented options={TX_TYPES} value={txType} onChange={setTxType} />
          </FormGroup>
        </>
      )}

      <FormGroup header="Icon">
        <div className="px-4 py-3">
          <IconPicker value={icon} onChange={setIcon} txType={txType} />
        </div>
      </FormGroup>
    </Sheet>
  )
}

/** Settings → Categories: the expense and income categories forms offer. */
export default function CategoriesPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [categories, setCategories] = useState<Category[]>([])
  const [loading,    setLoading]    = useState(true)
  const [sheet,      setSheet]      = useState<SheetState | null>(null)

  const load = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return
    // Adds any built-in that's missing. Existing rows are left alone, so an
    // icon you changed on a built-in stays changed (this used to reset them).
    await supabase.from('categories').upsert([
      ...BUILTIN_EXPENSE_CATEGORIES.map(c => ({ ...c, tx_type: 'Expense', user_id: user.id })),
      ...BUILTIN_INCOME_CATEGORIES.map(c => ({ ...c, tx_type: 'Income',  user_id: user.id })),
    ], { onConflict: 'user_id,name', ignoreDuplicates: true })

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

  useEffect(() => { load() }, [load])

  const taken = useMemo(() => new Set(categories.map(c => c.name.toLowerCase())), [categories])

  async function handleSave(data: { name: string; icon: string; tx_type: TxType }) {
    const { data: { session } } = await supabase.auth.getSession()
    const user = session?.user
    if (!user) return

    if (sheet?.mode === 'edit' && sheet.cat) {
      const id = sheet.cat.id
      const prev = categories
      const next = categories.map(c => c.id === id ? { ...c, icon: data.icon } : c)
      setCategories(next)
      setCategoryMeta(next)
      showToast('Category updated', { type: 'add' })
      const { error } = await supabase.from('categories').update({ icon: data.icon }).eq('id', id)
      if (reportDbError(error, 'update category')) { setCategories(prev); setCategoryMeta(prev) }
    } else {
      const { data: row, error } = await supabase.from('categories')
        .insert({ user_id: user.id, name: data.name, icon: data.icon, tx_type: data.tx_type })
        .select('id, name, icon, color, tx_type')
        .single()
      if (reportDbError(error, 'add category') || !row) return
      const next = [...categories, row as Category].sort((a, b) => a.tx_type.localeCompare(b.tx_type) || a.name.localeCompare(b.name))
      setCategories(next)
      setCategoryMeta(next)
      showToast('Category added', { type: 'add' })
    }
  }

  function handleDelete(cat: Category) {
    const snapshot = categories
    const next = categories.filter(c => c.id !== cat.id)
    setCategories(next)
    showToast(`${cat.name} deleted`, {
      type: 'delete',
      undo: {
        onUndo:   () => setCategories(snapshot),
        onCommit: async () => {
          const { error } = await supabase.from('categories').delete().eq('id', cat.id)
          if (reportDbError(error, 'delete category')) { setCategories(snapshot); return }
          setCategoryMeta(next)
        },
      },
    })
  }

  function section(title: string, cats: Category[]) {
    if (cats.length === 0) return null
    return (
      // Opaque rows, as on In → Accounts: a swipe must not show red through them
      <FormGroup header={`${title} · ${cats.length}`} plain>
        <div className="bg-bg-surface border border-ink/[0.06] rounded-card overflow-hidden divide-y divide-ink/[0.04]">
          {cats.map(cat => {
            const Icon = ICON_REGISTRY[cat.icon] ?? ICON_REGISTRY.LayoutGrid
            return (
              <SwipeToDelete key={cat.id} onDelete={() => handleDelete(cat)} onTap={() => { haptic('tap'); setSheet({ mode: 'edit', cat }) }}>
                <div className="flex items-center gap-3 px-4 py-3.5 bg-bg-surface">
                  <Icon size={18} strokeWidth={1.75} className={cn('flex-shrink-0', tone(cat.tx_type))} />
                  <p className="flex-1 min-w-0 text-[15px] text-ink truncate">{cat.name}</p>
                  <ChevronRight size={16} strokeWidth={2.25} className="flex-shrink-0 text-ink-faint" />
                </div>
              </SwipeToDelete>
            )
          })}
        </div>
      </FormGroup>
    )
  }

  return (
    <>
      <div className="min-h-screen bg-bg-base tab-enter pb-28">
        <div className="mx-auto w-full max-w-[640px] px-4 md:px-6">
          <div className="flex items-center gap-3 pb-2" style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
            <button
              onClick={() => router.back()}
              aria-label="Back"
              className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:scale-95 transition-transform"
            >
              <ArrowLeft size={18} strokeWidth={2} />
            </button>
            <h1 className="text-[28px] font-bold tracking-[-0.02em] text-ink">Categories</h1>
          </div>

          {loading ? (
            <div className="flex justify-center py-16"><LoadBars /></div>
          ) : (
            <>
              {section('Expense', categories.filter(c => c.tx_type === 'Expense'))}
              {section('Income', categories.filter(c => c.tx_type === 'Income'))}
              <p className="px-4 -mt-2 text-[12px] text-ink-muted">Tap to change an icon, swipe left to delete.</p>
            </>
          )}
        </div>
      </div>

      <GlobalFAB actions={[{ Icon: Plus, label: 'New Category', onTap: () => setSheet({ mode: 'add' }) }]} />

      <CategorySheet state={sheet} onClose={() => setSheet(null)} onSave={handleSave} taken={taken} />
    </>
  )
}
