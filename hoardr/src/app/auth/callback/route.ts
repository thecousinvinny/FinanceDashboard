import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const code = searchParams.get('code')

  // Use the Host header so redirects work when accessed via IP (mobile testing)
  const host   = request.headers.get('host') ?? 'localhost:3000'
  const proto  = request.headers.get('x-forwarded-proto') ?? 'http'
  const origin = `${proto}://${host}`

  if (code) {
    // Collect cookies so we can apply them directly to the redirect response.
    // Using cookies().set() from next/headers does NOT carry over to a
    // NextResponse.redirect() — the two are separate response objects.
    const pendingCookies: { name: string; value: string; options?: Record<string, unknown> }[] = []

    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return request.cookies.getAll()
          },
          setAll(cookiesToSet: { name: string; value: string; options?: Record<string, unknown> }[]) {
            pendingCookies.push(...cookiesToSet)
          },
        },
      },
    )

    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      // Persist the Google OAuth refresh token so the calendar API route can use it.
      // provider_refresh_token is only present immediately after the OAuth exchange.
      if (data.session?.provider_refresh_token) {
        await supabase.from('profiles').upsert(
          { id: data.session.user.id, google_refresh_token: data.session.provider_refresh_token },
          { onConflict: 'id' },
        )
      }

      // Apply auth cookies directly to the redirect response.
      const response = NextResponse.redirect(`${origin}/home`)
      pendingCookies.forEach(({ name, value, options }) => {
        response.cookies.set(name, value, options as Parameters<typeof response.cookies.set>[2])
      })
      return response
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`)
}
