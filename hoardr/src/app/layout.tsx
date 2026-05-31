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
            __html: `(function(){var t=localStorage.getItem('theme');if(t==='charcoal-slate'){document.documentElement.classList.add('charcoal-slate');document.documentElement.style.background='#191B1F'}else if(t==='cool-linen'){document.documentElement.classList.add('cool-linen');document.documentElement.style.background='#F0F2F5';document.documentElement.style.colorScheme='light'}else if(t==='light'){document.documentElement.classList.add('light')}else if(t==='midnight-teal'){document.documentElement.classList.add('midnight-teal');document.documentElement.style.background='#141414'}})();(function(){var s=localStorage.getItem('sem-colors');if(!s)return;try{var c=JSON.parse(s),el=document.documentElement;function r(h){var n=parseInt(h.replace('#',''),16);return((n>>16)&255)+','+((n>>8)&255)+','+(n&255)}if(c.income){if(c.income.type==='flat'){el.style.setProperty('--sem-income',c.income.hex);el.style.setProperty('--sem-income-rgb',r(c.income.hex));el.style.setProperty('--sem-income-from',c.income.hex);el.style.setProperty('--sem-income-to',c.income.hex);el.style.setProperty('--sem-income-angle','135deg')}else{el.style.setProperty('--sem-income',c.income.from);el.style.setProperty('--sem-income-rgb',r(c.income.from));el.style.setProperty('--sem-income-from',c.income.from);el.style.setProperty('--sem-income-to',c.income.to);el.style.setProperty('--sem-income-angle',c.income.angle+'deg');el.setAttribute('data-inc-grad','')}}if(c.expense){if(c.expense.type==='flat'){el.style.setProperty('--sem-expense',c.expense.hex);el.style.setProperty('--sem-expense-rgb',r(c.expense.hex));el.style.setProperty('--sem-expense-from',c.expense.hex);el.style.setProperty('--sem-expense-to',c.expense.hex);el.style.setProperty('--sem-expense-angle','135deg')}else{el.style.setProperty('--sem-expense',c.expense.from);el.style.setProperty('--sem-expense-rgb',r(c.expense.from));el.style.setProperty('--sem-expense-from',c.expense.from);el.style.setProperty('--sem-expense-to',c.expense.to);el.style.setProperty('--sem-expense-angle',c.expense.angle+'deg');el.setAttribute('data-exp-grad','')}}if(c.sub){if(c.sub.type==='flat'){el.style.setProperty('--sem-sub',c.sub.hex);el.style.setProperty('--sem-sub-from',c.sub.hex);el.style.setProperty('--sem-sub-to',c.sub.hex);el.style.setProperty('--sem-sub-angle','135deg')}else{el.style.setProperty('--sem-sub',c.sub.from);el.style.setProperty('--sem-sub-from',c.sub.from);el.style.setProperty('--sem-sub-to',c.sub.to);el.style.setProperty('--sem-sub-angle',c.sub.angle+'deg');el.setAttribute('data-sub-grad','')}}}catch(e){}})()`,
          }}
        />
      </head>
      <body className="bg-bg-base text-ink font-sans antialiased" style={{ backgroundColor: '#080810' }} suppressHydrationWarning>
        {children}
      </body>
    </html>
  )
}
