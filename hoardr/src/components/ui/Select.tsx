'use client'

import { Children, isValidElement, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'
import { useIsLargeScreen } from '@/lib/use-large-screen'

/**
 * The one dropdown for the whole app. Drop-in for a native <select>: same
 * value / onChange(e.target.value) / <option> children.
 *
 * Phone (< 768px): an invisible native <select> sits over the trigger, so iOS
 * still opens its wheel picker.
 * PC / iPad: the trigger opens an app-themed menu instead of the OS's white
 * list — matching the calendar popover's dropdowns.
 *
 * The menu portals to <body>: bottom sheets put a transform on their
 * container, which would otherwise make position:fixed resolve against the
 * sheet and clip the menu.
 */
interface Props {
  value:        string
  onChange:     (e: { target: { value: string } }) => void
  children:     React.ReactNode            // <option value="…">label</option>
  className?:   string                     // trigger styling (defaults to the sheet field style)
  style?:       React.CSSProperties
  /** Custom trigger content (e.g. a calendar row). Replaces the label + chevron. */
  trigger?:     React.ReactNode
  'aria-label'?: string
}

interface Opt { value: string; label: string; disabled?: boolean }

const FIELD = 'w-full bg-bg-overlay border border-ink/[0.06] rounded-[14px] px-4 py-3 pr-10 text-[15px] text-ink text-left outline-none focus-visible:border-gold/40'

function textOf(node: React.ReactNode): string {
  return Children.toArray(node).map(n => (typeof n === 'string' || typeof n === 'number') ? String(n) : '').join('')
}

function readOptions(children: React.ReactNode): Opt[] {
  const out: Opt[] = []
  Children.toArray(children).forEach(ch => {
    if (!isValidElement<{ value?: string | number; children?: React.ReactNode; disabled?: boolean }>(ch)) return
    if (ch.type === 'option') {
      out.push({ value: String(ch.props.value ?? ''), label: textOf(ch.props.children), disabled: ch.props.disabled })
    } else if (ch.props.children) {
      out.push(...readOptions(ch.props.children))   // fragments / optgroups
    }
  })
  return out
}

export function Select({ value, onChange, children, className, style, trigger, ...rest }: Props) {
  const large   = useIsLargeScreen()
  const options = readOptions(children)
  const current = options.find(o => o.value === value)
  const [open, setOpen]     = useState(false)
  const [active, setActive] = useState(0)
  const [pos, setPos]       = useState<{ top: number; left: number; width: number; maxH: number; up: boolean } | null>(null)
  const btnRef  = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const triggerCls = trigger ? (className ?? 'w-full text-left') : (className ?? FIELD)
  const triggerInner = trigger ?? (
    <>
      <span className={current ? '' : 'text-ink-faint'}>{current?.label ?? 'Select…'}</span>
      <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-ink-muted pointer-events-none" />
    </>
  )

  function place() {
    const r = btnRef.current?.getBoundingClientRect()
    if (!r) return
    const below = window.innerHeight - r.bottom - 12
    const above = r.top - 12
    const want  = Math.min(options.length * 40 + 8, 320)
    const up    = below < Math.min(want, 200) && above > below
    setPos({ top: up ? r.top - 6 : r.bottom + 6, left: r.left, width: Math.max(r.width, 180), maxH: Math.min(want, up ? above : below), up })
  }

  function openMenu() {
    place()
    setActive(Math.max(0, options.findIndex(o => o.value === value)))
    setOpen(true)
  }

  function choose(v: string) {
    setOpen(false)
    btnRef.current?.focus()
    if (v !== value) onChange({ target: { value: v } })
  }

  // Close on outside click / scroll / resize
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onScroll = (e: Event) => { if (!menuRef.current?.contains(e.target as Node)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // Keep the highlighted row in view while arrowing through a long list
  useLayoutEffect(() => {
    if (!open) return
    const el = menuRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)
    el?.scrollIntoView({ block: 'nearest' })
  }, [open, active])

  function onKeyDown(e: React.KeyboardEvent) {
    if (!open) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) { e.preventDefault(); openMenu() }
      return
    }
    if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); setOpen(false) }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(options.length - 1, a + 1)) }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setActive(a => Math.max(0, a - 1)) }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      const o = options[active]
      if (o && !o.disabled) choose(o.value)
    }
    if (e.key === 'Tab') setOpen(false)
  }

  if (!large) {
    return (
      <div className="relative" style={trigger ? undefined : { width: '100%' }}>
        <div className={trigger ? triggerCls : `${triggerCls} relative`} style={style} aria-hidden>{triggerInner}</div>
        <select
          value={value}
          onChange={e => onChange({ target: { value: e.target.value } })}
          aria-label={rest['aria-label']}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          style={{ colorScheme: 'dark', fontSize: 16 /* stops iOS zoom-on-focus */ }}
        >
          {children}
        </select>
      </div>
    )
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={rest['aria-label']}
        onClick={() => (open ? setOpen(false) : openMenu())}
        onKeyDown={onKeyDown}
        className={trigger ? triggerCls : `${triggerCls} relative cursor-pointer`}
        style={style}
      >
        {triggerInner}
      </button>
      {open && pos && createPortal(
        <div
          ref={menuRef}
          role="listbox"
          onMouseDown={e => e.preventDefault()}   // keep focus on the trigger
          className="select-menu"
          style={{
            position: 'fixed', zIndex: 220,
            left: Math.min(pos.left, window.innerWidth - pos.width - 8),
            width: pos.width,
            maxHeight: pos.maxH,
            ...(pos.up ? { bottom: window.innerHeight - pos.top } : { top: pos.top }),
            overflowY: 'auto', overscrollBehavior: 'contain',
            background: 'var(--color-bg-elevated, #1D2026)',
            border: '0.5px solid rgb(var(--rgb-ink) / 0.1)',
            borderRadius: 12, padding: 4,
            boxShadow: '0 10px 32px rgba(0,0,0,0.5)',
            fontFamily: 'var(--font-montserrat)',
            transformOrigin: pos.up ? 'bottom' : 'top',
          }}
        >
          {options.map((o, i) => {
            const selected = o.value === value
            return (
              <div
                key={o.value + i}
                data-idx={i}
                role="option"
                aria-selected={selected}
                aria-disabled={o.disabled}
                onMouseEnter={() => setActive(i)}
                onClick={() => { if (!o.disabled) choose(o.value) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '8px 10px', borderRadius: 8, cursor: o.disabled ? 'default' : 'pointer',
                  fontSize: 13.5, lineHeight: 1.3,
                  color: o.disabled ? 'rgb(var(--rgb-ink) / 0.3)' : selected ? '#D4AF37' : 'var(--color-ink)',
                  fontWeight: selected ? 600 : 400,
                  background: i === active ? 'rgb(var(--rgb-ink) / 0.06)' : 'transparent',
                }}
              >
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.label}</span>
                {selected && <Check size={13} strokeWidth={2.5} style={{ flexShrink: 0 }} />}
              </div>
            )
          })}
        </div>,
        document.body,
      )}
    </>
  )
}
