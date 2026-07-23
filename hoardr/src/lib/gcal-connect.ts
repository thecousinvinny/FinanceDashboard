'use client'

import { createClient } from '@/lib/supabase/client'

// Re-grant Google Calendar access WITHOUT signing out of the app.
//
// The calendar refresh token lives per-user in profiles.google_refresh_token and
// is used server-side by /api/calendar for every device — so once a valid token
// is stored, Calendar works everywhere. The only thing that used to require a full
// sign-out was *re-granting* a stale/missing token.
//
// This re-runs Google's OAuth consent as the SAME account (prompt=consent forces a
// fresh refresh token; login_hint pre-selects the account so there's no picker).
// The existing /auth/callback handler stores the returned token. Because it's the
// same user, the Supabase session is simply re-issued — you are never logged out.
export async function connectGoogleCalendar(email?: string | null) {
  const supabase = createClient()
  await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo:  `${location.origin}/auth/callback`,
      scopes:      'https://www.googleapis.com/auth/calendar',
      queryParams: {
        access_type: 'offline',
        prompt:      'consent',
        ...(email ? { login_hint: email } : {}),
      },
    },
  })
}
