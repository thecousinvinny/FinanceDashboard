import { createServerClient } from '@supabase/ssr'
import { isAuthRetryableFetchError } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

// Supabase stores the session in `sb-<ref>-auth-token` (chunked as .0, .1 … when large)
const isAuthCookie = (name: string) => name.startsWith('sb-') && name.includes('-auth-token')

// Long-lived, first-party, server-set. Safari's ITP caps cookies written by
// JavaScript at 7 days, so the browser client's own writes would expire a
// week after the last visit; re-issuing them here from an HTTP response
// keeps the login alive across long gaps.
const AUTH_COOKIE_OPTS = { path: '/', sameSite: 'lax' as const, maxAge: 60 * 60 * 24 * 400 }

export async function middleware(request: NextRequest) {
  const pathname    = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')
  const isRoot      = pathname === '/'
  const hasSession  = request.cookies.getAll().some(c => isAuthCookie(c.name))

  // Client-side navigations and <Link> prefetches are RSC fetches the router
  // routinely aborts (fast tab switching, prefetch churn). If one of those
  // rotated the refresh token, the response carrying the new cookie never
  // landed — the browser kept the now-revoked token, Supabase flagged its next
  // use as reuse and killed the session ("Refresh Token Not Found"). So only
  // full document loads, whose responses always arrive, may refresh; RSC
  // requests just check that a session cookie exists. All data is behind RLS
  // and the browser client keeps the token fresh, so this gate is UX only.
  // Next strips its own RSC headers before middleware sees them, so key off
  // the browser's Sec-Fetch-Dest: only a real page load is "document".
  const dest = request.headers.get('sec-fetch-dest')
  const isDocumentLoad = dest ? dest === 'document' : !request.headers.has('rsc')
  if (!isDocumentLoad) {
    if (!hasSession && !isAuthRoute) {
      const url = request.nextUrl.clone(); url.pathname = '/login'
      return NextResponse.redirect(url)
    }
    return NextResponse.next({ request })
  }

  let supabaseResponse = NextResponse.next({ request })
  let rotated = false

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          rotated = true
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...AUTH_COOKIE_OPTS, ...(options as object), maxAge: AUTH_COOKIE_OPTS.maxAge })
          )
        },
      },
    }
  )

  const { data: { user: verified }, error } = await supabase.auth.getUser()
  // Supabase unreachable (network blip, cold start) isn't the same as signed
  // out — with a session cookie present, let the page load; AuthWatcher on the
  // client handles a session that is genuinely dead.
  const user = verified ?? (hasSession && error && isAuthRetryableFetchError(error) ? {} : null)

  // No rotation this time — still re-issue the existing auth cookies from the
  // server so their expiry isn't the JS-written (ITP-capped) one.
  if (verified && !rotated) {
    request.cookies.getAll()
      .filter(c => isAuthCookie(c.name))
      .forEach(c => supabaseResponse.cookies.set(c.name, c.value, AUTH_COOKIE_OPTS))
  }

  // Carry any refreshed auth cookies (getUser may have rotated the token)
  // onto a redirect response — otherwise the browser keeps the old, now
  // revoked refresh token and the next refresh fails with
  // "Invalid Refresh Token: Refresh Token Not Found", signing the user out.
  const redirectTo = (path: string) => {
    const url = request.nextUrl.clone()
    url.pathname = path
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie => res.cookies.set(cookie))
    return res
  }

  if (isRoot) {
    return redirectTo(user ? '/home' : '/login')
  }

  if (!user && !isAuthRoute) {
    return redirectTo('/login')
  }

  if (user && isAuthRoute) {
    return redirectTo('/home')
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    // Exclude API + auth-callback routes (they handle their own auth) and
    // static assets, so middleware only guards actual pages. Fewer getUser()
    // calls = less refresh-token rotation churn.
    '/((?!api|auth|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
