import type { ConversationEvent, ConversationQueue, StreamingBehavior } from '@pi-simple-web/shared/conversations/types/conversation'
import type { SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import type { ConversationEntry } from '@pi-simple-web/shared/types/conversation'
import { readConversationStream } from '@pi-simple-web/shared/conversations/utils/stream'
import { useSessionRefresh } from '#sessions/app/composables/useSessionRefresh'

// Transport outlives the page that submitted a prompt. GET observers may be
// detached on navigation; POSTs must never be replayed when a connection drops.
let transport: { id: string, kind: 'post' | 'get', controller: AbortController, received: boolean } | undefined

function delay(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    let timer: ReturnType<typeof setTimeout>
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted)
      finish()
  })
}

function waitForVisible(signal: AbortSignal) {
  if (!document.hidden || signal.aborted)
    return Promise.resolve()
  return new Promise<void>((resolve) => {
    function finish() {
      if (document.hidden && !signal.aborted)
        return
      document.removeEventListener('visibilitychange', finish)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    document.addEventListener('visibilitychange', finish)
    signal.addEventListener('abort', finish, { once: true })
  })
}

async function fetchStream(url: string, init: RequestInit & { signal: AbortSignal }) {
  const timeout = new AbortController()
  const timer = setTimeout(() => timeout.abort(), init.method === 'POST' ? 60_000 : 20_000)
  try {
    return await fetch(url, { ...init, credentials: 'include', cache: 'no-store', signal: AbortSignal.any([init.signal, timeout.signal]) })
  }
  finally {
    // Only time out the handshake, never a healthy long-running response.
    clearTimeout(timer)
  }
}

export function useConversation() {
  const state = useState('pi-conversation', () => ({
    id: '',
    busy: false,
    connected: false,
    error: '',
    branch: null as ConversationEntry[] | null,
    status: null as SessionStatus | null,
    queue: { steering: [], followUp: [] } as ConversationQueue,
  }))
  const route = useRoute()
  const refreshSessions = useSessionRefresh()
  const apiBase = useRuntimeConfig().public.apiBase.replace(/\/$/, '')

  async function consume(response: Response, current: NonNullable<typeof transport>) {
    const pending = new Map<string, ConversationEntry>()
    let frame: ReturnType<typeof setTimeout> | undefined
    function flush() {
      clearTimeout(frame)
      frame = undefined
      if (!pending.size || transport !== current)
        return
      const branch = [...(state.value.branch || [])]
      const indexes = new Map(branch.map((entry, index) => [entry.id, index]))
      for (const entry of pending.values()) {
        const index = indexes.get(entry.id)
        if (index === undefined) {
          indexes.set(entry.id, branch.length)
          branch.push(entry)
        }
        else {
          branch[index] = entry
        }
      }
      pending.clear()
      state.value.branch = markRaw(branch)
    }
    try {
      return await readConversationStream(response, (event: ConversationEvent) => {
        if (transport !== current)
          return
        if (event.type === 'message') {
          pending.set(event.entry.id, event.entry)
          frame ??= setTimeout(flush, 16)
          return
        }
        flush()
        if ('status' in event && event.status)
          state.value.status = event.status
        if (event.type === 'started') {
          const firstStart = !current.id
          current.id = event.id
          current.received = true
          state.value.error = ''
          state.value.id = event.id
          state.value.busy = true
          state.value.connected = true
          state.value.branch = markRaw(event.branch)
          if (current.kind === 'post' && firstStart && route.path === '/new')
            void navigateTo(`/sessions/${encodeURIComponent(event.id)}`)
        }
        else if (event.type === 'conversation' || event.type === 'done') {
          state.value.branch = markRaw(event.branch)
        }
        else if (event.type === 'queue') {
          state.value.queue = event.queue
        }
        else if (event.type === 'error') {
          state.value.error = event.message
        }
      })
    }
    finally {
      flush()
      clearTimeout(frame)
    }
  }

  async function recover(current: NonNullable<typeof transport>) {
    let attempt = 0
    while (!current.controller.signal.aborted) {
      if (transport !== current)
        return
      // Keep the run alive server-side, but don't reconnect a hidden browser.
      if (document.hidden) {
        await waitForVisible(current.controller.signal)
        continue
      }
      try {
        const response = await fetchStream(`${apiBase}/api/conversations/${encodeURIComponent(current.id)}/events`, { signal: current.controller.signal })
        if ([204, 404, 405, 501].includes(response.status))
          return // No owned agent (including sessions edited by an external CLI).
        if (!response.ok)
          throw new Error('Unable to reconnect to this response.')
        state.value.connected = true
        const completed = await consume(response, current)
        state.value.connected = false
        if (completed)
          return
        // Do not reset backoff for a server that repeatedly drops connections.
      }
      catch {
        if (current.controller.signal.aborted)
          return
      }
      state.value.connected = false
      if (attempt >= 4) {
        if (current.received)
          state.value.error = 'Live updates are unavailable. The agent may still be running; this page will check saved progress.'
        return // Fall back to the page's backed-off version checks.
      }
      await delay(Math.min(30_000, 1000 * 2 ** Math.min(attempt++, 5)), current.controller.signal)
    }
  }

  async function finish(current: NonNullable<typeof transport>) {
    if (transport !== current)
      return
    state.value.connected = false
    let refreshed = true
    if (!current.controller.signal.aborted && state.value.busy) {
      // One authoritative refresh at completion, not full-history polling.
      try {
        await refreshSessions()
      }
      catch {
        refreshed = false
      }
    }
    if (transport === current) {
      state.value.busy = false
      if (refreshed)
        state.value.branch = null
      state.value.queue = { steering: [], followUp: [] }
      transport = undefined
    }
  }

  async function connect(id: string) {
    if (transport?.id === id || transport?.kind === 'post')
      return
    transport?.controller.abort()
    const current = { id, kind: 'get' as const, controller: new AbortController(), received: false }
    transport = current
    // Keep a known live snapshot while reconnecting to the same session.
    if (state.value.id !== id) {
      state.value = { id, busy: false, connected: false, error: '', branch: null, status: null, queue: { steering: [], followUp: [] } }
    }
    try {
      await recover(current)
    }
    finally {
      await finish(current)
    }
  }

  function disconnect(id: string) {
    if (transport?.id === id && transport.kind === 'get') {
      transport.controller.abort()
      transport = undefined
      state.value.connected = false
      state.value.busy = false
      state.value.branch = null
    }
  }

  async function send(message: string, id?: string, cwd?: string) {
    if (state.value.busy || !message.trim())
      return false
    transport?.controller.abort()
    const current = { id: id || '', kind: 'post' as const, controller: new AbortController(), received: false }
    transport = current
    state.value = { id: id || '', busy: true, connected: false, error: '', branch: null, status: null, queue: { steering: [], followUp: [] } }
    try {
      const response = await fetchStream(`${apiBase}/api/conversations`, {
        method: 'POST',
        signal: current.controller.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, id, cwd }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.statusMessage || 'Unable to send your message.')
      }
      let completed = false
      try {
        completed = await consume(response, current)
      }
      catch {
        // The agent continues running; attach a GET observer below.
      }
      if (!completed) {
        if (!current.id)
          throw new Error('Connection lost before the session ID was received. Check session history before retrying.')
        state.value.connected = false
        await recover(current)
      }
      return true
    }
    catch (error) {
      const networkError = error instanceof Error && ['TypeError', 'AbortError', 'TimeoutError'].includes(error.name)
      // A POST can be accepted even when its response headers never reach us.
      // For an existing ID, try observing it; never repeat the submission.
      if (networkError && current.id && !current.received) {
        await recover(current)
        if (current.received)
          return true
      }
      state.value.error = networkError
        ? 'Connection lost before the response was confirmed. Check session history before retrying; the agent may still be running.'
        : error instanceof Error ? error.message : 'Unable to send your message.'
      return false
    }
    finally {
      await finish(current)
    }
  }

  async function queue(message: string, id: string, streamingBehavior: StreamingBehavior) {
    if (!message.trim() || !id)
      return false
    state.value.error = ''
    try {
      await $fetch('/api/conversations', { baseURL: apiBase, credentials: 'include', method: 'POST', body: { message, id, streamingBehavior } })
      return true
    }
    catch (error) {
      const failure = error as { data?: { statusMessage?: string }, message?: string }
      state.value.error = failure.data?.statusMessage || failure.message || 'Unable to queue your message.'
      return false
    }
  }
  return { state, send, queue, connect, disconnect }
}
