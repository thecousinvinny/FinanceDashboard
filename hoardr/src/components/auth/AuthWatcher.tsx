'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/lib/toast'
import { syncAppPrefs } from '@/lib/app-prefs'

/**
 * Global session guard for the dashboard.
 *
 * The browser Supabase client auto-refreshes the access token, but that only
 * runs while the tab is open and focused. If the app (or PWA) sits in the
 * background for a long time, the refresh can lapse — then RLS writes
 * (adding an expense/wishlist item) silently fail because auth.uid() is null,
 * while the already-loaded UI keeps showing stale data.
 *
 * This watcher makes that state visible: when the session is gone it shows a
 * toast and sends the user back to /login to re-authenticate, instead of
 * letting adds fail quietly.
 */
export function AuthWatcher() {
  const router = useRouter()
  const redirecting = useRef(false)

  useEffect(() => {
    const supabase = createClient()

    // Pull shared defaults (default bank etc.) so this device matches the others
    void syncAppPrefs()

    function forceReauth() {
      if (redirecting.current) return
      redirecting.current = true
      showToast('Session expired — please sign in again', { type: 'delete' })
      // Let the toast paint before navigating away.
      setTimeout(() => router.replace('/login'), 600)
    }

    // Fires when gotrue gives up refreshing a lapsed session.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') forceReauth()
      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') redirecting.current = false
    })

    // Re-check when the app regains focus (covers the reopened-after-days
    // case where the auto-refresh timer never ran). We do NOT punish a merely
    // expired access token — the refresh token is usually still valid and can
    // silently restore the session, so writes just work again. Only when the
    // refresh itself fails (or there's no session at all) do we send to login.
    //
    // getSession() already refreshes an expired session itself, so there's no
    // separate refreshSession() call — a second refresh racing the first is
    // exactly the kind of token reuse that gets a session revoked.
    let inFlight = false
    let lastRun  = 0
    async function revalidate() {
      // focus + visibilitychange both fire on resume; run once
      if (inFlight || Date.now() - lastRun < 2000) return
      inFlight = true
      lastRun  = Date.now()
      try {
        const { data, error } = await supabase.auth.getSession()
        // A network failure (phone just woke, offline) is retryable — the
        // refresh token is still good, so never sign out over it.
        if (error && isAuthRetryableFetchError(error)) return
        if (!data.session) forceReauth()
      } catch {
        // network error while offline — don't punish the user
      } finally {
        inFlight = false
      }
    }

    const onVisible = () => { if (document.visibilityState === 'visible') revalidate() }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', revalidate)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', revalidate)
    }
  }, [router])

  return null
}
