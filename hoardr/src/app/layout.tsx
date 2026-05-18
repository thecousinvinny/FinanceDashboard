import type { Metadata, Viewport } from 'next'
import { Montserrat, Big_Shoulders } from 'next/font/google'
import './globals.css'

const montserrat = Montserrat({
  subsets:  ['latin'],
  weight:   ['300', '400', '500', '600', '700'],
  variable: '--font-montserrat',
  display:  'swap',
})

const bigShoulders = Big_Shoulders({
  subsets:  ['latin'],
  weight:   ['700', '800'],
  variable: '--font-big-shoulders',
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
    apple: '/DARKICON.png',
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
    <html lang="en" className={`${montserrat.variable} ${bigShoulders.variable}`} style={{ backgroundColor: '#080810' }}>
      {/* Restore theme before first paint to prevent flash */}
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='light')document.documentElement.classList.add('light')})()`,
          }}
        />
      </head>
      <body className="bg-bg-base text-ink font-sans antialiased" style={{ backgroundColor: '#080810' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
