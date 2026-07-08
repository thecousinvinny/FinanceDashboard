'use client'

import { useState, useEffect } from 'react'

/**
 * True on PC/iPad-width viewports. Matches the calendar page's own
 * breakpoint (innerWidth >= 768) so the custom date picker shows on the
 * same screens the Notion-style calendar grid does.
 */
export function useIsLargeScreen(bp = 768): boolean {
  const [large, setLarge] = useState(false)
  useEffect(() => {
    const check = () => setLarge(window.innerWidth >= bp)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [bp])
  return large
}
