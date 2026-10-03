import { stat } from 'node:fs/promises'
import { isAbsolute, normalize } from 'node:path'
import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ChatEvent, StreamingBehavior } from '../../shared/types/chat.ts'
import type { SessionStatus } from '../../shared/types/sessions.ts'
import { transcriptEntry } from './sessions.ts'

export function validateChatInput(body: unknown): { message: string, id?: string, cwd?: string, streamingBehavior?: StreamingBehavior } {
  if (!body || typeof body !== 'object') throw new Error('A message is required.')
  const { message, id, cwd, streamingBehavior } = body as Record<string, unknown>
  if (typeof message !== 'string' || !message.trim()) throw new Error('A message is required.')
  if (message.length > 100_000) throw new Error('Message is too long (maximum 100,000 characters).')
  if (id !== undefined && (typeof id !== 'string' || !id || id.length > 200)) throw new Error('Invalid session ID.')
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim() || cwd.length > 4096 || cwd.includes('\0'))) {
    throw new Error('Invalid workspace path.')
  }
  if (id !== undefined && cwd !== undefined) throw new Error('Existing sessions use their recorded workspace.')
  if (typeof cwd === 'string' && !isAbsolute(cwd.trim())) throw new Error('Workspace must be an absolute path on the server.')
  if (streamingBehavior !== undefined && streamingBehavior !== 'steer' && streamingBehavior !== 'followUp') {
    throw new Error('Invalid streaming behavior.')
  }
  if (streamingBehavior !== undefined && !id) throw new Error('Queued messages require a session ID.')
  return { message: message.trim(), id: id as string | undefined, ...(typeof cwd === 'string' ? { cwd: normalize(cwd.trim()) } : {}), ...(streamingBehavior ? { streamingBehavior } : {}) }
}

// Keep the session and its observer alive if an input hook finishes just as the
// original run settles. prompt() can then start another run on the same session.
export function createChatRun(session: Pick<AgentSession, 'prompt'>) {
  const pending = new Set<Promise<unknown>>()
  let accepting = true
  return {
    async submit(message: string, streamingBehavior: StreamingBehavior) {
      if (!accepting) throw new Error('This response has finished. Send a new message instead.')
      const request = session.prompt(message, { streamingBehavior })
      pending.add(request)
      try {
        return await request
      } finally {
        pending.delete(request)
      }
    },
    async finish() {
      while (pending.size) await Promise.allSettled([...pending])
      accepting = false
    },
  }
}

export async function resolveChatCwd(cwd?: string): Promise<string> {
  const workspace = cwd ?? process.cwd()
  let directory
  try {
    directory = await stat(workspace)
  } catch {
    throw new Error('Workspace does not exist or cannot be accessed by the server.')
  }
  if (!directory.isDirectory()) throw new Error('Workspace must be a directory.')
  return workspace
}

// The browser stream is only an observer; disconnecting must not stop the agent.
export function createChatEmitter(stream: { push: (data: string) => Promise<unknown>, onClosed: (callback: () => void) => unknown }) {
  let closed = false
  stream.onClosed(() => { closed = true })
  return (message: ChatEvent) => {
    if (closed) return
    try {
      void stream.push(JSON.stringify(message)).catch(() => { closed = true })
    } catch {
      closed = true
    }
  }
}

export async function streamChat(
  session: Pick<AgentSession, 'subscribe' | 'prompt' | 'sessionManager'>,
  message: string,
  emit: (event: ChatEvent) => void,
  getStatus?: () => SessionStatus,
  finish?: () => Promise<void>,
) {
  const base = session.sessionManager.getBranch().map(transcriptEntry)
  const live = new Map<string, ReturnType<typeof transcriptEntry>>()
  let currentId = ''
  let sequence = 0
  const unsubscribe = session.subscribe(event => {
    if (event.type === 'queue_update') {
      emit({ type: 'queue', queue: { steering: [...event.steering], followUp: [...event.followUp] } })
    }
    if (getStatus && ['message_end', 'auto_compaction_end', 'agent_settled'].includes(event.type)) {
      // Pi dispatches message_end before appending it to the manager.
      queueMicrotask(() => emit({ type: 'status', status: getStatus() }))
    }
    if (event.type !== 'message_start' && event.type !== 'message_update' && event.type !== 'message_end') return
    if (event.type === 'message_start') currentId = `live-${++sequence}`
    const timestamp = new Date(event.message.timestamp).toISOString()
    live.set(currentId, transcriptEntry({
      type: 'message', id: currentId, parentId: null, timestamp, message: event.message,
    }))
    emit({ type: 'transcript', branch: [...base, ...live.values()] })
  })
  try {
    await session.prompt(message)
  } catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Pi could not complete this message.' })
  } finally {
    await finish?.()
    unsubscribe()
    emit({ type: 'done', branch: session.sessionManager.getBranch().map(transcriptEntry), ...(getStatus ? { status: getStatus() } : {}) })
  }
}
