import { cn } from '@/lib/utils'

type Variant = 'default' | 'gold' | 'emerald' | 'ruby' | 'ghost'
type Size    = 'sm' | 'md' | 'lg'

const VARIANTS: Record<Variant, string> = {
  default: 'bg-bg-surface border border-white/[0.10] text-ink hover:border-white/20',
  gold:    'gradient-gold text-white hover:opacity-90',
  emerald: 'bg-emerald/10 border border-emerald/30 text-emerald hover:bg-emerald/20',
  ruby:    'bg-ruby/10 border border-ruby/30 text-ruby hover:bg-ruby/20',
  ghost:   'text-ink-muted hover:text-ink hover:bg-white/[0.04]',
}

const SIZES: Record<Size, string> = {
  sm: 'text-[11px] px-3 py-1.5 rounded-lg',
  md: 'text-[13px] px-4 py-2.5 rounded-xl',
  lg: 'text-[14px] px-5 py-3.5 rounded-xl font-semibold',
}

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant
  size?:    Size
}

export function Button({ variant = 'default', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center font-medium transition-all active:scale-95 select-none disabled:opacity-40 disabled:pointer-events-none',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
      {...props}
    />
  )
}

/** Circular floating action button (gold +) */
export function FAB({ onClick, 'aria-label': label = 'Add' }: { onClick?: () => void; 'aria-label'?: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className="w-10 h-10 rounded-full gradient-gold flex items-center justify-center text-white text-[22px] font-light select-none active:scale-90 transition-transform"
    >
      +
    </button>
  )
}
