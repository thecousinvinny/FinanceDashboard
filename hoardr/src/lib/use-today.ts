'use client'

import { useEffect, useState } from 'react'

const dayKey = (d: Date) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`

/**
 * Today's date that moves forward on its own. Screens stay mounted for hours
 * (keep-alive, a desktop tab left open overnight), so a `new Date()` captured
 * at mount kept showing yesterday. Ticks at local midnight, and re-checks when
 * the app becomes visible again (a sleeping computer can miss the timer).
 * The returned Date only changes identity when the calendar day changes.
 */
export function useToday(): Date {
  const [today, setToday] = useState(() => new Date())

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const sync = () => {
      const now = new Date()
      setToday(prev => (dayKey(prev) === dayKey(now) ? prev : now))
    }
    const schedule = () => {
      const now = new Date()
      const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
      timer = setTimeout(() => { sync(); schedule() }, next.getTime() - now.getTime())
    }
    const onVisible = () => { if (document.visibilityState === 'visible') sync() }
    schedule()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', sync)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', sync)
    }
  }, [])

  return today
}
