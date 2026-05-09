import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base:     '#080810',
          surface:  '#0f0f1a',
          elevated: '#14141f',
          overlay:  '#1c1c2a',
        },
        gold: {
          DEFAULT: '#f59e0b',
          light:   '#fbbf24',
          dark:    '#d97706',
        },
        emerald: {
          DEFAULT: '#22c55e',
          dark:    '#16a34a',
        },
        ruby: {
          DEFAULT: '#ef4444',
        },
        ink: {
          DEFAULT: '#f0f0f8',
          muted:   '#7a7a9a',
          faint:   '#45455a',
        },
      },
      fontFamily: {
        sans: ['var(--font-inter)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['var(--font-dm-mono)', 'SF Mono', 'Courier New', 'monospace'],
      },
      borderRadius: {
        card:  '20px',
        pill:  '100px',
        sheet: '24px',
      },
      boxShadow: {
        card:  '0 1px 24px rgba(0,0,0,0.4)',
        sheet: '0 -8px 32px rgba(0,0,0,0.6)',
        nav:   '0 -1px 40px rgba(0,0,0,0.5)',
        gold:  '0 0 20px rgba(212,175,55,0.35), 0 4px 12px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}

export default config
