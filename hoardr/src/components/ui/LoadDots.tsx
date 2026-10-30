/**
 * The app's loading indicator: three gold dots hopping in a staggered wave,
 * each lifting, brightening and settling with a soft spring (`load-dots` in
 * globals.css). Transform + opacity only, so it stays smooth while the main
 * thread is busy loading.
 */
export function LoadDots({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <div className={`load-dots ${className ?? ''}`} style={style} role="status" aria-label="Loading">
      <span /><span /><span />
    </div>
  )
}
