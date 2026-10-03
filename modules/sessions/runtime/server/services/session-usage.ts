import type { SessionInfo } from '@earendil-works/pi-coding-agent'
import type { SessionUsage } from '../../shared/types/sessions.ts'
import { readFile, stat } from 'node:fs/promises'
import { parseSessionEntries, SessionManager } from '@earendil-works/pi-coding-agent'
import { sessionUsage } from './status.ts'

// Cache only small totals, never conversation entries. Bound memory and share concurrent reads.
const cache = new Map<string, { version: string, usage: Promise<SessionUsage> }>()
const MAX_CACHE_ENTRIES = 1000

export async function readSessionUsage(info: SessionInfo): Promise<SessionUsage | null> {
  try {
    const stats = await stat(info.path)
    const version = `${info.id}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`
    const cached = cache.get(info.path)
    if (cached?.version === version) {
      cache.delete(info.path)
      cache.set(info.path, cached)
      return await cached.usage
    }
    const usage = (async () => {
      const entries = parseSessionEntries(await readFile(info.path, 'utf8'))
      if (!entries.some(entry => entry.type === 'session' && entry.id === info.id)) {
        throw new Error('Session header does not match')
      }
      // In-memory migration preserves legacy files and matches conversation usage.
      const totals = sessionUsage(SessionManager.inMemory(info.cwd, undefined, entries))
      return { input: totals.input, output: totals.output, cacheRead: totals.cacheRead, cacheWrite: totals.cacheWrite, cost: totals.cost }
    })()
    const item = { version, usage }
    cache.delete(info.path)
    cache.set(info.path, item)
    if (cache.size > MAX_CACHE_ENTRIES)
      cache.delete(cache.keys().next().value!)
    try {
      return await usage
    }
    catch (error) {
      if (cache.get(info.path) === item)
        cache.delete(info.path)
      throw error
    }
  }
  catch {
    // A deleted/unreadable session must not break the overview or appear free.
    return null
  }
}
