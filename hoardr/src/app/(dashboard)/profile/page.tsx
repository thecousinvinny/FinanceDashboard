'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Camera, Check, Settings2, Pencil } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn, $f, $fk, $fd, haptic } from '@/lib/utils'
import { getCategoryIcon } from '@/components/ui/CategoryIcon'

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExpRow { cost: number; savings: number; date: string; name: string; categories: unknown }
interface IncRow { amount: number; source: string | null; date: string; name: string | null }
interface SubRow { name: string; monthly_cost: number; annual_cost: number }
interface BarData { label: string; income: number; expense: number }
interface SimpleBar { label: string; value: number }
interface PillItem  { name: string; value: number; display: string }
interface CatItem   { name: string; total: number; pct: number }

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ─── Shared: simple from-bottom bar chart ────────────────────────────────────

function SimpleBars({ bars, active, color, sparse }: {
  bars: SimpleBar[]; active: boolean; color: string; sparse?: boolean
}) {
  const [anim, setAnim] = useState(false)
  const max = useMemo(() => Math.max(...bars.map(b => b.value), 1), [bars])
  const H   = 72

  const labelIdx = useMemo(() => {
    if (!sparse) return bars.map((_, i) => i)
    const last = bars.length - 1
    return [...new Set([0, 6, 13, 20, last].filter(i => i <= last))]
  }, [bars, sparse])

  useEffect(() => {
    if (!active) { setAnim(false); return }
    const t = setTimeout(() => setAnim(true), 60)
    return () => clearTimeout(t)
  }, [active])

  return (
    <div>
      <div className="flex items-end gap-px" style={{ height: H }}>
        {bars.map((b, i) => (
          <div key={i} className="flex-1 rounded-t-[2px]" style={{
            height:     anim ? Math.max((b.value / max) * H, b.value > 0 ? 2 : 0) : 0,
            background: color,
            transition: `height 450ms cubic-bezier(0.22,1,0.36,1) ${i * 11}ms`,
          }} />
        ))}
      </div>
      <div className="flex mt-1">
        {bars.map((b, i) => (
          <div key={i} className="flex-1 text-center">
            {labelIdx.includes(i) && <span className="text-[8px] text-ink-faint">{b.label}</span>}
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Shared: category pill bars ───────────────────────────────────────────────

function CategoryPills({ cats, active }: { cats: CatItem[]; active: boolean }) {
  const [animPcts, setAnimPcts] = useState<number[]>(cats.map(() => 0))

  useEffect(() => {
    if (!active) { setAnimPcts(cats.map(() => 0)); return }
    const timers = cats.map((_, i) =>
      setTimeout(() => setAnimPcts(prev => {
        const next = [...prev]; next[i] = cats[i].pct; return next
      }), 60 + i * 90),
    )
    return () => timers.forEach(clearTimeout)
  }, [cats, active])

  if (cats.length === 0) return <p className="text-[12px] text-ink-faint text-center py-4">No data</p>

  return (
    <div className="space-y-2.5">
      {cats.map((cat, i) => {
        const Icon = getCategoryIcon(cat.name, 'Expense')
        return (
          <div key={cat.name} className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center rounded-[8px] overflow-hidden"
              style={{ height: 32, background: '#1C1F22' }}>
              <div className="absolute inset-y-0 left-0 rounded-[8px]" style={{
                width: `${animPcts[i] ?? 0}%`,
                background: 'linear-gradient(90deg, rgba(212,175,55,0.35), rgba(212,175,55,0.10))',
                transition: `width 600ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms`,
              }} />
              <div className="relative flex items-center gap-2 px-2.5 z-10">
                <Icon size={13} className="text-gold flex-shrink-0" strokeWidth={1.75} />
                <span className="text-[12px] font-medium text-ink truncate">{cat.name}</span>
              </div>
            </div>
            <span className="text-[12px] font-semibold font-mono text-ink-muted w-12 text-right flex-shrink-0">
              {$fk(cat.total)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

// ─── Shared: generic pill bars (subs / income sources) ───────────────────────

function CostPills({ items, active }: { items: PillItem[]; active: boolean }) {
  const maxVal = useMemo(() => Math.max(...items.map(i => i.value), 1), [items])
  const [animPcts, setAnimPcts] = useState<number[]>([])

  useEffect(() => {
    setAnimPcts(items.map(() => 0))
    if (!active) return
    const timers = items.map((item, i) =>
      setTimeout(() => setAnimPcts(prev => {
        const next = [...prev]; next[i] = (item.value / maxVal) * 100; return next
      }), 60 + i * 80),
    )
    return () => timers.forEach(clearTimeout)
  }, [active, items, maxVal])

  if (items.length === 0) return <p className="text-[12px] text-ink-faint text-center py-4">No data</p>

  return (
    <div className="space-y-2">
      {items.map((item, i) => (
        <div key={item.name + i} className="flex items-center gap-2">
          <div className="relative flex-1 flex items-center rounded-[8px] overflow-hidden"
            style={{ height: 30, background: '#1C1F22' }}>
            <div className="absolute inset-y-0 left-0 rounded-[8px]" style={{
              width: `${animPcts[i] ?? 0}%`,
              background: 'linear-gradient(90deg, rgba(212,175,55,0.35), rgba(212,175,55,0.10))',
              transition: `width 600ms cubic-bezier(0.22,1,0.36,1) ${i * 80}ms`,
            }} />
            <span className="relative px-2.5 text-[12px] font-medium text-ink z-10 truncate">{item.name}</span>
          </div>
          <span className="text-[12px] font-semibold font-mono text-ink-muted w-14 text-right flex-shrink-0">
            {item.display}
          </span>
        </div>
      ))}
    </div>
  )
}

// ─── Shared: Month / Annual swipeable card ────────────────────────────────────

function MonthAnnualCard({ label, monthStat, annualStat, renderMonth, renderAnnual }: {
  label:        string
  monthStat?:   string
  annualStat?:  string
  renderMonth:  (active: boolean) => React.ReactNode
  renderAnnual: (active: boolean) => React.ReactNode
}) {
  const [view, setView] = useState<0 | 1>(0)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    let sx = 0, sy = 0
    const onStart = (e: TouchEvent) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY }
    const onEnd   = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - sx
      const dy = e.changedTouches[0].clientY - sy
      if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy) * 1.5) {
        if (dx < 0 && view === 0) setView(1)
        if (dx > 0 && view === 1) setView(0)
      }
    }
    el.addEventListener('touchstart', onStart, { passive: true })
    el.addEventListener('touchend',   onEnd,   { passive: true })
    return () => { el.removeEventListener('touchstart', onStart); el.removeEventListener('touchend', onEnd) }
  }, [view])

  const stat = view === 0 ? monthStat : annualStat

  return (
    <div ref={ref} className="bg-bg-surface border border-white/[0.06] rounded-card p-4">
      <div className="flex items-center gap-2 mb-4">
        <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gold">{label}</p>
        <div className="flex gap-1.5 ml-auto items-center">
          {(['Month', 'Annual'] as const).map((l, i) => (
            <button key={l} onClick={() => setView(i as 0 | 1)}
              className={cn('px-3 py-1 rounded-full text-[11px] font-semibold transition-colors',
                view === i ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
              {l}
            </button>
          ))}
        </div>
        {stat && <span className="text-[14px] font-bold font-mono text-ink ml-2">{stat}</span>}
      </div>

      <div style={{ overflow: 'hidden' }}>
        <div style={{
          display:    'flex',
          width:      '200%',
          transform:  `translateX(${view === 0 ? 0 : -50}%)`,
          transition: 'transform 320ms cubic-bezier(0.4,0,0.2,1)',
        }}>
          <div style={{ width: '50%' }}>{renderMonth(view === 0)}</div>
          <div style={{ width: '50%' }}>{renderAnnual(view === 1)}</div>
        </div>
      </div>

      <div className="flex justify-center gap-1.5 mt-3">
        {[0, 1].map(i => (
          <div key={i} className="rounded-full transition-all duration-300" style={{
            width:      view === i ? 14 : 5,
            height:     5,
            background: view === i ? '#D4AF37' : 'rgba(255,255,255,0.2)',
          }} />
        ))}
      </div>
    </div>
  )
}

// ─── Mirrored sparklines — income up, spending down, shared center axis ───────

// ─── Hero Cashflow Chart ─────────────────────────────────────────────────────

const HERO_PL    = 30   // left: period label column
const HERO_PR    = 52   // right: amounts column
const HERO_PT    = 6    // top padding
const HERO_PB    = 6    // bottom padding
const HERO_ROW_H = 26   // height per period row
const HERO_BAR_H = 8    // individual bar height
const HERO_BAR_G = 4    // gap between income and expense bars

function drawHeroBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number,
  roundL: boolean, roundR: boolean,
) {
  if (h < 1 || w < 1) return
  const r  = Math.min(h / 2, 4)
  const rl = roundL ? r : 0
  const rr = roundR ? r : 0
  ctx.beginPath()
  ctx.moveTo(x + rl, y)
  ctx.lineTo(x + w - rr, y)
  if (rr > 0) ctx.arcTo(x + w, y,     x + w,      y + rr,     rr)
  ctx.lineTo(x + w, y + h - rr)
  if (rr > 0) ctx.arcTo(x + w, y + h, x + w - rr, y + h,      rr)
  ctx.lineTo(x + rl, y + h)
  if (rl > 0) ctx.arcTo(x,     y + h, x,           y + h - rl, rl)
  ctx.lineTo(x, y + rl)
  if (rl > 0) ctx.arcTo(x,     y,     x + rl,      y,          rl)
  ctx.closePath()
}

function heroFmt(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1000) return `$${Number((abs / 1000).toFixed(abs % 1000 === 0 ? 0 : 1))}K`
  return `$${Math.round(abs)}`
}

function heroYMax(data: BarData[]): number {
  const max = Math.max(...data.map(b => Math.max(b.income, b.expense)), 1)
  const mag = Math.pow(10, Math.floor(Math.log10(max)))
  return Math.ceil(max / mag) * mag
}

function heroWidths(data: BarData[], yMax: number): number[] {
  return data.flatMap(b => {
    const incF  = yMax > 0 ? b.income  / yMax : 0
    const expF  = yMax > 0 ? b.expense / yMax : 0
    const baseF = Math.min(incF, expF)
    return [baseF, incF - baseF, baseF, expF - baseF]
    // [incBase, incCap (net gain), expBase, expCap (net loss)]
  })
}

function heroEase(t: number) { return 1 - Math.pow(1 - t, 4) }

function HeroSplitBarChart({ monthly, annual }: {
  monthly: BarData[]
  annual:  BarData[]
}) {
  const [toggle, setToggle] = useState<0 | 1>(0)
  const canvasRef      = useRef<HTMLCanvasElement>(null)
  const containerRef   = useRef<HTMLDivElement>(null)
  const cardRef        = useRef<HTMLDivElement>(null)
  const animRef        = useRef<number | null>(null)
  const animWRef       = useRef<number[]>([])
  const scrubRowRef    = useRef<number | null>(null)
  const barsRef        = useRef<BarData[]>(monthly)
  const toggleRef      = useRef<0 | 1>(0)
  const gestureModeRef = useRef<'undecided' | 'scrolling' | 'swiping' | 'scrubbing'>('undecided')
  const touchStartRef  = useRef<{ x: number; y: number } | null>(null)
  const scrubTimerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)

  const redraw = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const W    = container.clientWidth || 300
    const data = barsRef.current
    const N    = data.length
    if (N === 0) return
    const FULL_H = N * HERO_ROW_H + HERO_PT + HERO_PB
    const dpr    = window.devicePixelRatio || 1
    const tw = Math.round(W * dpr), th = Math.round(FULL_H * dpr)
    if (canvas.width !== tw || canvas.height !== th) {
      canvas.width = tw; canvas.height = th; canvas.style.height = `${FULL_H}px`
    }

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.clearRect(0, 0, W, FULL_H)

    const widths  = animWRef.current
    const chartW  = W - HERO_PL - HERO_PR
    const hov     = scrubRowRef.current

    for (let gi = 0; gi < N; gi++) {
      const b       = data[gi]
      const rowY    = HERO_PT + gi * HERO_ROW_H
      const incBaseW = Math.max(0, widths[gi * 4 + 0] ?? 0) * chartW
      const incCapW  = Math.max(0, widths[gi * 4 + 1] ?? 0) * chartW
      const expBaseW = Math.max(0, widths[gi * 4 + 2] ?? 0) * chartW
      const expCapW  = Math.max(0, widths[gi * 4 + 3] ?? 0) * chartW
      const net      = b.income - b.expense
      const isHov    = hov === gi
      const incBarY  = rowY + (HERO_ROW_H - HERO_BAR_H * 2 - HERO_BAR_G) / 2
      const expBarY  = incBarY + HERO_BAR_H + HERO_BAR_G

      // Row highlight
      if (isHov) {
        ctx.fillStyle = 'rgba(201,168,76,0.07)'
        ctx.fillRect(0, rowY, W, HERO_ROW_H)
      }

      // Period label
      ctx.font         = `${isHov ? '600 ' : ''}10px -apple-system,system-ui,sans-serif`
      ctx.fillStyle    = isHov ? '#C9A84C' : '#455060'
      ctx.textAlign    = 'right'
      ctx.textBaseline = 'middle'
      ctx.fillText(b.label, HERO_PL - 4, rowY + HERO_ROW_H / 2)

      // Income bar: base (teal) + net-gain cap (green)
      if (incBaseW > 0.5) {
        const g = ctx.createLinearGradient(HERO_PL, 0, HERO_PL + incBaseW, 0)
        g.addColorStop(0, 'rgba(45,212,191,0.9)'); g.addColorStop(1, 'rgba(45,212,191,0.55)')
        ctx.fillStyle = g
        drawHeroBar(ctx, HERO_PL, incBarY, incBaseW, HERO_BAR_H, true, incCapW <= 0.5)
        ctx.fill()
      }
      if (incCapW > 0.5) {
        const g = ctx.createLinearGradient(HERO_PL + incBaseW, 0, HERO_PL + incBaseW + incCapW, 0)
        g.addColorStop(0, 'rgba(52,211,153,0.95)'); g.addColorStop(1, 'rgba(16,185,129,1.0)')
        ctx.fillStyle = g
        drawHeroBar(ctx, HERO_PL + incBaseW, incBarY, incCapW, HERO_BAR_H, incBaseW <= 0.5, true)
        ctx.fill()
      }

      // Expense bar: base (gold) + net-loss cap (ink/white)
      if (expBaseW > 0.5) {
        const g = ctx.createLinearGradient(HERO_PL, 0, HERO_PL + expBaseW, 0)
        g.addColorStop(0, 'rgba(201,168,76,0.9)'); g.addColorStop(1, 'rgba(201,168,76,0.55)')
        ctx.fillStyle = g
        drawHeroBar(ctx, HERO_PL, expBarY, expBaseW, HERO_BAR_H, true, expCapW <= 0.5)
        ctx.fill()
      }
      if (expCapW > 0.5) {
        const g = ctx.createLinearGradient(HERO_PL + expBaseW, 0, HERO_PL + expBaseW + expCapW, 0)
        g.addColorStop(0, 'rgba(240,240,248,0.85)'); g.addColorStop(1, 'rgba(240,240,248,0.4)')
        ctx.fillStyle = g
        drawHeroBar(ctx, HERO_PL + expBaseW, expBarY, expCapW, HERO_BAR_H, expBaseW <= 0.5, true)
        ctx.fill()
      }

      // Right column: net normally; income + expense when hovered
      ctx.textBaseline = 'middle'
      ctx.textAlign    = 'right'
      if (isHov) {
        ctx.font      = '9px -apple-system,system-ui,sans-serif'
        ctx.fillStyle = 'rgba(45,212,191,0.9)'
        ctx.fillText(`+${heroFmt(b.income)}`, W - 4, incBarY + HERO_BAR_H / 2)
        ctx.fillStyle = 'rgba(201,168,76,0.9)'
        ctx.fillText(`−${heroFmt(b.expense)}`, W - 4, expBarY + HERO_BAR_H / 2)
      } else {
        ctx.font      = '9px -apple-system,system-ui,sans-serif'
        ctx.fillStyle = net >= 0 ? 'rgba(74,222,128,0.65)' : 'rgba(240,240,248,0.65)'
        ctx.fillText(`${net >= 0 ? '+' : '−'}${heroFmt(Math.abs(net))}`, W - 4, rowY + HERO_ROW_H / 2)
      }
    }
  }, [])

  useEffect(() => {
    const data = toggle === 0 ? monthly : annual
    barsRef.current  = data
    const yMax   = heroYMax(data)
    const target = heroWidths(data, yMax)
    const from   = new Array(target.length).fill(0)
    animWRef.current = [...from]
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const t0 = performance.now()
    function tick(now: number) {
      const t = Math.min((now - t0) / 400, 1), ease = heroEase(t)
      for (let i = 0; i < target.length; i++) animWRef.current[i] = from[i] + (target[i] - from[i]) * ease
      redraw()
      if (t < 1) animRef.current = requestAnimationFrame(tick)
      else animRef.current = null
    }
    animRef.current = requestAnimationFrame(tick)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current) }
  }, [toggle, monthly, annual, redraw])

  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const ro = new ResizeObserver(() => redraw())
    ro.observe(el)
    return () => ro.disconnect()
  }, [redraw])

  useEffect(() => { toggleRef.current = toggle }, [toggle])

  useEffect(() => {
    const card = cardRef.current
    const cont = containerRef.current
    if (!card || !cont) return

    const getRow = (clientY: number) => {
      const rect = cont.getBoundingClientRect()
      const relY = clientY - rect.top - HERO_PT
      const idx  = Math.floor(relY / HERO_ROW_H)
      const N    = barsRef.current.length
      return idx >= 0 && idx < N ? idx : null
    }

    const onTS = (e: TouchEvent) => {
      gestureModeRef.current = 'undecided'
      const t = e.touches[0]
      touchStartRef.current = { x: t.clientX, y: t.clientY }
      scrubTimerRef.current = setTimeout(() => {
        if (gestureModeRef.current === 'undecided') {
          gestureModeRef.current = 'scrubbing'
          scrubRowRef.current = getRow(t.clientY)
          haptic('tap')
          redraw()
        }
      }, 300)
    }

    const onTM = (e: TouchEvent) => {
      const start = touchStartRef.current
      if (!start) return
      const t   = e.touches[0]
      const dx  = t.clientX - start.x
      const dy  = t.clientY - start.y
      const adx = Math.abs(dx), ady = Math.abs(dy)

      if (gestureModeRef.current === 'undecided') {
        if (adx > 8 && adx > ady) {
          gestureModeRef.current = 'swiping'
          if (scrubTimerRef.current) { clearTimeout(scrubTimerRef.current); scrubTimerRef.current = null }
        } else if (ady > 8 && ady > adx) {
          gestureModeRef.current = 'scrolling'
          if (scrubTimerRef.current) { clearTimeout(scrubTimerRef.current); scrubTimerRef.current = null }
        }
      }

      if (gestureModeRef.current === 'scrubbing') {
        e.preventDefault()
        scrubRowRef.current = getRow(t.clientY)
        redraw()
      } else if (gestureModeRef.current === 'swiping') {
        e.preventDefault()
      }
    }

    const onTE = (e: TouchEvent) => {
      if (scrubTimerRef.current) { clearTimeout(scrubTimerRef.current); scrubTimerRef.current = null }
      const mode  = gestureModeRef.current
      const start = touchStartRef.current
      if (mode === 'swiping' && start) {
        const dx = e.changedTouches[0].clientX - start.x
        if (dx < -40 && toggleRef.current === 0) setToggle(1)
        else if (dx > 40 && toggleRef.current === 1) setToggle(0)
      }
      if (mode === 'scrubbing') {
        scrubRowRef.current = null
        redraw()
      }
      gestureModeRef.current = 'undecided'
      touchStartRef.current  = null
    }

    const onMM = (e: MouseEvent) => { scrubRowRef.current = getRow(e.clientY); redraw() }
    const onML = () => { scrubRowRef.current = null; redraw() }

    card.addEventListener('touchstart',  onTS, { passive: true  })
    card.addEventListener('touchmove',   onTM, { passive: false })
    card.addEventListener('touchend',    onTE, { passive: true  })
    card.addEventListener('touchcancel', onTE, { passive: true  })
    cont.addEventListener('mousemove',  onMM)
    cont.addEventListener('mouseleave', onML)
    return () => {
      card.removeEventListener('touchstart',  onTS)
      card.removeEventListener('touchmove',   onTM)
      card.removeEventListener('touchend',    onTE)
      card.removeEventListener('touchcancel', onTE)
      cont.removeEventListener('mousemove',  onMM)
      cont.removeEventListener('mouseleave', onML)
      if (scrubTimerRef.current) clearTimeout(scrubTimerRef.current)
    }
  }, [redraw])

  const activeBars = toggle === 0 ? monthly : annual
  const netTotal   = activeBars.reduce((s, b) => s + b.income - b.expense, 0)

  return (
    <div className="px-5 mb-6">
      <div ref={cardRef} className="select-none"
        style={{
          background: 'var(--color-bg-surface)', borderRadius: 16,
          border: '0.5px solid rgba(201,168,76,0.25)',
          boxShadow: 'inset 0 0 20px rgba(201,168,76,0.05)', padding: 16,
          WebkitUserSelect: 'none', WebkitTouchCallout: 'none',
        } as React.CSSProperties}>
        {/* Header */}
        <div className="flex items-center gap-2 mb-4">
          <p className="text-[10px] font-semibold tracking-[0.12em] uppercase text-gold">Cashflow</p>
          <div className="flex gap-1.5 ml-auto items-center">
            {(['Monthly', 'Annual'] as const).map((lbl, i) => (
              <button key={lbl} onClick={() => setToggle(i as 0 | 1)}
                className={cn('px-3 py-1 rounded-full text-[11px] font-semibold transition-colors select-none',
                  toggle === i ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-muted')}>
                {lbl}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
          {[
            { bg: 'rgba(45,212,191,0.88)', label: 'Income'   },
            { bg: 'rgba(201,168,76,0.88)', label: 'Expenses' },
            { bg: 'rgba(16,185,129,0.95)',  label: 'Net gain' },
            { bg: 'rgba(240,240,248,0.75)', label: 'Net loss' },
          ].map(item => (
            <div key={item.label} className="flex items-center gap-1">
              <div style={{ width: 8, height: 8, borderRadius: 2, background: item.bg, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#556070' }}>{item.label}</span>
            </div>
          ))}
          <div className="ml-auto flex flex-col items-end" style={{ gap: 1 }}>
            <span style={{ fontSize: 9, color: '#556070', letterSpacing: '0.06em', textTransform: 'uppercase' }}>Net This Period</span>
            <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'var(--font-big-shoulders)', color: netTotal >= 0 ? '#4ADE80' : '#f0f0f8' }}>
              {netTotal >= 0 ? '+' : '−'}{heroFmt(Math.abs(netTotal))}
            </span>
          </div>
        </div>

        {/* Canvas */}
        <div ref={containerRef} style={{ width: '100%' }}>
          <canvas ref={canvasRef} style={{ width: '100%', display: 'block' }} />
        </div>

        {/* Dot indicator */}
        <div className="flex justify-center gap-1.5 mt-3">
          {([0, 1] as const).map(i => (
            <div key={i} className="rounded-full transition-all duration-300" style={{
              width:      toggle === i ? 14 : 5,
              height:     5,
              background: toggle === i ? '#D4AF37' : 'rgba(255,255,255,0.2)',
            }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function StatTile({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="bg-bg-overlay rounded-[16px] p-3.5">
      <p className="text-[9px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-1">{label}</p>
      <p className="text-[22px] font-bold text-ink leading-none"
        style={{ fontFamily: 'var(--font-big-shoulders)', color: color ?? 'inherit' }}>{value}</p>
    </div>
  )
}

function Row({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-white/[0.04] last:border-0">
      <div>
        <p className="text-[14px] font-medium text-ink">{label}</p>
        {sub && <p className="text-[11px] text-ink-muted">{sub}</p>}
      </div>
      <p className={cn('text-[15px] font-semibold font-mono', accent ? 'text-emerald' : 'text-ink')}>{value}</p>
    </div>
  )
}

function catItems(expenses: ExpRow[], filter: (e: ExpRow) => boolean): CatItem[] {
  const map = new Map<string, number>()
  expenses.filter(filter).forEach(e => {
    const cat = (e.categories as { name: string } | null)?.name ?? 'Other'
    map.set(cat, (map.get(cat) ?? 0) + e.cost)
  })
  const sorted = [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5)
  const top1   = sorted[0]?.[1] ?? 1
  return sorted.map(([name, total]) => ({ name, total, pct: (total / top1) * 100 }))
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  // User
  const [userId,       setUserId]       = useState<string | null>(null)
  const [email,        setEmail]        = useState<string | null>(null)
  const [googleAvatar, setGoogleAvatar] = useState<string | null>(null)
  const [customAvatar, setCustomAvatar] = useState<string | null>(null)
  const [displayName,  setDisplayName]  = useState<string | null>(null)
  const [editingName,  setEditingName]  = useState(false)
  const [nameInput,    setNameInput]    = useState('')
  const [uploading,    setUploading]    = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const nameInputRef = useRef<HTMLInputElement>(null)

  // Data
  const [expenses, setExpenses] = useState<ExpRow[]>([])
  const [income,   setIncome]   = useState<IncRow[]>([])
  const [subs,     setSubs]     = useState<SubRow[]>([])
  const [netWorth, setNetWorth] = useState(0)
  const [loading,  setLoading]  = useState(true)

  // ── Load user ──────────────────────────────────────────────────────────────

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      setUserId(u.id)
      setEmail(u.email ?? null)
      setGoogleAvatar(u.user_metadata?.avatar_url ?? u.user_metadata?.picture ?? null)
      const metaName = u.user_metadata?.full_name ?? u.user_metadata?.name ?? null
      setDisplayName(prev => prev ?? metaName)
    })
  }, [supabase])

  useEffect(() => {
    supabase.from('profiles').select('display_name, avatar_url').single().then(({ data }) => {
      if (data?.display_name) setDisplayName(data.display_name as string)
      if (data?.avatar_url)   setCustomAvatar(data.avatar_url as string)
    })
  }, [supabase])

  // ── Load financial data ────────────────────────────────────────────────────

  const loadGen  = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

  const loadData = useCallback(async () => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const gen = ++loadGen.current
    try {
      const [bRes, eRes, iRes, sRes] = await Promise.all([
        supabase.from('banks').select('balance').abortSignal(ctrl.signal),
        supabase.from('expenses').select('cost, savings, date, name, categories(name)').limit(5000).abortSignal(ctrl.signal),
        supabase.from('income').select('amount, source, date, name').limit(5000).abortSignal(ctrl.signal),
        supabase.from('subscriptions').select('name, monthly_cost, annual_cost').eq('status', 'Active').limit(200).abortSignal(ctrl.signal),
      ])
      if (gen !== loadGen.current) return
      if (bRes.error) console.error('[Profile] banks:',   bRes.error)
      if (eRes.error) console.error('[Profile] expenses:', eRes.error)
      if (iRes.error) console.error('[Profile] income:',  iRes.error)
      if (sRes.error) console.error('[Profile] subs:',    sRes.error)
      const banks = (bRes.data ?? []) as { balance: number }[]
      setNetWorth(banks.reduce((s, b) => s + ((b.balance as number) ?? 0), 0))
      setExpenses((eRes.data ?? []) as ExpRow[])
      setIncome((iRes.data ?? []) as IncRow[])
      setSubs((sRes.data ?? []) as SubRow[])
      setLoading(false)
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return
      console.error('[Profile] loadData:', err)
      setLoading(false)
    }
  }, [supabase])

  useEffect(() => {
    loadData()
    return () => { loadGen.current++; abortRef.current?.abort() }
  }, [loadData])

  // ── Name editing ───────────────────────────────────────────────────────────

  function startEditName() {
    setNameInput(displayName ?? '')
    setEditingName(true)
    setTimeout(() => nameInputRef.current?.focus(), 50)
  }

  async function saveName() {
    const trimmed = nameInput.trim()
    setEditingName(false)
    if (!trimmed || trimmed === displayName || !userId) return
    setDisplayName(trimmed)
    await supabase.from('profiles').update({ display_name: trimmed }).eq('id', userId)
  }

  // ── Avatar upload ──────────────────────────────────────────────────────────

  async function handleAvatarFile(file: File) {
    if (!file.type.startsWith('image/') || !userId) return
    setUploading(true)
    try {
      const bitmap = await createImageBitmap(file)
      const canvas = document.createElement('canvas')
      canvas.width = 400; canvas.height = 400
      const ctx = canvas.getContext('2d')!
      const s = Math.min(bitmap.width, bitmap.height)
      ctx.drawImage(bitmap, (bitmap.width - s) / 2, (bitmap.height - s) / 2, s, s, 0, 0, 400, 400)
      const blob = await new Promise<Blob>(res => canvas.toBlob(b => res(b!), 'image/jpeg', 0.88))
      const path = `${userId}/avatar.jpg`
      const { error } = await supabase.storage.from('avatars').upload(path, blob, { upsert: true, contentType: 'image/jpeg' })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('avatars').getPublicUrl(path)
      setCustomAvatar(`${publicUrl}?t=${Date.now()}`)
      await supabase.from('profiles').update({ avatar_url: publicUrl }).eq('id', userId)
    } catch (e) { console.error('Avatar upload failed', e) }
    finally    { setUploading(false) }
  }

  // ── Derived analytics ──────────────────────────────────────────────────────

  const now    = useMemo(() => new Date(), [])
  const moKey  = useMemo(() =>
    `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`, [now])
  const lmKey  = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [now])
  const yr12Key = useMemo(() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  }, [now])

  const moExp    = useMemo(() => expenses.filter(e => e.date.startsWith(moKey)), [expenses, moKey])
  const moInc    = useMemo(() => income.filter(i => i.date.startsWith(moKey)),   [income,   moKey])
  const lmExp    = useMemo(() => expenses.filter(e => e.date.startsWith(lmKey)), [expenses, lmKey])

  const moSpend     = useMemo(() => moExp.reduce((s, e) => s + e.cost,    0), [moExp])
  const moIncAmt    = useMemo(() => moInc.reduce((s, i) => s + i.amount,  0), [moInc])
  const moCashflow  = moIncAmt - moSpend
  const lmSpend     = useMemo(() => lmExp.reduce((s, e) => s + e.cost,    0), [lmExp])
  const spendTrend  = lmSpend > 0 ? ((moSpend - lmSpend) / lmSpend) * 100 : 0

  const allTimeSpent   = useMemo(() => expenses.reduce((s, e) => s + e.cost,           0), [expenses])
  const allTimeSavings = useMemo(() => expenses.reduce((s, e) => s + (e.savings ?? 0), 0), [expenses])
  const savingsRate    = moIncAmt > 0 ? Math.max(0, ((moIncAmt - moSpend) / moIncAmt) * 100) : 0

  const avgMonthlySpend = useMemo(() => {
    const monthly = new Map<string, number>()
    expenses.forEach(e => { const k = e.date.slice(0, 7); monthly.set(k, (monthly.get(k) ?? 0) + e.cost) })
    if (monthly.size === 0) return 0
    return [...monthly.values()].reduce((s, v) => s + v, 0) / monthly.size
  }, [expenses])

  const bestIncomeSource = useMemo(() => {
    const map = new Map<string, number>()
    income.forEach(i => { const k = i.name || i.source || 'Other'; map.set(k, (map.get(k) ?? 0) + i.amount) })
    return [...map.entries()].sort((a, b) => b[1] - a[1])[0] ?? null
  }, [income])

  // ── Chart data ─────────────────────────────────────────────────────────────

  const monthBars = useMemo<BarData[]>(() => {
    const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
    return Array.from({ length: days }, (_, idx) => {
      const date = `${moKey}-${String(idx + 1).padStart(2, '0')}`
      const inc  = income.filter(i => i.date === date).reduce((s, i) => s + i.amount, 0)
      const exp  = expenses.filter(e => e.date === date).reduce((s, e) => s + e.cost, 0)
      return { label: String(idx + 1), income: inc, expense: exp }
    })
  }, [expenses, income, moKey, now])

  const annualBars = useMemo<BarData[]>(() =>
    Array.from({ length: 12 }, (_, idx) => {
      const d   = new Date(now.getFullYear(), now.getMonth() - 11 + idx, 1)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      const inc = income.filter(i => i.date.startsWith(key)).reduce((s, i) => s + i.amount, 0)
      const exp = expenses.filter(e => e.date.startsWith(key)).reduce((s, e) => s + e.cost, 0)
      return { label: MONTH_NAMES[d.getMonth()], income: inc, expense: exp }
    })
  , [expenses, income, now])

  // Expenses bars
  const moExpBars  = useMemo<SimpleBar[]>(() => monthBars.map(b => ({ label: b.label, value: b.expense })), [monthBars])
  const annExpBars = useMemo<SimpleBar[]>(() => annualBars.map(b => ({ label: b.label, value: b.expense })), [annualBars])
  const annExpTotal = useMemo(() => annExpBars.reduce((s, b) => s + b.value, 0), [annExpBars])

  // Income bars
  const moIncBars  = useMemo<SimpleBar[]>(() => monthBars.map(b => ({ label: b.label, value: b.income })), [monthBars])
  const annIncBars = useMemo<SimpleBar[]>(() => annualBars.map(b => ({ label: b.label, value: b.income })), [annualBars])
  const annIncTotal = useMemo(() => annIncBars.reduce((s, b) => s + b.value, 0), [annIncBars])

  // Categories
  const moCats  = useMemo(() => catItems(expenses, e => e.date.startsWith(moKey)),    [expenses, moKey])
  const annCats = useMemo(() => catItems(expenses, e => e.date.slice(0,7) >= yr12Key), [expenses, yr12Key])

  // Subscriptions
  const subsSortedMo  = useMemo<PillItem[]>(() =>
    [...subs].sort((a, b) => b.monthly_cost - a.monthly_cost).slice(0, 5)
      .map(s => ({ name: s.name, value: s.monthly_cost, display: $fd(s.monthly_cost) }))
  , [subs])
  const subsSortedAnn = useMemo<PillItem[]>(() =>
    [...subs].sort((a, b) => b.annual_cost - a.annual_cost).slice(0, 5)
      .map(s => ({ name: s.name, value: s.annual_cost, display: $fd(s.annual_cost) }))
  , [subs])
  const totalSubMo  = useMemo(() => subs.reduce((s, sub) => s + sub.monthly_cost, 0), [subs])
  const totalSubAnn = useMemo(() => subs.reduce((s, sub) => s + sub.annual_cost,  0), [subs])

  // Hero chart data
  const heroMonthly = useMemo<BarData[]>(() => {
    const yr = now.getFullYear()
    const mo = now.getMonth() // 0 = Jan; grows through year, resets each Jan
    return Array.from({ length: mo + 1 }, (_, i) => {
      const key = `${yr}-${String(i + 1).padStart(2, '0')}`
      const inc = income.filter(r => r.date.startsWith(key)).reduce((s, r) => s + r.amount, 0)
      const exp = expenses.filter(r => r.date.startsWith(key)).reduce((s, r) => s + r.cost, 0)
      return { label: MONTH_NAMES[i], income: inc, expense: exp }
    })
  }, [income, expenses, now])

  const heroAnnual = useMemo<BarData[]>(() => {
    const yr        = now.getFullYear()
    const startYear = 2025
    return Array.from({ length: Math.max(0, yr - startYear + 1) }, (_, i) => {
      const year = startYear + i
      const key  = `${year}-`
      const inc  = income.filter(r => r.date.startsWith(key)).reduce((s, r) => s + r.amount, 0)
      const exp  = expenses.filter(r => r.date.startsWith(key)).reduce((s, r) => s + r.cost, 0)
      return { label: String(year), income: inc, expense: exp }
    })
  }, [income, expenses, now])

  // ── Render ────────────────────────────────────────────────────────────────

  const avatarSrc = customAvatar || googleAvatar
  const hasPhoto  = !!avatarSrc
  const initials  = displayName
    ? displayName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
    : (email?.[0] ?? '?').toUpperCase()

  return (
    <div className="min-h-screen bg-bg-base tab-enter pb-28">

      {/* ── Top bar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 pb-2"
        style={{ paddingTop: 'calc(env(safe-area-inset-top, 44px) + 8px)' }}>
        <button onClick={() => router.back()}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:opacity-70">
          <ArrowLeft size={18} strokeWidth={2} />
        </button>
        <button onClick={() => router.push('/settings')}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted active:opacity-70">
          <Settings2 size={18} strokeWidth={1.75} />
        </button>
      </div>

      {/* ── Avatar + identity ─────────────────────────────────────────────────── */}
      <div className="flex flex-col items-center px-5 pt-4 pb-6">
        <div className="relative mb-4">
          <button onClick={() => fileInputRef.current?.click()} disabled={uploading}
            className="w-24 h-24 rounded-full overflow-hidden block active:opacity-80 transition-opacity"
            style={{ boxShadow: '0 0 0 2.5px rgba(212,175,55,0.5)' }}>
            {avatarSrc
              ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
              : <div className="w-full h-full gradient-gold flex items-center justify-center">
                  <span className="text-[32px] font-bold text-white">{initials}</span>
                </div>
            }
            {uploading && (
              <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                <div className="w-5 h-5 border-2 border-gold border-t-transparent rounded-full animate-spin" />
              </div>
            )}
          </button>
          {!hasPhoto && (
            <div className="absolute bottom-0.5 right-0.5 w-7 h-7 gradient-gold rounded-full flex items-center justify-center pointer-events-none"
              style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.4)' }}>
              <Camera size={13} className="text-white" strokeWidth={2} />
            </div>
          )}
        </div>

        {editingName ? (
          <div className="flex items-center gap-2 mb-1">
            <input ref={nameInputRef} value={nameInput} onChange={e => setNameInput(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') saveName() }} onBlur={saveName}
              className="bg-bg-overlay rounded-[10px] px-3 py-1.5 text-[20px] font-bold text-ink text-center outline-none border border-gold/40"
              style={{ maxWidth: 240, colorScheme: 'dark' }} />
            <button onClick={saveName} className="w-7 h-7 gradient-gold rounded-full flex items-center justify-center flex-shrink-0">
              <Check size={12} className="text-white" strokeWidth={2.5} />
            </button>
          </div>
        ) : (
          <button onClick={startEditName} className="flex items-center gap-1.5 mb-1 group active:opacity-70">
            <span className="text-[22px] font-bold text-ink tracking-[-0.02em]">
              {displayName ?? 'Set your name'}
            </span>
            <Pencil size={13} className="text-ink-faint group-active:text-gold transition-colors" strokeWidth={1.75} />
          </button>
        )}
        {email && <p className="text-[12px] text-ink-muted">{email}</p>}
      </div>

      {/* ── Stats trio ───────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        <div className="grid grid-cols-3 gap-2">
          <StatTile label="Net Worth"  value={$fk(netWorth)}  color="#D4AF37" />
          <StatTile label="Mo. Spend"  value={$fk(moSpend)}   />
          <StatTile label="Mo. Income" value={$fk(moIncAmt)}  color="var(--sem-income)" />
        </div>
      </div>

      {/* ── Cashflow ─────────────────────────────────────────────────────────── */}
      {!loading && (
        <HeroSplitBarChart monthly={heroMonthly} annual={heroAnnual} />
      )}

      {/* ── Top Spending Categories ───────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        <MonthAnnualCard
          label="Top Categories"
          renderMonth={active  => <CategoryPills cats={moCats}  active={active} />}
          renderAnnual={active => <CategoryPills cats={annCats} active={active} />}
        />
      </div>

      {/* ── Subscriptions ────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        <MonthAnnualCard
          label="Subscriptions"
          renderMonth={active  => <CostPills items={subsSortedMo}  active={active} />}
          renderAnnual={active => <CostPills items={subsSortedAnn} active={active} />}
        />
      </div>

      {/* ── All Time ─────────────────────────────────────────────────────────── */}
      <div className="px-5 mb-5">
        <p className="text-[9px] font-medium tracking-[0.12em] uppercase text-ink-faint mb-2">All Time</p>
        <div className="bg-bg-surface border border-white/[0.06] rounded-card px-4">
          <Row label="Total Spent"       value={$f(allTimeSpent)}                  />
          <Row label="Total Saved"       value={$f(allTimeSavings)} accent={allTimeSavings > 0} />
          <Row label="Avg Monthly Spend" value={$f(avgMonthlySpend)}               />
          <Row label="Savings Rate"      value={`${savingsRate.toFixed(0)}%`} accent={savingsRate > 20} />
          {bestIncomeSource && (
            <Row label="Top Income Source" value={$fk(bestIncomeSource[1])} sub={bestIncomeSource[0]} accent />
          )}
        </div>
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => { const f = e.target.files?.[0]; if (f) handleAvatarFile(f); e.target.value = '' }} />
    </div>
  )
}
