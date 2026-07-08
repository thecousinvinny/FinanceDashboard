import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options as Parameters<typeof supabaseResponse.cookies.set>[2])
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  // Carry any refreshed auth cookies (getUser may have rotated the token)
  // onto a redirect response — otherwise the browser keeps the old, now
  // revoked refresh token and the next refresh fails with
  // "Invalid Refresh Token: Refresh Token Not Found", signing the user out.
  const redirectTo = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach(cookie => res.cookies.set(cookie))
    return res
  }

  const pathname = request.nextUrl.pathname
  const isAuthRoute = pathname.startsWith('/login')
  const isRoot      = pathname === '/'

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
