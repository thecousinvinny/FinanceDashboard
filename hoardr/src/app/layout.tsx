import type { Metadata, Viewport } from 'next'
import { Inter, DM_Mono } from 'next/font/google'
import './globals.css'

const inter = Inter({
  subsets:  ['latin'],
  variable: '--font-inter',
  display:  'swap',
})

const dmMono = DM_Mono({
  subsets:  ['latin'],
  weight:   ['300', '400', '500'],
  variable: '--font-dm-mono',
  display:  'swap',
})

export const metadata: Metadata = {
  title:       'Hoardr',
  description: 'Your personal finance hoard',
  appleWebApp: {
    capable:         true,
    statusBarStyle:  'black-translucent',
    title:           'Hoardr',
  },
  icons: {
    apple: '/apple-touch-icon.png',
  },
}

export const viewport: Viewport = {
  width:        'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor:   '#080810',
  viewportFit:  'cover',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} ${dmMono.variable}`}>
      {/* Restore theme before first paint to prevent flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light')})()`,
          }}
        />
      </head>
      <body className="bg-bg-base text-ink font-sans antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
