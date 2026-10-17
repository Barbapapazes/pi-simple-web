import type { AgentSession } from '@earendil-works/pi-coding-agent'
import type { ConversationEvent, StreamingBehavior } from '@pi-simple-web/shared/conversations/types/conversation'
import type { SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import { stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { isAbsolute, normalize } from 'node:path'
import { conversationEntry } from '../../../../sessions/runtime/server/services/sessions.ts'

export function validateConversationInput(body: unknown): { message: string, id?: string, cwd?: string, streamingBehavior?: StreamingBehavior } {
  if (!body || typeof body !== 'object')
    throw new Error('A message is required.')
  const { message, id, cwd, streamingBehavior } = body as Record<string, unknown>
  if (typeof message !== 'string' || !message.trim())
    throw new Error('A message is required.')
  if (message.length > 100_000)
    throw new Error('Message is too long (maximum 100,000 characters).')
  if (id !== undefined && (typeof id !== 'string' || !id || id.length > 200))
    throw new Error('Invalid session ID.')
  if (cwd !== undefined && (typeof cwd !== 'string' || !cwd.trim() || cwd.length > 4096 || cwd.includes('\0'))) {
    throw new Error('Invalid workspace path.')
  }
  if (id !== undefined && cwd !== undefined)
    throw new Error('Existing sessions use their recorded workspace.')
  if (typeof cwd === 'string' && !isAbsolute(cwd.trim()))
    throw new Error('Workspace must be an absolute path on the server.')
  if (streamingBehavior !== undefined && streamingBehavior !== 'steer' && streamingBehavior !== 'followUp') {
    throw new Error('Invalid streaming behavior.')
  }
  if (streamingBehavior !== undefined && !id)
    throw new Error('Queued messages require a session ID.')
  return { message: message.trim(), id: id as string | undefined, ...(typeof cwd === 'string' ? { cwd: normalize(cwd.trim()) } : {}), ...(streamingBehavior ? { streamingBehavior } : {}) }
}

// Keep the session and its observer alive if an input hook finishes just as the
// original run settles. prompt() can then start another run on the same session.
export function createConversationRun(session: Pick<AgentSession, 'prompt'>) {
  const pending = new Set<Promise<unknown>>()
  let accepting = true
  return {
    async submit(message: string, streamingBehavior: StreamingBehavior) {
      if (!accepting)
        throw new Error('This response has finished. Send a new message instead.')
      const request = session.prompt(message, { streamingBehavior })
      pending.add(request)
      try {
        return await request
      }
      finally {
        pending.delete(request)
      }
    },
    async finish() {
      while (pending.size) await Promise.allSettled([...pending])
      accepting = false
    },
  }
}

export async function resolveConversationCwd(cwd?: string): Promise<string> {
  const workspace = cwd ?? homedir()
  let directory
  try {
    directory = await stat(workspace)
  }
  catch {
    throw new Error('Workspace does not exist or cannot be accessed by the server.')
  }
  if (!directory.isDirectory())
    throw new Error('Workspace must be a directory.')
  return workspace
}

// The browser stream is only an observer; disconnecting must not stop the agent.
export function createConversationEmitter(stream: { push: (data: string) => Promise<unknown>, onClosed: (callback: () => void) => unknown }) {
  let closed = false
  let writing = false
  const pending = new Map<string, ConversationEvent>()
  const waiters = new Set<() => void>()
  function settle() {
    for (const resolve of waiters)
      resolve()
    waiters.clear()
  }
  function stop() {
    closed = true
    pending.clear()
    settle()
  }
  stream.onClosed(stop)
  async function pump() {
    writing = true
    try {
      while (pending.size) {
        if (closed)
          break
        const [key, message] = pending.entries().next().value!
        pending.delete(key)
        // Await backpressure. Slow observers retain only the latest unsent
        // version of each message/status, not a queue of serialized histories.
        await stream.push(JSON.stringify(message))
      }
    }
    catch {
      stop()
    }
    finally {
      writing = false
      settle()
    }
  }
  function emit(message: ConversationEvent) {
    if (closed)
      return
    if (message.type === 'done') {
      // The authoritative final snapshot supersedes unsent deltas and queues.
      for (const key of pending.keys()) {
        if (key !== 'error')
          pending.delete(key)
      }
    }
    const key = message.type === 'message' ? `message:${message.entry.id}` : message.type
    pending.set(key, message)
    if (!writing)
      void pump()
  }
  return Object.assign(emit, {
    drain() {
      if (!writing || closed)
        return Promise.resolve()
      return new Promise<void>((resolve) => {
        waiters.add(resolve)
      })
    },
  })
}

export async function streamConversation(
  session: Pick<AgentSession, 'subscribe' | 'prompt' | 'sessionManager'>,
  message: string,
  emit: (event: ConversationEvent) => void,
  getStatus?: () => SessionStatus,
  finish?: () => Promise<void>,
) {
  let currentId = ''
  let sequence = 0
  const pending = new Map<string, Parameters<typeof conversationEntry>[0]>()
  let timer: ReturnType<typeof setTimeout> | undefined
  function flush() {
    clearTimeout(timer)
    timer = undefined
    for (const entry of pending.values())
      emit({ type: 'message', entry: conversationEntry(entry) })
    pending.clear()
  }
  const unsubscribe = session.subscribe((event) => {
    if (event.type === 'queue_update') {
      emit({ type: 'queue', queue: { steering: [...event.steering], followUp: [...event.followUp] } })
    }
    if (getStatus && ['message_end', 'auto_compaction_end', 'agent_settled'].includes(event.type)) {
      // Pi dispatches message_end before appending it to the manager.
      queueMicrotask(() => emit({ type: 'status', status: getStatus() }))
    }
    if (event.type !== 'message_start' && event.type !== 'message_update' && event.type !== 'message_end')
      return
    if (event.type === 'message_start')
      currentId = `live-${++sequence}`
    const timestamp = new Date(event.message.timestamp).toISOString()
    const entry = {
      type: 'message' as const,
      id: currentId,
      parentId: null,
      timestamp,
      message: event.message,
    }
    pending.set(currentId, entry)
    // Batch token updates, but never delay message boundaries or final state.
    if (event.type === 'message_update')
      timer ??= setTimeout(flush, 40)
    else
      flush()
  })
  try {
    await session.prompt(message)
  }
  catch (error) {
    emit({ type: 'error', message: error instanceof Error ? error.message : 'Pi could not complete this message.' })
  }
  finally {
    try {
      await finish?.()
    }
    finally {
      unsubscribe()
      flush()
      emit({ type: 'done', branch: session.sessionManager.getBranch().map(conversationEntry), ...(getStatus ? { status: getStatus() } : {}) })
    }
  }
}
