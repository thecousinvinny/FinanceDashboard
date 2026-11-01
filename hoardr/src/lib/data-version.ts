/**
 * A counter bumped whenever the user changes data (every add / payment /
 * delete shows a toast, so `showToast` bumps it). Screens compare it on
 * return to decide whether a background refresh is worth running — data
 * changes rarely, so most tab switches now skip the refetch entirely.
 */
let version = 0

export function markDataChanged() { version++ }
export function dataVersion() { return version }

/**
 * Bump now and again a moment later: writes are optimistic (the toast shows
 * before the insert lands), so a refresh triggered right away could read the
 * old rows and use up the change.
 */
export function markDataChangedSoon() {
  version++
  setTimeout(() => { version++ }, 2500)
}
