import { RefreshCw } from 'lucide-react'

interface Props {
  indicatorRef: React.RefObject<HTMLDivElement | null>
  refreshing:   boolean
}

/**
 * Floating glass refresh badge, positioned by usePullToRefresh via the ref
 * (no re-render per frame). It floats over the content instead of pushing it.
 */
export function PullIndicator({ indicatorRef, refreshing }: Props) {
  return (
    <div
      ref={indicatorRef}
      aria-hidden={!refreshing}
      className="frost fixed z-[45] flex items-center justify-center rounded-full pointer-events-none"
      style={{
        top: 'calc(env(safe-area-inset-top, 0px) + 8px)',
        left: '50%',
        width: 38, height: 38,
        opacity: 0,
        transform: 'translate(-50%, -44px) scale(0.7)',
        willChange: 'transform, opacity',
      }}
    >
      <span className="flex" style={{ willChange: 'transform' }}>
        <RefreshCw size={17} strokeWidth={2.2} className={`text-gold ${refreshing ? 'animate-spin' : ''}`} />
      </span>
    </div>
  )
}
