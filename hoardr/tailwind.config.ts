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
          base:     'rgb(var(--rgb-bg-base)    / <alpha-value>)',
          surface:  'rgb(var(--rgb-bg-surface) / <alpha-value>)',
          elevated: 'rgb(var(--rgb-bg-elevated)/ <alpha-value>)',
          overlay:  'rgb(var(--rgb-bg-overlay) / <alpha-value>)',
        },
        gold: {
          DEFAULT: '#E8C46B',
          light:   '#F6DF9E',
          dark:    '#A47F23',
        },
        emerald: {
          DEFAULT: '#4ADE80',
          dark:    '#22B14C',
        },
        ruby: {
          DEFAULT: '#F36369',
        },
        ink: {
          DEFAULT: 'rgb(var(--rgb-ink)       / <alpha-value>)',
          muted:   'rgb(var(--rgb-ink-muted) / <alpha-value>)',
          faint:   'rgb(var(--rgb-ink-faint) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['var(--font-montserrat)', '-apple-system', 'BlinkMacSystemFont', 'sans-serif'],
        mono: ['var(--font-montserrat)', 'SF Mono', 'Courier New', 'monospace'],
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
        gold:  '0 0 20px rgba(232,196,107,0.35), 0 4px 12px rgba(0,0,0,0.4)',
      },
    },
  },
  plugins: [],
}

export default config
