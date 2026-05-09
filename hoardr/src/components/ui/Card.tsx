import { cn } from '@/lib/utils'

interface CardProps {
  children:  React.ReactNode
  className?: string
  elevated?:  boolean
  onClick?:   () => void
}

export function Card({ children, className, elevated, onClick }: CardProps) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      onClick={onClick}
      className={cn(
        'rounded-card border border-white/[0.06] overflow-hidden',
        elevated ? 'bg-bg-elevated' : 'bg-bg-surface',
        onClick  ? 'w-full text-left active:scale-[0.98] transition-transform' : '',
        className,
      )}
    >
      {children}
    </Tag>
  )
}
