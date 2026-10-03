import { readFile } from 'node:fs/promises'
import { SessionManager, parseSessionEntries, type SessionEntry, type SessionInfo } from '@earendil-works/pi-coding-agent'
import type { SessionDetail, SessionSummary, SessionUsage } from '../../shared/types/sessions.ts'
import type { ConversationBlock, ConversationEntry } from '../../../../../shared/types/conversation.ts'
import { recordedStatus } from './status.ts'
import { readSessionUsage } from './session-usage.ts'

export async function listSessions(sessionDir?: string): Promise<SessionInfo[]> {
  const sessions = sessionDir
    ? await SessionManager.listAll(sessionDir)
    : await SessionManager.listAll()
  return sessions.sort((a, b) => b.modified.getTime() - a.modified.getTime())
}

export async function listSessionSummaries(sessionDir?: string): Promise<SessionSummary[]> {
  const sessions = await listSessions(sessionDir)
  const summaries = new Array<SessionSummary>(sessions.length)
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
  if (typeof content === 'string') return [{ type: 'text', text: content }]
  if (!Array.isArray(content)) return []
  return content.map((block): ConversationBlock => {
    if (block.type === 'text') return { type: 'text', text: block.text }
    if (block.type === 'thinking') return { type: 'thinking', text: block.thinking || 'Redacted thinking' }
    if (block.type === 'toolCall') return {
      type: 'toolCall',
      name: block.name,
      toolCallId: block.id,
      arguments: block.arguments,
      text: block.name === 'read' ? (typeof block.arguments?.path === 'string' ? block.arguments.path : '') : formatData(block.arguments),
    }
    // Never render SVG or remote image URLs from a conversation.
    if (block.type === 'image' && /^image\/(png|jpeg|gif|webp)$/.test(block.mimeType)
      && typeof block.data === 'string' && /^[A-Za-z0-9+/=\s]+$/.test(block.data)) {
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
    } else if ('content' in message) {
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
        if (message.errorMessage) result.blocks.push({ type: 'text', text: message.errorMessage })
      }
    } else {
      result.blocks = [{ type: 'data', text: formatData(message) }]
    }
  } else if (entry.type === 'custom_message') {
    result.role = entry.customType
    result.blocks = contentBlocks(entry.content)
  } else if (entry.type === 'compaction' || entry.type === 'branch_summary') {
    result.blocks = [{ type: 'text', text: entry.summary }]
  } else {
    result.blocks = [{ type: 'data', text: formatData(entry) }]
  }
  return result
}

export async function readSession(id: string, sessionDir?: string): Promise<SessionDetail | null> {
  // Only paths discovered by the SDK are eligible. User input is never a file path.
  const info = (await listSessions(sessionDir)).find(session => session.id === id)
  if (!info) return null

  const entries = parseSessionEntries(await readFile(info.path, 'utf8'))
  if (!entries.some(entry => entry.type === 'session' && entry.id === id)) return null
  // Open in memory: legacy format migration must not rewrite the original file.
  const manager = SessionManager.inMemory(info.cwd, undefined, entries)
  const context = manager.buildSessionContext()
  const status = await recordedStatus(manager)
  return {
    ...summarizeSession(info, status),
    name: manager.getSessionName() || info.name,
    model: context.model,
    thinkingLevel: context.thinkingLevel,
    leafId: manager.getLeafId(),
    entryCount: manager.getEntryCount(),
    status,
    branch: manager.getBranch().map(conversationEntry),
  }
}
