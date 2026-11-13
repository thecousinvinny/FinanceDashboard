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
  arriveUntil = performance.now() + ARRIVE_MS
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
  arriveUntil = performance.now() + ARRIVE_MS
  localAt = performance.now()
  setTimeout(() => { version++ }, 2500)
}

/**
 * True for a few seconds after data changed (an add, an undo, a change from
 * another device). Rows that mount then are the new ones, and animate in
 * (`SwipeToDelete`); rows mounting any other time (first load, paging) don't.
 */
const ARRIVE_MS = 4000
let arriveUntil = 0
export function rowsArriving() { return performance.now() < arriveUntil }

/**
 * A change made on this device (a toast: add, payment, delete, undo) in the
 * last few seconds. Cues meant to explain a change — Home's Net badge — skip
 * those: you just made it, and the roll already shows it.
 */
let localAt = -Infinity
export function changedHereRecently() { return performance.now() - localAt < 8000 }
