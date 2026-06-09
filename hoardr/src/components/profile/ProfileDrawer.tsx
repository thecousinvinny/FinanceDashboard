'use client'

import { useEffect, useMemo, useState } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

// Hide on pages that have their own back/settings header
const HIDDEN_ON = ['/profile', '/settings']

const LS_AVATAR   = 'hoardr-avatar-url'
const LS_INITIALS = 'hoardr-avatar-initials'

// Module-level cache — survives tab switches and re-mounts with no flash.
// NOT seeded at module level: reading localStorage here runs on the server too
// (window === undefined), giving different initial state than the client → hydration #418.
// Instead, seed from localStorage in the first useEffect (client-only, no mismatch).
let _cachedAvatar:   string | null = null
let _cachedInitials: string        = '?'

export function ProfileDrawer() {
  const pathname = usePathname()
  const router   = useRouter()
  const supabase = useMemo(() => createClient(), [])

  const [avatarSrc, setAvatarSrc] = useState<string | null>(_cachedAvatar)
  const [initials,  setInitials]  = useState(_cachedInitials)

  function applyAvatar(src: string | null) {
    _cachedAvatar = src
    if (src) localStorage.setItem(LS_AVATAR, src)
    setAvatarSrc(src)
  }
  function applyInitials(ini: string) {
    _cachedInitials = ini
    localStorage.setItem(LS_INITIALS, ini)
    setInitials(ini)
  }

  // Seed module cache from localStorage on first client render (avoids hydration mismatch)
  useEffect(() => {
    if (!_cachedAvatar) {
      const stored = localStorage.getItem(LS_AVATAR)
      if (stored) { _cachedAvatar = stored; setAvatarSrc(stored) }
    }
    if (_cachedInitials === '?') {
      const stored = localStorage.getItem(LS_INITIALS)
      if (stored) { _cachedInitials = stored; setInitials(stored) }
    }
  }, [])

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user
      if (!u) return
      const name = u.user_metadata?.full_name ?? u.user_metadata?.name ?? ''
      applyInitials(
        name
          ? name.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()
          : (u.email?.[0] ?? '?').toUpperCase()
      )
      if (u.user_metadata?.avatar_url) applyAvatar(u.user_metadata.avatar_url as string)
    })
  }, [supabase])

  useEffect(() => {
    supabase.from('profiles').select('avatar_url, display_name').single().then(({ data }) => {
      if (data?.avatar_url)   applyAvatar(data.avatar_url as string)
      if (data?.display_name) {
        const dn = data.display_name as string
        applyInitials(dn.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase())
      }
    })
  }, [supabase])

  if (HIDDEN_ON.some(p => pathname.startsWith(p))) return null

  return (
    <button
      onClick={() => router.push('/profile')}
      aria-label="Profile"
      className="fixed overflow-hidden rounded-full select-none active:scale-95 transition-transform"
      style={{
        top:       'calc(env(safe-area-inset-top, 44px) + 10px)',
        right:     16,
        width:     36,
        height:    36,
        zIndex:    45,
        boxShadow: '0 2px 8px rgba(0,0,0,0.4), 0 0 0 1.5px rgba(212,175,55,0.4)',
      }}
    >
      {avatarSrc
        ? <img src={avatarSrc} alt="avatar" className="w-full h-full object-cover" />
        : <div className="w-full h-full gradient-gold flex items-center justify-center">
            <span className="text-[13px] font-bold text-white">{initials}</span>
          </div>
      }
    </button>
  )
}
