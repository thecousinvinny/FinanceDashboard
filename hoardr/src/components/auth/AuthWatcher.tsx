'use client'

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { showToast } from '@/lib/toast'

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
    async function revalidate() {
      let session
      try {
        session = (await supabase.auth.getSession()).data.session
      } catch {
        return // network error while offline — don't punish the user
      }
      if (!session) { forceReauth(); return }
      const expMs = (session.expires_at ?? 0) * 1000
      if (expMs && expMs <= Date.now()) {
        const { error } = await supabase.auth.refreshSession()
        if (error) forceReauth()
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
