import type { PostgrestError, SupabaseClient, User } from '@supabase/supabase-js'
import { showToast } from './toast'

const SESSION_MSG = 'Session expired — please sign in again'

/**
 * Surface a failed Supabase write instead of swallowing it.
 * Returns true when there was an error (so callers can bail).
 *
 *   const { error } = await supabase.from('expenses').insert(row)
 *   if (reportDbError(error, 'add expense')) return
 */
export function reportDbError(error: PostgrestError | null | undefined, action = 'save'): boolean {
  if (!error) return false
  console.error(`db ${action} error:`, JSON.stringify(error))
  const authLike =
    error.code === 'PGRST301' ||          // JWT expired
    error.code === '42501'   ||           // RLS violation (usually a dead session)
    /jwt|token|row-level|not.?authenticated/i.test(error.message ?? '')
  showToast(authLike ? SESSION_MSG : `Couldn't ${action}. Please try again.`, { type: 'delete' })
  return true
}

/**
 * Resolve the signed-in user for a write. Uses getSession() (which refreshes a
 * merely-expired access token) so we don't false-alarm on a recoverable
 * session. Toasts and returns null only when the session is genuinely gone —
 * the global AuthWatcher then routes to /login.
 */
export async function requireUser(
  supabase: SupabaseClient,
  action = 'save',
): Promise<User | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.user) {
    showToast(SESSION_MSG, { type: 'delete' })
    console.error(`db ${action}: no active session`)
    return null
  }
  return session.user
}
