const KEY = 'week-start-monday'

export function getWeekStartsMonday(): boolean {
  try { return localStorage.getItem(KEY) === '1' } catch { return false }
}

export function setWeekStartsMonday(v: boolean): void {
  try { localStorage.setItem(KEY, v ? '1' : '0') } catch {}
}
