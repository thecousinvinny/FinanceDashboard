/**
 * A counter bumped whenever the user changes data (every add / payment /
 * delete shows a toast, so `showToast` bumps it). Screens compare it on
 * return to decide whether a background refresh is worth running — data
 * changes rarely, so most tab switches now skip the refetch entirely.
 */
let version = 0

export function markDataChanged() { version++ }

/**
 * Changes made somewhere else (another device, through `live-sync.ts`, or
 * while this one was in the background). Hidden screens catch up through the
 * version on their next return; the visible one is told now so its numbers
 * move without a refresh.
 */
const remoteListeners = new Set<() => void>()
export function markRemoteChange() {
  version++
  remoteListeners.forEach(l => l())
}
export function onRemoteChange(l: () => void) { remoteListeners.add(l); return () => { remoteListeners.delete(l) } }

// Back in the app after a minute or more away (Google Calendar, a failed load
// while the phone slept; shorter gaps are covered by live-sync reconnecting): refresh
if (typeof document !== 'undefined') {
  let hiddenAt = 0
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) hiddenAt = Date.now()
    else if (hiddenAt && Date.now() - hiddenAt > 60_000) markRemoteChange()
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
