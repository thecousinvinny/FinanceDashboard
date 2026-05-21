'use client'

import { useState, useEffect, useRef } from 'react'
import { localToday, cn } from '@/lib/utils'

export interface NewCommission {
  client_name:  string
  project_name: string
  project_type: string | null
  value:        number
  deposit:      number | null
  deadline:     string | null
  notes:        string | null
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (c: NewCommission) => void
}

export function AddCommissionSheet({ open, onClose, onAdd }: Props) {
  const [client,      setClient]      = useState('')
  const [project,     setProject]     = useState('')
  const [projectType, setProjectType] = useState('')
  const [value,       setValue]       = useState('')
  const [deposit,     setDeposit]     = useState('')
  const [deadline,    setDeadline]    = useState('')
  const [notes,       setNotes]       = useState('')

  const backdropRef = useRef<HTMLDivElement>(null)
  const sheetRef    = useRef<HTMLDivElement>(null)
  const dragStartY  = useRef<number | null>(null)

  useEffect(() => {
    const el = backdropRef.current
    if (!el || !open) return
    const prevent = (e: TouchEvent) => e.preventDefault()
    el.addEventListener('touchmove', prevent, { passive: false })
    return () => el.removeEventListener('touchmove', prevent)
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
      const t = setTimeout(() => {
        setClient(''); setProject(''); setProjectType('')
        setValue(''); setDeposit(''); setDeadline(''); setNotes('')
      }, 300)
      return () => clearTimeout(t)
    }
  }, [open])

  function handleAmount(raw: string, set: (v: string) => void) {
    if (raw === '' || /^\d*\.?\d{0,2}$/.test(raw)) set(raw)
  }

  function handleAdd() {
    const parsed = parseFloat(value)
    if (!client.trim() || !project.trim() || !parsed) return
    const dep = parseFloat(deposit)
    onAdd({
      client_name:  client.trim(),
      project_name: project.trim(),
      project_type: projectType.trim() || null,
      value:        parsed,
      deposit:      dep > 0 ? dep : null,
      deadline:     deadline || null,
      notes:        notes.trim() || null,
    })
    onClose()
  }

  const canAdd = !!client.trim() && !!project.trim() && !!parseFloat(value)

  return (
    <>
      <div
        ref={backdropRef}
        onClick={onClose}
        className={cn('fixed inset-0 z-[59] transition-opacity duration-300', open ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none')}
        style={{ background: 'rgba(0,0,0,0.72)' }}
      />
      <div
        ref={sheetRef}
        className={cn('fixed inset-x-0 bottom-0 z-[60] rounded-t-[24px] bg-bg-surface transition-transform duration-300', open ? 'translate-y-0' : 'translate-y-full')}
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
          <h2 className="text-[18px] font-bold tracking-tight text-ink">New Commission</h2>
          <button onClick={onClose} className="w-8 h-8 flex items-center justify-center text-[22px] text-ink-muted">×</button>
        </div>

        <div className="px-5 space-y-5 overflow-y-auto" style={{ maxHeight: '65vh', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 100px)', overflowX: 'hidden', overscrollBehavior: 'contain' }}>

          {/* Value */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Commission Value</p>
            <div className="flex items-center gap-1.5 bg-bg-overlay rounded-[14px] px-4 py-3">
              <span className="text-[22px] font-light text-ink-muted font-mono">$</span>
              <input
                type="text" inputMode="decimal" placeholder="0.00" value={value}
                onChange={e => handleAmount(e.target.value, setValue)}
                className="flex-1 bg-transparent text-[28px] font-bold font-mono text-ink outline-none placeholder:text-ink-faint"
              />
            </div>
          </div>

          {/* Client */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Client Name</p>
            <input type="text" placeholder="e.g. Acme Studio" value={client} onChange={e => setClient(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Project name */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">Project Name</p>
            <input type="text" placeholder="e.g. Brand Identity Pack" value={project} onChange={e => setProject(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Project type */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              Project Type <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <input type="text" placeholder="e.g. Portrait pack, Logo design" value={projectType} onChange={e => setProjectType(e.target.value)}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none" />
          </div>

          {/* Deposit + Deadline */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
                Deposit <span className="normal-case text-ink-faint/60">(opt.)</span>
              </p>
              <div className="flex items-center gap-1 bg-bg-overlay rounded-[14px] px-3 py-3">
                <span className="text-[14px] font-light text-ink-muted font-mono">$</span>
                <input type="text" inputMode="decimal" placeholder="0.00" value={deposit}
                  onChange={e => handleAmount(e.target.value, setDeposit)}
                  className="flex-1 bg-transparent text-[15px] font-mono text-ink outline-none placeholder:text-ink-faint min-w-0" />
              </div>
            </div>
            <div>
              <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
                Deadline <span className="normal-case text-ink-faint/60">(opt.)</span>
              </p>
              <input type="date" value={deadline} onChange={e => setDeadline(e.target.value)}
                min={localToday()} style={{ colorScheme: 'dark' }}
                className="w-full bg-bg-overlay rounded-[14px] px-3 py-3 text-[15px] text-ink outline-none" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <p className="text-[10px] font-medium tracking-[0.1em] uppercase text-ink-faint mb-2">
              Notes <span className="normal-case text-ink-faint/60">(optional)</span>
            </p>
            <textarea
              placeholder="Revisions, usage rights, special requirements…"
              value={notes} onChange={e => setNotes(e.target.value)} rows={3}
              className="w-full bg-bg-overlay rounded-[14px] px-4 py-3.5 text-[15px] text-ink placeholder:text-ink-faint outline-none resize-none"
            />
          </div>

          {/* Submit */}
          <button onClick={handleAdd} disabled={!canAdd}
            className={cn('w-full py-4 rounded-[14px] text-[15px] font-semibold transition-all select-none', canAdd ? 'gradient-gold text-white' : 'bg-bg-overlay text-ink-faint')}>
            Add Commission
          </button>
        </div>
      </div>
    </>
  )
}
