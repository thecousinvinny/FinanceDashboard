/**
 * The app's loading indicator: six gold bars that flatten to a baseline and
 * rise to uneven heights like a small bar chart, in a left-to-right wave
 * (`load-bars` in globals.css). scaleY only, so it stays smooth while the
 * main thread is busy loading.
 */
export function LoadBars({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`load-bars ${className ?? ''}`} style={style} role="status" aria-label="Loading">
      <span /><span /><span /><span /><span /><span />
    </div>
  )
}
