import type { RealtimeChannel } from '@supabase/supabase-js'
import { createClient } from '@/lib/supabase/client'
import { markRemoteChange } from '@/lib/data-version'

/**
 * Live updates across devices: one Supabase Realtime channel on the public
 * schema (the tables in the `supabase_realtime` publication — see
 * `20261103_realtime_publication.sql`). RLS decides what reaches this
 * session, so it only hears its own rows. A burst of changes (an add touches
 * expenses + a category) becomes one refresh.
 *
 * Local writes echo back here too; the screen that made them has usually
 * reloaded already, and `sameAsLast` makes the second load a no-op.
 *
 * iOS drops the socket while the app is in the background. It reconnects on
 * its own, and every re-subscribe after the first refreshes too, since
 * changes made while it was down were never sent.
 */
let channel: RealtimeChannel | null = null
let timer: ReturnType<typeof setTimeout> | null = null

function changed() {
  if (timer) clearTimeout(timer)
  timer = setTimeout(() => { timer = null; markRemoteChange() }, 700)
}

export function startLiveSync() {
  if (channel || typeof window === 'undefined') return
  const supabase = createClient()
  let subscribedOnce = false
  channel = supabase
    .channel('live-data')
    .on('postgres_changes', { event: '*', schema: 'public' }, changed)
    .subscribe(status => {
      if (status !== 'SUBSCRIBED') return
      if (subscribedOnce) changed()
      subscribedOnce = true
    })
}
