'use client'

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

/**
 * Phone split view's top half: months stacked vertically and scrolled with
 * native momentum, like iOS Calendar's month view (it used to be one month at
 * a time, swiped left/right).
 *
 * Kept smooth on purpose:
 * - Scrolling never re-renders the calendar screen (thousands of list rows).
 *   The header label follows along through `labelRef` (a DOM write), and the
 *   screen hears about the new month only once the scroll settles (`onSettle`).
 * - Month blocks are memoized and only the one holding the selected day or
 *   today re-renders when those move; off-screen blocks skip rendering
 *   (`content-visibility: auto`).
 * - A month chosen elsewhere (the list below, Today, the picker) scrolls into
 *   view smoothly — unless the user is scrolling the grid themselves.
 */

export interface DotEvent { type: string; color?: string }

const ROW_H   = 38   // one week
const LABEL_H = 26   // month name row
const SPAN    = 24   // months rendered either side of the centre
const SETTLE_MS = 160

const key  = (y: number, m: number) => `${y}-${m}`
const pad2 = (n: number) => String(n).padStart(2, '0')
function addMonths(y: number, m: number, n: number) {
  const d = new Date(y, m + n, 1)
  return { y: d.getFullYear(), m: d.getMonth() }
}
function weeksIn(y: number, m: number, wsMon: boolean) {
  const first = new Date(y, m, 1).getDay()
  const lead  = wsMon ? (first + 6) % 7 : first
  const days  = new Date(y, m + 1, 0).getDate()
  return { lead, days, rows: Math.ceil((lead + days) / 7) }
}

interface Props {
  year:       number          // month the rest of the screen is on
  month:      number
  selected:   string | null
  todayStr:   string
  wsMon:      boolean
  visibleMap: Record<string, DotEvent[]>
  dotColor:   Record<string, string>
  labelRef:   React.RefObject<HTMLElement | null>
  onPickDay:  (ds: string) => void
  onSettle:   (year: number, month: number) => void
}

export function MonthScroller({ year, month, selected, todayStr, wsMon, visibleMap, dotColor, labelRef, onPickDay, onSettle }: Props) {
  const scRef      = useRef<HTMLDivElement>(null)
  const blockRefs  = useRef(new Map<string, HTMLDivElement>())
  const visibleKey = useRef(key(year, month))
  const userAt     = useRef(0)                  // last time the user touched/scrolled the grid
  const userDriven = useRef(false)              // this scroll came from the user's finger/wheel
  const settleT    = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const raf        = useRef(0)
  const onSettleRef = useRef(onSettle)
  onSettleRef.current = onSettle

  // Rendered window, re-centred when a far-away month is asked for
  const [centre, setCentre] = useState(() => ({ y: year, m: month }))
  const months = useMemo(
    () => Array.from({ length: SPAN * 2 + 1 }, (_, i) => addMonths(centre.y, centre.m, i - SPAN)),
    [centre],
  )
  const inWindow = (y: number, m: number) => {
    const first = months[2], last = months[months.length - 3]
    const v = y * 12 + m
    return v >= first.y * 12 + first.m && v <= last.y * 12 + last.m
  }

  const writeLabel = (y: number, m: number) => {
    if (labelRef.current) labelRef.current.textContent = new Date(y, m, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
  }

  const scrollToMonth = useCallback((y: number, m: number, smooth: boolean) => {
    const sc = scRef.current, el = blockRefs.current.get(key(y, m))
    if (!sc || !el) return
    visibleKey.current = key(y, m)
    sc.scrollTo({ top: el.offsetTop, behavior: smooth ? 'smooth' : 'auto' })
  }, [])

  // First layout (and after a re-centre): sit on the screen's month, no animation
  useLayoutEffect(() => { scrollToMonth(year, month, false) }, [centre, scrollToMonth])  // eslint-disable-line react-hooks/exhaustive-deps

  // Follow the list below (and Today / the picker), unless the user is driving
  // the grid: a new month shows from its first week; within a month the
  // selected day's week is kept in view, so the two halves move together.
  useEffect(() => {
    if (performance.now() - userAt.current < 600) return
    if (!inWindow(year, month)) { setCentre({ y: year, m: month }); return }
    const sc = scRef.current, el = blockRefs.current.get(key(year, month))
    if (!sc || !el) return
    const k = key(year, month)
    const view = sc.clientHeight
    const monthTop = el.offsetTop
    let target: number | null = null
    if (k !== visibleKey.current) target = monthTop
    const selIn = selected && selected.startsWith(`${year}-${pad2(month + 1)}`)
    if (selIn) {
      const { lead } = weeksIn(year, month, wsMon)
      const day = Number(selected!.slice(8, 10))
      const rowTop = monthTop + LABEL_H + Math.floor((lead + day - 1) / 7) * ROW_H
      const from = target ?? sc.scrollTop
      if (rowTop + ROW_H > from + view) target = rowTop + ROW_H - view + 6   // below: bring it up
      else if (rowTop < from) target = Math.max(monthTop, rowTop - 6)        // above: bring it down
    }
    if (target === null || Math.abs(target - sc.scrollTop) < 2) return
    visibleKey.current = k
    userDriven.current = false
    sc.scrollTo({ top: target, behavior: 'smooth' })
  }, [year, month, selected])  // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sc = scRef.current
    if (!sc) return
    const mark = () => { userAt.current = performance.now(); userDriven.current = true }
    const onScroll = () => {
      cancelAnimationFrame(raf.current)
      raf.current = requestAnimationFrame(() => {
        // The month whose block covers the top of the viewport (+ a little)
        const probe = sc.scrollTop + 24
        let top = months[0]
        for (const mo of months) {
          const el = blockRefs.current.get(key(mo.y, mo.m))
          if (!el) continue
          if (el.offsetTop <= probe) top = mo
          else break
        }
        const k = key(top.y, top.m)
        if (k !== visibleKey.current) { visibleKey.current = k; writeLabel(top.y, top.m) }
      })
      clearTimeout(settleT.current)
      settleT.current = setTimeout(() => {
        const [y, m] = visibleKey.current.split('-').map(Number)
        // Only a scroll the user made moves the list. Reporting our own
        // follow-the-list glides too fed back into the list (which rebuilds
        // around the month) while it was prepending months on an upward
        // scroll — each round stepped further back: Dec → … → Oct 2024.
        if (userDriven.current) { userDriven.current = false; onSettleRef.current(y, m) }
        // Near either end of the window: re-centre so scrolling never runs out
        if (!inWindow(y, m)) setCentre({ y, m })
      }, SETTLE_MS)
    }
    sc.addEventListener('scroll', onScroll, { passive: true })
    sc.addEventListener('touchstart', mark, { passive: true })
    sc.addEventListener('touchmove', mark, { passive: true })
    sc.addEventListener('wheel', mark, { passive: true })
    return () => {
      sc.removeEventListener('scroll', onScroll)
      sc.removeEventListener('touchstart', mark)
      sc.removeEventListener('touchmove', mark)
      sc.removeEventListener('wheel', mark)
      cancelAnimationFrame(raf.current)
      clearTimeout(settleT.current)
    }
  }, [months])  // eslint-disable-line react-hooks/exhaustive-deps

  const setBlockRef = useCallback((k: string, el: HTMLDivElement | null) => {
    if (el) blockRefs.current.set(k, el); else blockRefs.current.delete(k)
  }, [])

  const selMonth   = selected ? selected.slice(0, 7) : null
  const todayMonth = todayStr.slice(0, 7)

  return (
    <div
      ref={scRef}
      data-touch-scroll
      // position: relative — block offsetTop is measured from here. Without it
      // offsets counted the header above, and every jump overshot ~2 weeks.
      style={{ position: 'relative', flex: 1, overflowY: 'auto', overflowX: 'hidden', overscrollBehavior: 'contain', paddingLeft: 6, paddingRight: 6 }}
    >
      {months.map(({ y, m }) => {
        const ym = `${y}-${pad2(m + 1)}`
        return (
          <MonthBlock
            key={key(y, m)}
            k={key(y, m)}
            year={y}
            month={m}
            wsMon={wsMon}
            selected={selMonth === ym ? selected : null}
            todayStr={todayMonth === ym ? todayStr : null}
            visibleMap={visibleMap}
            dotColor={dotColor}
            onPickDay={onPickDay}
            setRef={setBlockRef}
          />
        )
      })}
    </div>
  )
}

const MonthBlock = memo(function MonthBlock({ k, year, month, wsMon, selected, todayStr, visibleMap, dotColor, onPickDay, setRef }: {
  k: string; year: number; month: number; wsMon: boolean
  selected: string | null; todayStr: string | null
  visibleMap: Record<string, DotEvent[]>; dotColor: Record<string, string>
  onPickDay: (ds: string) => void
  setRef: (k: string, el: HTMLDivElement | null) => void
}) {
  const { lead, days, rows } = weeksIn(year, month, wsMon)
  const height = LABEL_H + rows * ROW_H
  const name = new Date(year, month, 1).toLocaleDateString('en-US', month === 0 ? { month: 'short', year: 'numeric' } : { month: 'short' })
  const isThisMonth = todayStr !== null

  return (
    <div
      ref={el => setRef(k, el)}
      style={{ height, contentVisibility: 'auto', containIntrinsicSize: `auto ${height}px` }}
    >
      {/* Month name over the column of its 1st, like iOS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', height: LABEL_H, alignItems: 'end' }}>
        <span style={{
          gridColumn: `${lead + 1} / span 3`, justifySelf: 'start', paddingLeft: 'calc((100% / 3 - 26px) / 2)',
          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', lineHeight: 1, paddingBottom: 4,
          color: isThisMonth ? '#D4AF37' : 'rgb(var(--rgb-ink))', fontFamily: 'var(--font-montserrat)',
        }}>{name}</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gridAutoRows: ROW_H }}>
        {Array.from({ length: lead }, (_, i) => <div key={`l${i}`} />)}
        {Array.from({ length: days }, (_, i) => {
          const day = i + 1
          const ds = `${year}-${pad2(month + 1)}-${pad2(day)}`
          const isToday = ds === todayStr
          const isSel   = ds === selected
          const dots    = (visibleMap[ds] ?? []).slice(0, 3).map(ev => ev.color ?? dotColor[ev.type])
          return (
            <button key={day}
              onClick={() => onPickDay(ds)}
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', border: 'none', background: 'none', cursor: 'pointer', outline: 'none', gap: 2, minWidth: 0, padding: 0, touchAction: 'manipulation' }}
            >
              <div style={{ width: 26, height: 26, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: isToday ? '#D4AF37' : isSel ? 'rgba(212,175,55,0.15)' : 'transparent', flexShrink: 0 }}>
                <span style={{ fontSize: 12, fontWeight: isToday ? 700 : isSel ? 600 : 400, color: isToday ? '#000' : isSel ? '#D4AF37' : 'rgb(var(--rgb-ink) / 0.72)', fontFamily: 'var(--font-montserrat)', lineHeight: 1 }}>{day}</span>
              </div>
              <div style={{ display: 'flex', gap: 2, height: 3, flexShrink: 0 }}>
                {dots.map((c, di) => <span key={di} style={{ width: 3, height: 3, borderRadius: '50%', background: c, flexShrink: 0 }} />)}
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
})
