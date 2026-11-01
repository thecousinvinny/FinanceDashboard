'use client'

import { useState, useEffect, useRef } from 'react'
import { MapPin, Clock, Star, Search, XCircle } from 'lucide-react'
import { getLocFavorites, getLocRecents, toggleLocFavorite, pushLocRecent } from '@/lib/location-prefs'
import { haptic } from '@/lib/utils'
import { Sheet } from '@/components/ui/Sheet'
import { FormGroup } from '@/components/ui/Form'

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

function highlightMatch(text: string, query: string) {
  if (!query.trim()) return <>{text}</>
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return <>{text}</>
  return (
    <>
      {text.slice(0, idx)}
      <span className="text-gold">{text.slice(idx, idx + query.length)}</span>
      {text.slice(idx + query.length)}
    </>
  )
}

/** Location search for the phone event sheet: favorites, recents, then Google Places. */
export function LocationPickerSheet({ open, initial, onClose, onSelect }: Props) {
  const [query,       setQuery]       = useState('')
  const [suggestions, setSuggestions] = useState<LocSuggestion[]>([])
  const [recents,     setRecents]     = useState<string[]>([])
  const [favorites,   setFavorites]   = useState<string[]>([])

  const svcRef   = useRef<unknown>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

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
    if (!open) return
    setQuery('')
    setSuggestions([])
    setRecents(getLocRecents())
    setFavorites(getLocFavorites())
    // After the sheet has risen, so the keyboard doesn't fight the animation
    const t = setTimeout(() => inputRef.current?.focus(), 420)
    return () => clearTimeout(t)
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
    haptic('tap')
    setRecents(pushLocRecent(text))
    onSelect(text)
    onClose()
  }

  const isFav = (t: string) => favorites.includes(t)

  // Rows are divs, not buttons: the star toggle inside them is a real button,
  // and a <button> nested in a <button> is invalid — desktop browsers route the
  // click to the outer row, so starring never registered on PC.
  function Row({ text, icon, primary, secondary, star = true }: {
    text: string; icon: React.ReactNode; primary: React.ReactNode; secondary?: string; star?: boolean
  }) {
    return (
      <div
        role="button" tabIndex={0}
        onClick={() => selectLocation(text)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectLocation(text) } }}
        className="flex items-center gap-3 px-4 min-h-[50px] py-2.5 cursor-pointer active:bg-[rgb(var(--rgb-ink)/0.06)] transition-colors"
        style={{ ['--sep-inset' as string]: '50px' }}
      >
        <span className="w-[22px] flex justify-center flex-shrink-0">{icon}</span>
        <span className="flex-1 min-w-0">
          <span className="block text-[16px] leading-snug text-ink">{primary}</span>
          {secondary && <span className="block text-[13px] leading-snug text-ink-muted truncate">{secondary}</span>}
        </span>
        {star && (
          <button
            type="button"
            onClick={e => { e.stopPropagation(); haptic('tap'); setFavorites(toggleLocFavorite(text)) }}
            aria-label={isFav(text) ? 'Remove favorite' : 'Add favorite'}
            className="w-9 h-9 -mr-2 flex items-center justify-center flex-shrink-0"
          >
            <Star size={16} strokeWidth={1.9} className={isFav(text) ? 'text-gold' : 'text-ink-faint'} fill={isFav(text) ? 'currentColor' : 'none'} />
          </button>
        )}
      </div>
    )
  }

  const q  = query.trim()
  const ql = q.toLowerCase()
  // While typing: saved places containing the text come first, then Google
  const savedMatches = ql ? [...new Set([...favorites, ...recents])].filter(t => t.toLowerCase().includes(ql)).slice(0, 5) : []
  const placeResults = suggestions.filter(s => !savedMatches.includes(s.description))
  const muted = 'text-ink-muted'

  return (
    <Sheet open={open} onClose={onClose} title="Location">
      {/* Search */}
      <div className="sticky top-0 z-10 -mx-4 px-4 pt-2 pb-3" style={{ background: 'var(--color-bg-surface)' }}>
        <label className="flex items-center gap-2 h-[38px] px-3 rounded-[10px]" style={{ background: 'rgb(var(--rgb-ink) / 0.08)' }}>
          <Search size={16} strokeWidth={2} className="text-ink-muted flex-shrink-0" />
          <input
            ref={inputRef}
            type="text"
            placeholder={initial || 'Search or enter a place'}
            value={query}
            onChange={e => handleSearch(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && q) { e.preventDefault(); selectLocation(q) } }}
            enterKeyHint="done"
            className="flex-1 min-w-0 bg-transparent text-[16px] text-ink placeholder:text-ink-faint outline-none"
          />
          {query && (
            <button type="button" onClick={() => { setQuery(''); setSuggestions([]); inputRef.current?.focus() }} aria-label="Clear" className="flex-shrink-0">
              <XCircle size={17} className="text-ink-faint" fill="currentColor" stroke="var(--color-bg-surface)" />
            </button>
          )}
        </label>
      </div>

      {q ? (
        <>
          <FormGroup className="!mt-1">
            <Row text={q} star={false} icon={<MapPin size={18} strokeWidth={1.75} className="text-gold" />}
              primary={<>Use &ldquo;{q}&rdquo;</>} />
          </FormGroup>
          {savedMatches.length > 0 && (
            <FormGroup header="Saved">
              {savedMatches.map(loc => (
                <Row key={`s:${loc}`} text={loc} primary={highlightMatch(loc, q)}
                  icon={isFav(loc) ? <Star size={17} className="text-gold" fill="currentColor" /> : <Clock size={17} strokeWidth={1.75} className={muted} />} />
              ))}
            </FormGroup>
          )}
          {placeResults.length > 0 && (
            <FormGroup header="Places">
              {placeResults.map(sug => (
                <Row key={sug.placeId} text={sug.description} primary={highlightMatch(sug.mainText, q)} secondary={sug.secText}
                  icon={<MapPin size={17} strokeWidth={1.75} className={muted} />} />
              ))}
            </FormGroup>
          )}
        </>
      ) : favorites.length === 0 && recents.length === 0 ? (
        <div className="py-14 flex flex-col items-center text-center">
          <div className="w-12 h-12 rounded-full bg-bg-overlay flex items-center justify-center mb-3">
            <MapPin size={20} className="text-ink-muted" strokeWidth={1.75} />
          </div>
          <p className="text-[15px] font-medium text-ink">Search for a place</p>
          <p className="text-[13px] text-ink-muted mt-1">Star one to keep it at the top.</p>
        </div>
      ) : (
        <>
          {favorites.length > 0 && (
            <FormGroup header="Favorites" className="!mt-1">
              {favorites.map(loc => (
                <Row key={loc} text={loc} primary={loc} icon={<Star size={17} className="text-gold" fill="currentColor" />} />
              ))}
            </FormGroup>
          )}
          {recents.length > 0 && (
            <FormGroup header="Recents" className={favorites.length ? undefined : '!mt-1'}>
              {recents.map(loc => (
                <Row key={loc} text={loc} primary={loc} icon={<Clock size={17} strokeWidth={1.75} className={muted} />} />
              ))}
            </FormGroup>
          )}
        </>
      )}
    </Sheet>
  )
}
