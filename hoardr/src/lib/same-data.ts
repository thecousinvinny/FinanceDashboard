// Background refreshes run every time a kept-alive screen is shown again, and
// their results land in the middle of the tab transition and the entrance
// animations. Setting state to fresh-but-identical arrays re-renders the whole
// screen right then (charts re-layout, bars collapse and regrow) — that's the
// stutter. Callers check here first and skip the setState when nothing changed.

/** True when `value` serializes the same as the last value seen through `ref`; otherwise remembers it. */
export function sameAsLast(ref: { current: string }, value: unknown): boolean {
  const sig = JSON.stringify(value)
  if (sig === ref.current) return true
  ref.current = sig
  return false
}
