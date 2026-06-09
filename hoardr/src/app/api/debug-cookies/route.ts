import { NextRequest, NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const cookieStore = await cookies()
  const allCookies = cookieStore.getAll()
  const cookieNames = allCookies.map(c => c.name)

  const rawCookieHeader = req.headers.get('cookie') ?? ''
  const rawNames = rawCookieHeader.split(';').map(c => c.trim().split('=')[0]).filter(Boolean)

  const supabase = await createClient()
  const { data: { user: userFromGetUser } } = await supabase.auth.getUser()
  const { data: { session } }              = await supabase.auth.getSession()

  return NextResponse.json({
    cookieStoreNames: cookieNames,
    rawHeaderNames:   rawNames,
    getUser:          userFromGetUser?.id ?? null,
    getSession:       session?.user?.id ?? null,
  })
}
