'use client'

import { useEffect, useState, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, CalendarDays, Check, ChevronRight, CreditCard, LayoutGrid, Landmark } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'
import { getAppPrefs, setAppPrefs } from '@/lib/app-prefs'
import { EXPENSE_CATEGORIES } from '@/lib/data/transactions'
import { CategoryIcon } from '@/components/ui/CategoryIcon'
import type { BillingCycle } from '@/types'

interface SettingsCard { id: string; name: string; last4: string | null }
interface SettingsBank { id: string; name: string }

const BILLING_OPTIONS: BillingCycle[] = ['Weekly', 'BiWeekly', 'Monthly', 'Quarterly', 'Annual']
const BILLING_LABELS: Record<BillingCycle, string> = {
  Weekly: 'Weekly', BiWeekly: 'Bi-Weekly', Monthly: 'Monthly', Quarterly: 'Quarterly', Annual: 'Annual',
}

export default function DefaultsPage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [defaultCardId,        setDefaultCardId]        = useState<string | null>(null)
  const [defaultCardName,      setDefaultCardName]       = useState<string | null>(null)
  const [settingsCards,        setSettingsCards]         = useState<SettingsCard[]>([])
  const [settingsCardsLoading, setSettingsCardsLoading]  = useState(false)

  const [defaultBankId,        setDefaultBankId]         = useState<string | null>(null)
  const [defaultBankName,      setDefaultBankName]       = useState<string | null>(null)
  const [settingsBanks,        setSettingsBanks]         = useState<SettingsBank[]>([])
  const [settingsBanksLoading, setSettingsBanksLoading]  = useState(false)

  const [defaultExpCat,  setDefaultExpCat]  = useState<string | null>(null)
  const [defaultBilling, setDefaultBilling] = useState<BillingCycle>('Monthly')

  const [cardOpen,    setCardOpen]    = useState(false)
  const [bankOpen,    setBankOpen]    = useState(false)
  const [catOpen,     setCatOpen]     = useState(false)
  const [billingOpen, setBillingOpen] = useState(false)

  useEffect(() => {
    const p = getAppPrefs()
    setDefaultBankId(p.defaultBankId)
    setDefaultBankName(p.defaultBankName)
    setDefaultExpCat(p.defaultExpCat)
    setDefaultBilling((p.defaultBilling as BillingCycle) ?? 'Monthly')
  }, [])

  useEffect(() => {
    supabase.from('cards').select('id, name').eq('is_default', true).single()
      .then(({ data }) => { if (data) { setDefaultCardId(data.id as string); setDefaultCardName(data.name as string) } })
  }, [supabase])

  useEffect(() => {
    if (!cardOpen || settingsCards.length > 0) return
    setSettingsCardsLoading(true)
    supabase.from('cards').select('id, name, last4').order('sort_order', { ascending: true, nullsFirst: false }).order('created_at', { ascending: false })
      .then(({ data }) => { setSettingsCards((data ?? []) as SettingsCard[]); setSettingsCardsLoading(false) })
  }, [cardOpen, settingsCards.length, supabase])

  useEffect(() => {
    if (!bankOpen || settingsBanks.length > 0) return
    setSettingsBanksLoading(true)
    supabase.from('banks').select('id, name').order('created_at', { ascending: false })
      .then(({ data }) => { setSettingsBanks((data ?? []) as SettingsBank[]); setSettingsBanksLoading(false) })
  }, [bankOpen, settingsBanks.length, supabase])

  const anyOpen = cardOpen || bankOpen || catOpen || billingOpen

  useEffect(() => {
    if (!anyOpen) return
    document.documentElement.style.overflow = 'hidden'
    return () => { document.documentElement.style.overflow = '' }
  }, [anyOpen])

  async function handleSetDefaultCard(cardId: string) {
    const card = settingsCards.find(c => c.id === cardId)
    setDefaultCardId(cardId)
    setDefaultCardName(card?.name ?? null)
    setCardOpen(false)
    const { data } = await supabase.auth.getUser()
    if (!data.user) return
    await supabase.from('cards').update({ is_default: false }).eq('user_id', data.user.id)
    await supabase.from('cards').update({ is_default: true }).eq('id', cardId)
  }

  function handleSetDefaultBank(bankId: string) {
    const bank = settingsBanks.find(b => b.id === bankId)
    setDefaultBankId(bankId)
    setDefaultBankName(bank?.name ?? null)
    setBankOpen(false)
    setAppPrefs({ defaultBankId: bankId, defaultBankName: bank?.name ?? null })
  }

  function handleSetDefaultCat(cat: string) {
    setDefaultExpCat(cat || null)
    setCatOpen(false)
    setAppPrefs({ defaultExpCat: cat || null })
  }

  function handleSetDefaultBilling(cycle: BillingCycle) {
    setDefaultBilling(cycle)
    setBillingOpen(false)
    setAppPrefs({ defaultBilling: cycle })
  }

  return (
    <>
    <div className="min-h-screen bg-bg-base tab-enter pb-28">
      {/* Header */}
      <div className="px-5 pt-14 pb-6 flex items-center gap-3">
        <button
          onClick={() => router.back()}
          className="w-9 h-9 rounded-full bg-bg-overlay flex items-center justify-center flex-shrink-0 active:bg-white/[0.03]"
        >
          <ArrowLeft size={17} className="text-ink" strokeWidth={1.75} />
        </button>
        <div>
          <p className="text-[10px] font-medium tracking-[0.14em] uppercase text-gold mb-0.5">Settings</p>
          <h1 className="text-[26px] font-bold tracking-[-0.03em] text-ink leading-none">Defaults</h1>
        </div>
      </div>

      <div className="px-5 mb-4">
        <p className="text-[11px] text-ink-muted">Pre-fill form fields when adding new transactions, subscriptions, or income.</p>
      </div>

      {/* ── Expense defaults ─────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Expenses</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          <button
            onClick={() => setCardOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CreditCard size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Card</p>
              <p className="text-[11px] text-ink-muted">{defaultCardName ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>

          <button
            onClick={() => setCatOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              {defaultExpCat
                ? <CategoryIcon category={defaultExpCat} type="Expense" size={15} className="text-gold" />
                : <LayoutGrid size={15} className="text-gold" strokeWidth={1.75} />}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Category</p>
              <p className="text-[11px] text-ink-muted">{defaultExpCat ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Subscription defaults ─────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Subscriptions</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          <button
            onClick={() => setBillingOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <CalendarDays size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Billing</p>
              <p className="text-[11px] text-ink-muted">{BILLING_LABELS[defaultBilling]}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      {/* ── Income defaults ───────────────────────────────────────────────── */}
      <div className="px-5 mb-6">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-3">Income</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card overflow-hidden divide-y divide-white/[0.04]">
          <button
            onClick={() => setBankOpen(true)}
            className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]"
          >
            <div className="w-8 h-8 rounded-[10px] bg-bg-overlay ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
              <Landmark size={15} className="text-gold" strokeWidth={1.75} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[14px] font-medium text-ink">Default Bank</p>
              <p className="text-[11px] text-ink-muted">{defaultBankName ?? 'None set'}</p>
            </div>
            <ChevronRight size={16} className="text-ink-faint flex-shrink-0" strokeWidth={1.75} />
          </button>
        </div>
      </div>

      </div>

      {/* ── Default Card picker ──────────────────────────────────────────── */}
      <div
        onClick={() => setCardOpen(false)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', cardOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', cardOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Card</h2>
          <button onClick={() => setCardOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {settingsCardsLoading ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">Loading…</div>
          ) : settingsCards.length === 0 ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">No cards yet.</div>
          ) : (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              {settingsCards.map(card => (
                <button key={card.id} onClick={() => handleSetDefaultCard(card.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                    <CreditCard size={14} className="text-gold" strokeWidth={1.75} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[14px] font-medium text-ink truncate">{card.name}</p>
                    {card.last4 && <p className="text-[11px] text-ink-muted">····{card.last4}</p>}
                  </div>
                  {card.id === defaultCardId && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center flex-shrink-0"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Default Category picker ──────────────────────────────────────── */}
      <div
        onClick={() => setCatOpen(false)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', catOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', catOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Category</h2>
          <button onClick={() => setCatOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
            <button onClick={() => handleSetDefaultCat('')}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]">
              <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                <LayoutGrid size={14} className="text-ink-faint" strokeWidth={1.75} />
              </div>
              <div className="flex-1"><p className="text-[14px] font-medium text-ink-muted">None</p></div>
              {!defaultExpCat && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
            </button>
            {EXPENSE_CATEGORIES.map(cat => (
              <button key={cat.name} onClick={() => handleSetDefaultCat(cat.name)}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]">
                <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0">
                  <CategoryIcon category={cat.name} type="Expense" size={14} className="text-gold" />
                </div>
                <div className="flex-1 min-w-0"><p className="text-[14px] font-medium text-ink truncate">{cat.name}</p></div>
                {cat.name === defaultExpCat && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Default Billing picker ───────────────────────────────────────── */}
      <div
        onClick={() => setBillingOpen(false)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', billingOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', billingOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Billing</h2>
          <button onClick={() => setBillingOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
            {BILLING_OPTIONS.map(opt => (
              <button key={opt} onClick={() => handleSetDefaultBilling(opt)}
                className="w-full flex items-center justify-between px-4 py-3.5 text-left active:bg-white/[0.03]">
                <p className="text-[14px] font-medium text-ink">{BILLING_LABELS[opt]}</p>
                {opt === defaultBilling && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Default Bank picker ──────────────────────────────────────────── */}
      <div
        onClick={() => setBankOpen(false)}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', bankOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', bankOpen ? 'translate-y-0' : 'translate-y-full')}
        style={{ willChange: 'transform', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex justify-center pt-3 pb-1"><div className="w-9 h-1 rounded-full bg-white/20" /></div>
        <div className="flex items-center justify-between px-5 mb-4">
          <h2 className="text-[18px] font-bold text-ink">Default Bank</h2>
          <button onClick={() => setBankOpen(false)} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>
        <div className="px-5 overflow-y-auto" style={{ maxHeight: '60vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 32px)' }}>
          {settingsBanksLoading ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">Loading…</div>
          ) : settingsBanks.length === 0 ? (
            <div className="py-10 text-center text-ink-faint text-[13px]">No banks yet — add one in the In tab.</div>
          ) : (
            <div className="bg-bg-overlay border border-white/[0.06] rounded-[18px] overflow-hidden divide-y divide-white/[0.04]">
              <button
                onClick={() => { setDefaultBankId(null); setDefaultBankName(null); setBankOpen(false); setAppPrefs({ defaultBankId: null, defaultBankName: null }) }}
                className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]"
              >
                <div className="flex-1"><p className="text-[14px] font-medium text-ink-muted">None</p></div>
                {defaultBankId === null && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
              </button>
              {settingsBanks.map(bank => (
                <button key={bank.id} onClick={() => handleSetDefaultBank(bank.id)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-white/[0.03]">
                  <div className="w-8 h-8 rounded-[10px] bg-bg-surface ring-1 ring-white/[0.06] flex items-center justify-center flex-shrink-0"><Landmark size={15} className="text-ink-muted" strokeWidth={1.75} /></div>
                  <div className="flex-1 min-w-0"><p className="text-[14px] font-medium text-ink truncate">{bank.name}</p></div>
                  {bank.id === defaultBankId && <div className="w-5 h-5 rounded-full gradient-gold flex items-center justify-center"><Check size={9} className="text-white" strokeWidth={2.5} /></div>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  )
}
