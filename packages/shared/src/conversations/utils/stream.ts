import type { ConversationEvent } from '../types/conversation.ts'

// Handles split UTF-8, CRLF, comments/heartbeats and multi-line SSE data frames.
export async function readConversationStream(response: Response, receive: (event: ConversationEvent) => void): Promise<boolean> {
  if (!response.body)
    throw new Error('Streaming is unavailable in this browser.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let data: string[] = []
  let completed = false
  function line(value: string) {
    if (!value) {
      if (data.length && data.join('\n').trim()) {
        const event = JSON.parse(data.join('\n')) as ConversationEvent
        receive(event)
        completed ||= event.type === 'done'
      }
      data = []
    }
    else if (value.startsWith('data:')) {
      data.push(value.slice(5).replace(/^ /, ''))
    }
  }
  try {
    while (true) {
      // A half-open connection must not leave the UI permanently busy. Server
      // heartbeats arrive every 15s; a silent stream is resumed from a snapshot.
      const idle = setTimeout(() => {
        void reader.cancel().catch(() => {})
      }, 45_000)
      let chunk: ReadableStreamReadResult<Uint8Array>
      try {
        chunk = await reader.read()
      }
      finally {
        clearTimeout(idle)
      }
      const { value, done } = chunk
      buffer += decoder.decode(value, { stream: !done })
      while (buffer.includes('\n')) {
        const newline = buffer.indexOf('\n')
        line(buffer.slice(0, newline).replace(/\r$/, ''))
        buffer = buffer.slice(newline + 1)
      }
      if (done) {
        if (buffer)
          line(buffer.replace(/\r$/, ''))
        line('')
        return completed
      }
    }
  }
  finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
