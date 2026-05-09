import { redirect } from 'next/navigation'

// Middleware handles the real redirect logic.
// This is a fallback in case middleware doesn't fire.
export default function RootPage() {
  redirect('/home')
}
