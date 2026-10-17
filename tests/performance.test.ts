import type { ConversationEvent } from '@pi-simple-web/shared/conversations/types/conversation'
import type { ConversationEntry } from '@pi-simple-web/shared/types/conversation'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createToolResultGrouper } from '@pi-simple-web/shared/conversations/utils/conversation'
import { readConversationStream } from '@pi-simple-web/shared/conversations/utils/stream'
import { createConversationEmitter } from '../apps/api/modules/conversations/runtime/server/services/conversation.ts'
import { createLiveConversation } from '../apps/api/modules/conversations/runtime/server/services/live-conversations.ts'
import { createVersionedCache } from '../apps/api/modules/sessions/runtime/server/services/versioned-cache.ts'

function entry(id: string, text: string): ConversationEntry {
  return { id, type: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00Z', isError: false, blocks: [{ type: 'text', text }] }
}

test('reconnect snapshots include missed messages and queue state without restarting the run', () => {
  const channel = createLiveConversation('session', '/workspace', [entry('old', 'History')])
  const first: ConversationEvent[] = []
  const unsubscribe = channel.subscribe(event => first.push(event), () => {})
  channel.publish({ type: 'message', entry: entry('live', 'Partial') })
  unsubscribe()
  channel.publish({ type: 'message', entry: entry('live', 'Complete') })
  channel.publish({ type: 'queue', queue: { steering: ['Next'], followUp: [] } })
  const reconnected: ConversationEvent[] = []
  let closed = 0
  channel.subscribe(event => reconnected.push(event), () => {
    closed++
  })
  assert.equal(reconnected[0]?.type, 'started')
  const snapshot = reconnected[0]
  assert.ok(snapshot?.type === 'started')
  assert.deepEqual(snapshot.branch.map(item => item.blocks[0]?.text), ['History', 'Complete'])
  assert.deepEqual(reconnected[1], { type: 'queue', queue: { steering: ['Next'], followUp: [] } })
  assert.equal(first.filter(event => event.type === 'message').length, 1)
  channel.publish({ type: 'done', branch: [entry('stored', 'Persisted')] })
  assert.equal(closed, 1)
  const late: ConversationEvent[] = []
  channel.subscribe(event => late.push(event), () => {
    closed++
  })
  assert.equal(late.at(-1)?.type, 'done')
  assert.equal(closed, 2)
})

test('multiple live observers are independent and failed observers do not break the run', () => {
  const channel = createLiveConversation('session', '/workspace', [])
  const events: ConversationEvent[] = []
  let fail = false
  channel.subscribe(() => {
    if (fail)
      throw new Error('Disconnected')
  }, () => {})
  channel.subscribe(event => events.push(event), () => {})
  fail = true
  channel.publish({ type: 'message', entry: entry('live', 'Reply') })
  channel.publish({ type: 'done', branch: [entry('stored', 'Reply')] })
  assert.equal(events.at(-1)?.type, 'done')
})

test('slow observers coalesce unsent message updates and drain the final snapshot before closing', async () => {
  let release!: () => void
  const sent: ConversationEvent[] = []
  const emit = createConversationEmitter({
    async push(data) {
      sent.push(JSON.parse(data))
      if (sent.length === 1)
        await new Promise<void>((resolve) => { release = resolve })
    },
    onClosed() {},
  })
  emit({ type: 'started', id: 'session', cwd: '/workspace', branch: [] })
  for (let i = 0; i < 1000; i++)
    emit({ type: 'message', entry: entry('live', String(i)) })
  assert.equal(sent.length, 1)
  release()
  await emit.drain()
  assert.equal(sent.length, 2)
  const latest = sent.at(-1)
  assert.ok(latest?.type === 'message')
  assert.equal(latest.entry.blocks[0]?.text, '999')
  emit({ type: 'error', message: 'Failure details' })
  emit({ type: 'message', entry: entry('live', 'Superseded') })
  emit({ type: 'done', branch: [entry('stored', 'Final')] })
  await emit.drain()
  assert.deepEqual(sent.slice(2), [
    { type: 'error', message: 'Failure details' },
    { type: 'done', branch: [entry('stored', 'Final')] },
  ])
})

test('versioned cache shares reads, replaces old versions, bounds memory and retries failures', async () => {
  const cache = createVersionedCache<object>(2, 10)
  let loads = 0
  const load = async () => {
    loads++
    return {}
  }
  const [first, shared] = await Promise.all([cache.get('a', '1', 4, load), cache.get('a', '1', 4, load)])
  assert.equal(first, shared)
  assert.equal(loads, 1)
  const changed = await cache.get('a', '2', 4, load)
  assert.notEqual(first, changed)
  await cache.get('b', '1', 4, load)
  await cache.get('c', '1', 4, load)
  await cache.get('a', '2', 4, load)
  assert.equal(loads, 5)
  await assert.rejects(cache.get('bad', '1', 1, async () => {
    throw new Error('Failed')
  }))
  await cache.get('bad', '1', 1, load)
  assert.equal(loads, 6)
  await cache.get('huge', '1', 11, load)
  await cache.get('huge', '1', 11, load)
  assert.equal(loads, 8)
})

test('versioned cache expires unchanged entries', async (t) => {
  let now = Date.now()
  t.mock.method(Date, 'now', () => now)
  const cache = createVersionedCache<object>(1, 10, 100)
  const first = await cache.get('a', '1', 1, async () => ({}))
  now += 101
  const second = await cache.get('a', '1', 1, async () => ({}))
  assert.notEqual(first, second)
})

test('stream parser handles fragmented UTF-8, CRLF, heartbeat frames and final snapshots', async () => {
  const event: ConversationEvent = { type: 'message', entry: entry('live', 'Hello 👋') }
  const wire = `: connected\r\n\r\nevent: ping\r\ndata: \r\n\r\ndata: ${JSON.stringify(event)}\r\n\r\ndata: ${JSON.stringify({ type: 'done', branch: [] })}\n\n`
  const bytes = new TextEncoder().encode(wire)
  const received: ConversationEvent[] = []
  const response = new Response(new ReadableStream({
    start(controller) {
      for (const byte of bytes)
        controller.enqueue(new Uint8Array([byte]))
      controller.close()
    },
  }))
  assert.equal(await readConversationStream(response, event => received.push(event)), true)
  assert.deepEqual(received, [event, { type: 'done', branch: [] }])
  assert.equal(await readConversationStream(new Response(`data: ${JSON.stringify(event)}\n\n`), () => {}), false)
})

test('memoized grouping preserves historical identity and updates only changed tool results', () => {
  const group = createToolResultGrouper()
  const history = entry('history', 'Stable Markdown')
  const calls = { ...entry('calls', ''), blocks: [{ type: 'toolCall' as const, name: 'bash', toolCallId: 'tool' }] }
  const result = { ...entry('result', 'Partial'), role: 'tool: bash', toolCallId: 'tool' }
  const first = group([history, calls, result])
  const second = group([history, calls, result, entry('new', 'Streaming')])
  assert.equal(first[0], second[0])
  assert.equal(first[1], second[1])
  const changed = group([history, calls, { ...result, blocks: [{ type: 'text', text: 'Complete' }] }])
  assert.equal(changed[0], history)
  assert.notEqual(changed[1], first[1])
  assert.equal(changed[1]?.blocks[0]?.result?.blocks[0]?.text, 'Complete')
  assert.equal(calls.blocks[0] && 'result' in calls.blocks[0], false)
})
