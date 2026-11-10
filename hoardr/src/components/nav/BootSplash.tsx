'use client'

import { useLayoutEffect, useState } from 'react'
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
  // Rendered into the server HTML and shown by CSS while the head script's
  // `boot-splash` class is on, so the logo is there from the very first frame
  // — it used to be a blank cover until React mounted and the image loaded.
  const [show,   setShow]   = useState(false)
  const [fading, setFading] = useState(false)
  const [gone,   setGone]   = useState(false)

  useLayoutEffect(() => {
    const root = document.documentElement
    if (!root.classList.contains(BOOT_SPLASH_CLASS)) { setGone(true); return }
    setShow(true)
    let done = false
    const finish = () => {
      if (done) return
      done = true
      replayActiveScreen()   // entrance animations ran unseen under the cover
      setFading(true)
      setTimeout(() => setGone(true), FADE_MS)
    }
    const stop = onScreenReady(finish)
    const cap  = setTimeout(finish, MAX_MS)
    return () => { stop(); clearTimeout(cap) }
  }, [])

  // React holds it open now: the class can go
  useLayoutEffect(() => {
    if (show) document.documentElement.classList.remove(BOOT_SPLASH_CLASS)
  }, [show])

  if (gone) return null

  return (
    <div
      aria-hidden
      className="boot-splash-el"
      data-show={show ? '' : undefined}
      style={{
        position: 'fixed', inset: 0, zIndex: 79,
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14,
        background: 'var(--color-bg-base)',
        opacity: fading ? 0 : 1,
        transition: `opacity ${FADE_MS}ms ease`,
        pointerEvents: fading ? 'none' : 'auto',
      }}
    >
      <SplashMark />
    </div>
  )
}

/**
 * The load screen's contents: the app icon, the name, and load bars that fade
 * in only if the wait is noticeable. Also the daily brief's loading state, so
 * every app open looks the same whether or not the brief is due.
 */
export function SplashMark() {
  return (
    <>
      {/* The app's own icon, as on the home screen */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/icons/icon-512.png" alt="" width={72} height={72} fetchPriority="high"
        style={{ width: 72, height: 72, borderRadius: 16, boxShadow: '0 10px 30px rgba(0,0,0,0.35), 0 0 0 1px rgb(var(--rgb-ink) / 0.08)' }}
      />
      <p style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.28em', textTransform: 'uppercase', color: 'rgb(var(--rgb-ink-muted))', fontFamily: 'var(--font-montserrat)', paddingLeft: '0.28em' }}>
        Hoardr
      </p>
      <div className="greet-fade" style={{ ['--d' as string]: '500ms', marginTop: 8 }}>
        <LoadBars />
      </div>
    </>
  )
}
