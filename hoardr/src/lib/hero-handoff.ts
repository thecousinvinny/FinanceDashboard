import { useSyncExternalStore } from 'react'

/**
 * The greeting card's hero flying onto Home. While it's in the air, Home's own
 * hero is hidden, and it skips its entrance for that visit — it is already
 * drawn, so it should simply be there when the flying copy lands on it.
 */

let flying = false
const listeners = new Set<() => void>()
const emit = () => listeners.forEach(l => l())

export function beginHeroHandoff() { flying = true; emit() }
export function endHeroHandoff()   { flying = false; emit() }
export function heroHandoffActive() { return flying }

export function useHeroHandoff(): boolean {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb) } },
    () => flying,
    () => false,
  )
}
