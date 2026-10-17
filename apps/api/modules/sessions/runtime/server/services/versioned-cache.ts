// Bounded, process-local cache for large parsed files. Unlike an unbounded cache
// keyed by every file version, obsolete versions and rejected reads are discarded.
export function createVersionedCache<T>(maxEntries = 32, maxBytes = 32 * 1024 * 1024, ttl = 30_000) {
  const entries = new Map<string, { version: string, expires: number, bytes: number, value: Promise<T> }>()
  let bytes = 0
  function remove(key: string) {
    const entry = entries.get(key)
    if (entry)
      bytes -= entry.bytes
    entries.delete(key)
  }
  return {
    async get(key: string, version: string, size: number, load: () => Promise<T>): Promise<T> {
      const cached = entries.get(key)
      if (cached?.version === version && cached.expires > Date.now()) {
        entries.delete(key)
        entries.set(key, cached)
        return cached.value
      }
      remove(key)
      const entry = { version, expires: Date.now() + ttl, bytes: size, value: Promise.resolve().then(load) }
      // Very large sessions are usable, but must not evict/retain the entire cache.
      if (size <= maxBytes) {
        entries.set(key, entry)
        bytes += size
        while (entries.size > maxEntries || bytes > maxBytes)
          remove(entries.keys().next().value!)
      }
      try {
        return await entry.value
      }
      catch (error) {
        if (entries.get(key) === entry)
          remove(key)
        throw error
      }
    },
  }
}
