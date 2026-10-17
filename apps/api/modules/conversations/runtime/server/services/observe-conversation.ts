import type { H3Event } from 'h3'
import type { createLiveConversation } from './live-conversations'
import { createConversationEmitter } from './conversation'

export function observeConversation(event: H3Event, live: ReturnType<typeof createLiveConversation>) {
  setResponseHeader(event, 'Cache-Control', 'no-store, no-transform')
  setResponseHeader(event, 'X-Accel-Buffering', 'no')
  const stream = createEventStream(event)
  const emit = createConversationEmitter(stream)
  let unsubscribe: (() => void) | undefined
  const heartbeat = setInterval(() => {
    void stream.push({ event: 'ping', data: '' }).catch(close)
  }, 15_000)
  function cleanup() {
    clearInterval(heartbeat)
    unsubscribe?.()
  }
  function close() {
    cleanup()
    void emit.drain().then(() => stream.close()).catch(() => {})
  }
  stream.onClosed(cleanup)
  const response = stream.send()
  unsubscribe = live.subscribe(emit, close)
  return response
}
