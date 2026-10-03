import type { ConversationEvent, ConversationQueue, StreamingBehavior } from '#conversations/shared/types/conversation'
import type { SessionStatus } from '#sessions/shared/types/sessions'
import type { ConversationEntry } from '#shared/types/conversation'
import { useSessionRefresh } from '#sessions/app/composables/useSessionRefresh'

export function useConversation() {
  // Shared across pages so creating a conversation can navigate without interrupting its stream.
  const state = useState('pi-conversation', () => ({
    id: '',
    busy: false,
    error: '',
    branch: null as ConversationEntry[] | null,
    status: null as SessionStatus | null,
    queue: { steering: [], followUp: [] } as ConversationQueue,
  }))
  const refreshSessions = useSessionRefresh()

  async function send(message: string, id?: string, cwd?: string) {
    if (state.value.busy || !message.trim())
      return false
    state.value = { id: id || '', busy: true, error: '', branch: null, status: null, queue: { steering: [], followUp: [] } }
    let completed = false
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message, id, cwd }),
      })
      if (!response.ok) {
        const error = await response.json().catch(() => null)
        throw new Error(error?.statusMessage || 'Unable to send your message.')
      }
      if (!response.body)
        throw new Error('Streaming is unavailable in this browser.')
      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      try {
        while (true) {
          const { value, done } = await reader.read()
          buffer += decoder.decode(value, { stream: !done })
          const lines = buffer.split('\n')
          buffer = lines.pop() || ''
          for (const line of lines) {
            if (!line.startsWith('data:'))
              continue
            const event = JSON.parse(line.slice(5).trim()) as ConversationEvent
            if ('status' in event && event.status)
              state.value.status = event.status
            if (event.type === 'started') {
              state.value.id = event.id
              state.value.branch = event.branch
              if (!id)
                await navigateTo(`/sessions/${encodeURIComponent(event.id)}`)
            }
            else if (event.type === 'conversation' || event.type === 'done') {
              state.value.branch = event.branch
              if (event.type === 'done')
                completed = true
            }
            else if (event.type === 'queue') {
              state.value.queue = event.queue
            }
            else if (event.type === 'error') {
              state.value.error = event.message
            }
          }
          if (done)
            break
        }
      }
      finally {
        reader.releaseLock()
      }
      if (!completed)
        throw new Error('Connection lost. The agent may still be running in the background. Refresh the conversation before retrying.')
      return true
    }
    catch (error) {
      state.value.error = error instanceof Error ? error.message : 'Unable to send your message.'
      return false
    }
    finally {
      state.value.busy = false
      void refreshSessions().catch(() => {})
    }
  }
  async function queue(message: string, id: string, streamingBehavior: StreamingBehavior) {
    if (!message.trim() || !id)
      return false
    state.value.error = ''
    try {
      await $fetch('/api/conversations', { method: 'POST', body: { message, id, streamingBehavior } })
      return true
    }
    catch (error) {
      const failure = error as { data?: { statusMessage?: string }, message?: string }
      state.value.error = failure.data?.statusMessage || failure.message || 'Unable to queue your message.'
      return false
    }
  }
  return { state, send, queue }
}
