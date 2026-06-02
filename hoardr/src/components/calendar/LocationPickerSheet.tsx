'use client'

import { useState, useEffect, useRef } from 'react'
import { ArrowLeft, MapPin, Clock, Star, Search } from 'lucide-react'

interface LocSuggestion {
  placeId:  string
  mainText: string
  secText:  string
  description: string
}

interface Props {
  open:     boolean
  initial:  string
  onClose:  () => void
  onSelect: (location: string) => void
}

const M    = 'var(--font-montserrat)'
const GOLD = '#C9A84C'
const MUTED = 'rgb(var(--rgb-ink-muted))'
const SEP   = 'rgba(255,255,255,0.06)'

const HISTORY_KEY   = 'cal-location-history'
const FAVORITES_KEY = 'cal-location-favorites'
const MAX_HISTORY   = 10

function loadArr(key: string): string[] {
  try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] }
}
function saveArr(key: string, arr: string[]) {
  localStorage.setItem(key, JSON.stringify(arr))
}

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span style={{ color: GOLD }}>{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

export function LocationPickerSheet({ open, initial, onClose, onSelect }: Props) {
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<LocSuggestion[]>([])
  const [recents,     setRecents]     = useState<string[]>([])
  const [favorites,   setFavorites]   = useState<string[]>([])

  const svcRef    = useRef<unknown>(null)
  const timerRef  = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef  = useRef<HTMLInputElement>(null)
  const sheetRef  = useRef<HTMLDivElement>(null)
  const dragStartY = useRef<number | null>(null)

  // Initialize AutocompleteService once
  useEffect(() => {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY
    if (!key) return
    function init() {
      const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: { AutocompleteService: new () => unknown } } } | undefined
      if (!g?.maps?.places) return
      svcRef.current = new g.maps.places.AutocompleteService()
    }
    const g = (window as unknown as Record<string, unknown>).google as { maps?: { places?: unknown } } | undefined
    if (g?.maps?.places) { init() }
    else {
      const el = document.getElementById('gmaps-script')
      if (!el) {
        const s = document.createElement('script'); s.id = 'gmaps-script'
        s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places`; s.async = true; s.onload = init
        document.head.appendChild(s)
      } else el.addEventListener('load', init, { once: true })
    }
    return () => { svcRef.current = null }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (open) {
      setQuery('')
      setSuggestions([])
      setRecents(loadArr(HISTORY_KEY))
      setFavorites(loadArr(FAVORITES_KEY))
      setTimeout(() => inputRef.current?.focus(), 350)
    } else {
      setTimeout(() => { setQuery(''); setSuggestions([]) }, 300)
    }
  }, [open])

  function handleSearch(val: string) {
    setQuery(val)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (!val.trim()) { setSuggestions([]); return }
    timerRef.current = setTimeout(() => {
      const svc = svcRef.current as { getPlacePredictions: (req: unknown, cb: (r: unknown[] | null, s: string) => void) => void } | null
      if (!svc) return
      svc.getPlacePredictions({ input: val, types: ['geocode', 'establishment'] }, (results, status) => {
        if (status === 'OK' && results?.length) {
          setSuggestions((results as Array<{ place_id: string; structured_formatting: { main_text: string; secondary_text?: string }; description: string }>)
            .slice(0, 6).map(r => ({ placeId: r.place_id, mainText: r.structured_formatting.main_text, secText: r.structured_formatting.secondary_text ?? '', description: r.description })))
        } else { setSuggestions([]) }
      })
    }, 200)
  }

  function selectLocation(text: string) {
    const updated = [text, ...recents.filter(r => r !== text)].slice(0, MAX_HISTORY)
    setRecents(updated)
    saveArr(HISTORY_KEY, updated)
    localStorage.setItem('cal-recent-location', text)  // backward compat
    onSelect(text)
    onClose()
  }

  function toggleFavorite(e: React.MouseEvent, text: string) {
    e.stopPropagation()
    const updated = favorites.includes(text)
      ? favorites.filter(f => f !== text)
      : [text, ...favorites]
    setFavorites(updated)
    saveArr(FAVORITES_KEY, updated)
  }

  function onDragStart(e: React.TouchEvent) { dragStartY.current = e.touches[0].clientY }
  function onDragMove(e: React.TouchEvent) {
    if (dragStartY.current === null || !sheetRef.current) return
    const dy = Math.max(0, e.touches[0].clientY - dragStartY.current)
    sheetRef.current.style.transform = `translateY(${dy}px)`; sheetRef.current.style.transition = 'none'
  }
  function onDragEnd(e: React.TouchEvent) {
    if (!sheetRef.current) return
    const dy = dragStartY.current !== null ? Math.max(0, e.changedTouches[0].clientY - dragStartY.current) : 0
    dragStartY.current = null
    if (dy > 80) {
      sheetRef.current.style.transition = 'transform 0.28s cubic-bezier(0.4,0,0.2,1)'
      sheetRef.current.style.transform  = 'translateY(100%)'
      setTimeout(() => { if (sheetRef.current) { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' } onClose() }, 280)
    } else { sheetRef.current.style.transform = ''; sheetRef.current.style.transition = '' }
  }

  const isFav = (t: string) => favorites.includes(t)

  const rowStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '13px 16px', borderBottom: `0.5px solid ${SEP}`,
    background: 'none', border: 'none', width: '100%', textAlign: 'left', cursor: 'pointer',
  }

  const sectionLabel: React.CSSProperties = {
    fontSize: 9, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase',
    color: MUTED, padding: '10px 16px 4px', fontFamily: M,
  }

  const showFavorites  = !query.trim() && favorites.length > 0
  const showRecents    = !query.trim() && recents.length > 0
  const showSuggestions = query.trim().length > 0

  return (
    <>
      {/* Backdrop — above edit sheet */}
      <div
        className={`fixed inset-0 z-[54] transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ background: 'rgba(0,0,0,0.5)' }}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed inset-x-0 bottom-0 z-[55] rounded-t-[24px] flex flex-col"
        style={{
          background:  'var(--color-bg-surface)',
          maxHeight:   'calc(100dvh - env(safe-area-inset-top, 44px) - 8px)',
          willChange:  'transform',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
          transform:   open ? 'translateY(0)' : 'translateY(100%)',
          transition:  'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Drag zone: handle + header */}
        <div
          onTouchStart={onDragStart} onTouchMove={onDragMove} onTouchEnd={onDragEnd}
          className="flex-shrink-0" style={{ touchAction: 'none' }}
        >
          <div className="flex justify-center pt-3 pb-1">
            <div className="w-9 h-1 rounded-full bg-white/20" />
          </div>
          <div style={{ display: 'flex', alignItems: 'center', padding: '8px 16px 10px' }}>
            <button
              onTouchStart={e => e.stopPropagation()}
              onClick={onClose}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px 4px 0', display: 'flex', alignItems: 'center', color: GOLD, marginRight: 8 }}
            >
              <ArrowLeft size={20} color={GOLD} />
            </button>
            <span style={{ fontFamily: M, fontSize: 17, fontWeight: 600, color: 'var(--color-ink)', flex: 1 }}>
              Location
            </span>
          </div>
        </div>

        {/* Search input */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 10,
          margin: '0 16px 12px',
          background: 'rgba(255,255,255,0.06)',
          borderRadius: 12, padding: '10px 14px',
          flexShrink: 0,
        }}>
          <Search size={15} color={MUTED} style={{ flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search location…"
            value={query}
            onChange={e => handleSearch(e.target.value)}
            style={{
              flex: 1, background: 'none', border: 'none', outline: 'none',
              fontSize: 15, fontFamily: M, color: 'var(--color-ink)',
            }}
          />
          {query.length > 0 && (
            <button onClick={() => { setQuery(''); setSuggestions([]) }}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: MUTED, fontSize: 18, lineHeight: 1, padding: 0, display: 'flex', alignItems: 'center' }}>
              ×
            </button>
          )}
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain', borderTop: `0.5px solid ${SEP}` }}>

          {/* Favorites */}
          {showFavorites && (
            <>
              <p style={sectionLabel}>Favorites</p>
              {favorites.map(loc => (
                <button key={loc} style={rowStyle} onClick={() => selectLocation(loc)}>
                  <Star size={15} color={GOLD} fill={GOLD} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.4, textAlign: 'left' }}>{loc}</span>
                  <button onClick={e => toggleFavorite(e, loc)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <Star size={14} color={GOLD} fill={GOLD} />
                  </button>
                </button>
              ))}
            </>
          )}

          {/* Recents */}
          {showRecents && (
            <>
              <p style={sectionLabel}>Recents</p>
              {recents.map(loc => (
                <button key={loc} style={rowStyle} onClick={() => selectLocation(loc)}>
                  <Clock size={15} color={MUTED} style={{ flexShrink: 0 }} />
                  <span style={{ flex: 1, fontSize: 14, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.4, textAlign: 'left' }}>{loc}</span>
                  <button onClick={e => toggleFavorite(e, loc)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <Star size={14} color={isFav(loc) ? GOLD : MUTED} fill={isFav(loc) ? GOLD : 'none'} />
                  </button>
                </button>
              ))}
            </>
          )}

          {/* Autocomplete suggestions */}
          {showSuggestions && (
            <>
              {suggestions.length === 0 && query.length > 1 && (
                <p style={{ fontFamily: M, fontSize: 13, color: MUTED, padding: '20px 16px', textAlign: 'center' }}>
                  No results for &ldquo;{query}&rdquo;
                </p>
              )}
              {suggestions.map(sug => (
                <button key={sug.placeId} style={rowStyle} onClick={() => selectLocation(sug.description)}>
                  <MapPin size={15} color={MUTED} style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0, textAlign: 'left' }}>
                    <div style={{ fontSize: 14, color: 'var(--color-ink)', fontFamily: M, lineHeight: 1.4 }}>
                      {highlightMatch(sug.mainText, query)}
                    </div>
                    {sug.secText && (
                      <div style={{ fontSize: 12, color: MUTED, fontFamily: M, lineHeight: 1.4, marginTop: 2 }}>{sug.secText}</div>
                    )}
                  </div>
                  <button onClick={e => toggleFavorite(e, sug.description)}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px', flexShrink: 0 }}>
                    <Star size={14} color={isFav(sug.description) ? GOLD : MUTED} fill={isFav(sug.description) ? GOLD : 'none'} />
                  </button>
                </button>
              ))}
            </>
          )}

          {/* Empty state */}
          {!showFavorites && !showRecents && !showSuggestions && (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <MapPin size={32} color={MUTED} style={{ margin: '0 auto 12px' }} />
              <p style={{ fontFamily: M, fontSize: 14, color: MUTED }}>Search for a place or address</p>
            </div>
          )}

          <div style={{ height: 20 }} />
        </div>
      </div>
    </>
  )
}
