/**
 * A counter bumped whenever the user changes data (every add / payment /
 * delete shows a toast, so `showToast` bumps it). Screens compare it on
 * return to decide whether a background refresh is worth running — data
 * changes rarely, so most tab switches now skip the refetch entirely.
 */
let version = 0

export function markDataChanged() { version++ }

// Back in the app after a minute or more away (another device, Google
// Calendar, a failed load while the phone slept): refresh screens on return
if (typeof document !== 'undefined') {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) version++
  })
}
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
