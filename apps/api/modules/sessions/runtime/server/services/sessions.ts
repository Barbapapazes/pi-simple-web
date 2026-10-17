import type { SessionEntry, SessionInfo } from '@earendil-works/pi-coding-agent'
import type { SessionDetail, SessionMetrics, SessionPage, SessionSummary, SessionUsage } from '@pi-simple-web/shared/sessions/types/sessions'
import type { ConversationBlock, ConversationEntry } from '@pi-simple-web/shared/types/conversation'
import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { parseSessionEntries, SessionManager } from '@earendil-works/pi-coding-agent'
import { readSessionUsage } from './session-usage.ts'
import { recordedStatus, statusEnvironment } from './status.ts'
import { createVersionedCache } from './versioned-cache.ts'

const indexes = new Map<string, { expires: number, value: Promise<Map<string, SessionInfo>> }>()
const details = createVersionedCache<SessionDetail | null>()

// Discovery is shared across detail requests; hits require only stat(), not listAll().
export async function findSessionInfo(id: string, sessionDir?: string): Promise<SessionInfo | undefined> {
  const key = sessionDir || ''
  let index = indexes.get(key)
  // Known IDs remain usable after the discovery TTL: stat() detects deletion
  // and file changes without rescanning every conversation on each idle check.
  const known = index && (await index.value).get(id)
  if (known)
    return known
  if (!index || index.expires <= Date.now()) {
    const value = listSessions(sessionDir).then((sessions) => {
      const byId = new Map<string, SessionInfo>()
      for (const info of sessions) {
        if (!byId.has(info.id))
          byId.set(info.id, info)
      }
      return byId
    })
    index = { expires: Date.now() + 5000, value }
    indexes.set(key, index)
    if (indexes.size > 16)
      indexes.delete(indexes.keys().next().value!)
    void value.catch(() => {
      if (indexes.get(key) === index)
        indexes.delete(key)
    })
  }
  return (await index.value).get(id)
}

export function invalidateSessionIndex(sessionDir?: string) {
  indexes.delete(sessionDir || '')
}

export async function sessionFile(id: string, sessionDir?: string, retry = true): Promise<{ info: SessionInfo, version: string, size: number } | null> {
  const info = await findSessionInfo(id, sessionDir)
  if (!info)
    return null
  try {
    const stats = await stat(info.path)
    const version = createHash('sha256').update(`${info.path}:${info.id}:${stats.ino}:${stats.mtimeMs}:${stats.ctimeMs}:${stats.size}`).digest('hex')
    return { info, version, size: stats.size }
  }
  catch {
    invalidateSessionIndex(sessionDir)
    return retry ? sessionFile(id, sessionDir, false) : null
  }
}

export async function listSessions(sessionDir?: string): Promise<SessionInfo[]> {
  const sessions = sessionDir
    ? await SessionManager.listAll(sessionDir)
    : await SessionManager.listAll()
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime() || a.id.localeCompare(b.id))
}

export async function listSessionSummaries(sessionDir?: string): Promise<SessionSummary[]> {
  const sessions = await listSessions(sessionDir)
  const summaries: SessionSummary[] = []
  let next = 0
  // Limit simultaneous conversation reads on a cold cache.
  await Promise.all(Array.from({ length: Math.min(8, sessions.length) }, async () => {
    while (next < sessions.length) {
      const index = next++
      const info = sessions[index]!
      summaries[index] = summarizeSession(info, await readSessionUsage(info))
    }
  }))
  return summaries
}

export async function listSessionPage(options: { offset: number, limit: number, search: string, workspace: string }, sessionDir?: string): Promise<SessionPage> {
  const sessions = await listSessions(sessionDir)
  const term = options.search.trim().toLowerCase()
  const filtered = sessions.filter(session =>
    (!options.workspace || session.cwd === options.workspace)
    && (!term || [session.name, session.firstMessage, session.cwd, session.id].some(value => value?.toLowerCase().includes(term))),
  )
  const page = filtered.slice(options.offset, options.offset + options.limit)
  const items = await Promise.all(page.map(async info => summarizeSession(info, await readSessionUsage(info))))
  const next = options.offset + items.length
  return {
    items,
    total: filtered.length,
    nextOffset: next < filtered.length ? next : null,
    workspaces: [...new Set(sessions.map(session => session.cwd))].sort(),
  }
}

export async function readSessionMetrics(sessionDir?: string): Promise<SessionMetrics> {
  const sessions = await listSessionSummaries(sessionDir)
  const result: SessionMetrics = {
    sessions: sessions.length,
    workspaces: new Set(sessions.map(session => session.cwd)).size,
    messages: 0,
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 },
    missingUsage: 0,
  }
  for (const session of sessions) {
    result.messages += session.messageCount
    if (!session.usage) {
      result.missingUsage++
      continue
    }
    for (const field of ['input', 'output', 'cacheRead', 'cacheWrite', 'cost'] as const)
      result.usage[field] += session.usage[field]
  }
  return result
}

export function summarizeSession(session: SessionInfo, usage: SessionUsage | null = null): SessionSummary {
  return {
    id: session.id,
    name: session.name,
    cwd: session.cwd,
    created: session.created.toISOString(),
    modified: session.modified.toISOString(),
    messageCount: session.messageCount,
    firstMessage: session.firstMessage,
    usage: usage ? { input: usage.input, output: usage.output, cacheRead: usage.cacheRead, cacheWrite: usage.cacheWrite, cost: usage.cost } : null,
  }
}

function formatData(value: unknown): string {
  return JSON.stringify(value, null, 2) ?? ''
}

function contentBlocks(content: unknown): ConversationBlock[] {
  if (typeof content === 'string')
    return [{ type: 'text', text: content }]
  if (!Array.isArray(content))
    return []
  return content.map((block): ConversationBlock => {
    if (block.type === 'text')
      return { type: 'text', text: block.text }
    if (block.type === 'thinking')
      return { type: 'thinking', text: block.thinking || 'Redacted thinking' }
    if (block.type === 'toolCall') {
      return {
        type: 'toolCall',
        name: block.name,
        toolCallId: block.id,
        arguments: block.arguments,
        text: block.name === 'read' ? (typeof block.arguments?.path === 'string' ? block.arguments.path : '') : formatData(block.arguments),
      }
    }
    // Never render SVG or remote image URLs from a conversation.
    if (block.type === 'image' && /^image\/(?:png|jpeg|gif|webp)$/.test(block.mimeType)
      && typeof block.data === 'string' && /^[A-Z0-9+/=\s]+$/i.test(block.data)) {
      return { type: 'image', src: `data:${block.mimeType};base64,${block.data}` }
    }
    return { type: 'data', text: formatData(block) }
  })
}

export function conversationEntry(entry: SessionEntry): ConversationEntry {
  const result: ConversationEntry = {
    id: entry.id,
    type: entry.type,
    role: entry.type,
    timestamp: entry.timestamp,
    isError: false,
    blocks: [],
  }
  if (entry.type === 'message') {
    const message = entry.message
    result.role = message.role
    if (message.role === 'bashExecution') {
      result.blocks = [{ type: 'toolCall', name: 'bash', text: message.command }, { type: 'text', text: message.output }]
      result.isError = message.exitCode !== undefined && message.exitCode !== 0
    }
    else if ('content' in message) {
      result.blocks = contentBlocks(message.content)
      if (message.role === 'toolResult') {
        result.role = `tool: ${message.toolName}`
        result.toolCallId = message.toolCallId
        result.isError = message.isError
        const details = message.details
        if (details && typeof details === 'object' && 'diff' in details && typeof details.diff === 'string') {
          result.diff = details.diff
        }
      }
      if (message.role === 'assistant') {
        result.model = `${message.provider}/${message.model}`
        result.isError = message.stopReason === 'error'
        if (message.errorMessage)
          result.blocks.push({ type: 'text', text: message.errorMessage })
      }
    }
    else {
      result.blocks = [{ type: 'data', text: formatData(message) }]
    }
  }
  else if (entry.type === 'custom_message') {
    result.role = entry.customType
    result.blocks = contentBlocks(entry.content)
  }
  else if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    result.blocks = [{ type: 'text', text: entry.summary }]
  }
  else {
    result.blocks = [{ type: 'data', text: formatData(entry) }]
  }
  return result
}

export async function readSession(id: string, sessionDir?: string): Promise<SessionDetail | null> {
  // Only paths discovered by the SDK are eligible. User input is never a file path.
  const file = await sessionFile(id, sessionDir)
  if (!file)
    return null
  const { info, version, size } = file
  const detail = await details.get(info.path, version, size * 3, async () => {
    const entries = parseSessionEntries(await readFile(info.path, 'utf8'))
    if (!entries.some(entry => entry.type === 'session' && entry.id === id)) {
      invalidateSessionIndex(sessionDir)
      return null
    }
    // Open in memory: legacy migration must not rewrite the original file.
    const manager = SessionManager.inMemory(info.cwd, undefined, entries)
    const context = manager.buildSessionContext()
    const status = await recordedStatus(manager, context.model)
    const branch = manager.getBranch().map(conversationEntry)
    const firstUser = entries.find(entry => entry.type === 'message' && entry.message.role === 'user')
    return {
      ...summarizeSession(info, status),
      version,
      // The discovery index may predate writes to this file.
      messageCount: entries.filter(entry => entry.type === 'message').length,
      modified: new Date((await stat(info.path)).mtimeMs).toISOString(),
      name: manager.getSessionName(),
      firstMessage: firstUser?.type === 'message' ? conversationEntry(firstUser).blocks.filter(block => block.type === 'text').map(block => block.text || '').join(' ') : '',
      model: context.model,
      thinkingLevel: context.thinkingLevel,
      leafId: manager.getLeafId(),
      entryCount: manager.getEntryCount(),
      status,
      branch,
    }
  })
  if (!detail)
    return null
  // Git/settings can change without a session-file write. Never mutate cached data.
  return { ...detail, status: { ...detail.status, ...await statusEnvironment(info.cwd) } }
}
