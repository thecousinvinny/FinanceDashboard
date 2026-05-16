import { RefreshCw } from 'lucide-react'

interface Props {
  distance:  number
  threshold: number
  refreshing: boolean
}

export function PullIndicator({ distance, threshold, refreshing }: Props) {
  if (!refreshing && distance === 0) return null
  const progress = Math.min(distance / threshold, 1)

  return (
    <div
      className="flex items-center justify-center overflow-hidden"
      style={{ height: refreshing ? 44 : distance * 0.6 }}
    >
      <RefreshCw
        size={18}
        className={`text-gold ${refreshing ? 'animate-spin' : 'transition-transform duration-75'}`}
        style={refreshing ? undefined : {
          transform: `rotate(${progress * 200}deg)`,
          opacity: progress,
        }}
      />
    </div>
  )
}
