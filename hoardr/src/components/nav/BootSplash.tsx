'use client'

import { useLayoutEffect, useState } from 'react'
import { Coins } from 'lucide-react'
import { BOOT_SPLASH_CLASS } from '@/lib/greeting-boot'
import { onScreenReady, replayActiveScreen } from '@/lib/tab-nav'
import { LoadBars } from '@/components/ui/LoadBars'

const MAX_MS  = 3000   // never hold the app longer than this
const FADE_MS = 380

/**
 * Load screen for app loads where the daily brief isn't due (the brief is the
 * load screen otherwise). The <head> script has already covered the page
 * (`boot-splash`), so the server-rendered skeletons — which never matched the
 * real layout — aren't seen. It stays up until the visible screen reports its
 * data loaded, then fades out while the screen's entrance animations play, so
 * the first thing seen is the finished screen arriving, not a pop-in.
 */
export function BootSplash() {
  const [show,   setShow]   = useState(false)
  const [fading, setFading] = useState(false)

  useLayoutEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains(BOOT_SPLASH_CLASS)) return
    setShow(true)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      replayActiveScreen()   // entrance animations ran unseen under the cover
      setFading(true)
      setTimeout(() => setShow(false), FADE_MS)
    }
    const stop = onScreenReady(finish)
    const cap  = setTimeout(finish, MAX_MS)
    return () => { stop(); clearTimeout(cap) }
  }, [])

  // Our cover is painted: the head script's one can go
  useLayoutEffect(() => {
    if (show) document.documentElement.classList.remove(BOOT_SPLASH_CLASS)
  }, [show])

  if (!show) return null

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed', inset: 0, zIndex: 79,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        background: 'var(--color-bg-base)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <div style={{
        width: 64, height: 64, borderRadius: 20,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #E9CD7A 0%, #D4AF37 45%, #B08A2A 100%)',
        boxShadow: '0 10px 30px rgba(212,175,55,0.25), inset 0 1px 0 rgba(255,255,255,0.45)',
      }}>
        <Coins size={30} strokeWidth={2} color="#1a1200" />
      </div>
      <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)', paddingLeft: '0.28em' }}>
        Hoardr
      </p>
      {/* Only if the wait is noticeable */}
      <div className="greet-fade" style={{ ['--d' as string]: '500ms', marginTop: 8 }}>
        <LoadBars />
      </div>
    </div>
  )
}
