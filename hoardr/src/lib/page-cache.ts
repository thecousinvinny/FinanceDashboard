// Module-level cache — survives tab switches within the same session.
// Pages show stale data instantly, then silently refresh in the background.

type Entry = { data: unknown; at: number }
const store = new Map<string, Entry>()
const TTL = 60_000  // 60 seconds

export const pageCache = {
  get<T>(key: string): T | undefined {
    const e = store.get(key)
    if (!e || Date.now() - e.at > TTL) return undefined
    return e.data as T
  },
  set(key: string, data: unknown) {
    store.set(key, { data, at: Date.now() })
  },
  clear(key: string) {
    store.delete(key)
  },
}
