'use client'

import { useEffect, useState } from 'react'
import { Sun, Moon, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ThemeToggle() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark')

  useEffect(() => {
    const stored = (localStorage.getItem('theme') ?? 'dark') as 'dark' | 'light'
    setTheme(stored)
    document.documentElement.classList.toggle('light', stored === 'light')
  }, [])

  function toggle() {
    const next = theme === 'dark' ? 'light' : 'dark'
    setTheme(next)
    document.documentElement.classList.toggle('light', next === 'light')
    localStorage.setItem('theme', next)
  }

  return (
    <button
      onClick={toggle}
      className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted select-none active:scale-95 transition-transform"
      aria-label="Toggle theme"
    >
      {theme === 'dark'
        ? <Sun  size={14} strokeWidth={1.75} />
        : <Moon size={14} strokeWidth={1.75} />}
    </button>
  )
}

export function SignOutButton() {
  async function signOut() {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  return (
    <button
      onClick={signOut}
      className="w-8 h-8 flex items-center justify-center rounded-full bg-bg-overlay text-ink-muted select-none active:scale-95 transition-transform"
      aria-label="Sign out"
    >
      <LogOut size={14} strokeWidth={1.75} />
    </button>
  )
}
