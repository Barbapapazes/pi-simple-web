import type { AgentSession, AgentSessionEvent } from '@earendil-works/pi-coding-agent'
import type { ConversationEvent } from '../modules/conversations/runtime/shared/types/conversation.ts'
import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { createConversationEmitter, createConversationRun, resolveConversationCwd, streamConversation, validateConversationInput } from '../modules/conversations/runtime/server/services/conversation.ts'
import { messageShortcut } from '../modules/conversations/runtime/shared/utils/conversation-input.ts'
import { sessionUsage } from '../modules/sessions/runtime/server/services/status.ts'

test('chat accepts only non-empty, bounded messages and valid IDs', () => {
  assert.deepEqual(validateConversationInput({ message: '  Hello Pi  ', id: 'session-id' }), { message: 'Hello Pi', id: 'session-id' })
  assert.deepEqual(validateConversationInput({ message: 'Hello' }), { message: 'Hello', id: undefined })
  for (const body of [null, 'hello', {}, { message: '  ' }, { message: 1 }, { message: 'x'.repeat(100_001) }, { message: 'hi', id: 1 }, { message: 'hi', id: '' }]) {
    assert.throws(() => validateConversationInput(body))
  }
})

test('new chats accept absolute workspace paths, but existing sessions cannot change workspace', () => {
  const cwd = join(tmpdir(), 'project')
  assert.deepEqual(validateConversationInput({ message: 'Hello', cwd: `  ${cwd}  ` }), { message: 'Hello', id: undefined, cwd })
  for (const workspace of ['', '   ', 'relative/path', '~/project', 123, '/bad\0path', `/${'x'.repeat(4096)}`]) {
    assert.throws(() => validateConversationInput({ message: 'Hello', cwd: workspace }))
  }
  assert.throws(() => validateConversationInput({ message: 'Hello', id: 'session-id', cwd }), /recorded workspace/)
})

test('workspace must exist and be a directory; omission uses the server working directory', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-workspace-'))
  try {
    assert.equal(await resolveConversationCwd(directory), directory)
    assert.equal(await resolveConversationCwd(), process.cwd())
    await assert.rejects(resolveConversationCwd(join(directory, 'missing')), /does not exist/)
    const file = join(directory, 'file.txt')
    await writeFile(file, 'not a directory')
    await assert.rejects(resolveConversationCwd(file), /must be a directory/)
  }
  finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test('streams user, assistant deltas and tools, then returns the authoritative stored branch', async () => {
  const sessionManager = SessionManager.inMemory('/test')
  sessionManager.appendMessage({ role: 'user', content: 'Previous message', timestamp: 1 })
  let listener: ((event: AgentSessionEvent) => void) | undefined
  let unsubscribed = false
  const assistant = {
    role: 'assistant' as const,
    content: [{ type: 'text' as const, text: 'Hello' }],
    api: 'openai-completions' as const,
    provider: 'test',
    model: 'test-model',
    timestamp: 3,
    stopReason: 'stop' as const,
    usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
  }
  const fake: Pick<AgentSession, 'subscribe' | 'prompt' | 'sessionManager'> = {
    sessionManager,
    subscribe(callback) {
      listener = callback
      return () => {
        unsubscribed = true
      }
    },
    async prompt(text) {
      const user = { role: 'user' as const, content: text, timestamp: 2 }
      sessionManager.appendMessage(user)
      listener!({ type: 'message_start', message: user })
      listener!({ type: 'message_end', message: user })
      listener!({ type: 'message_start', message: { ...assistant, content: [] } })
      listener!({ type: 'message_update', message: assistant, assistantMessageEvent: { type: 'text_delta', contentIndex: 0, delta: 'Hello', partial: assistant } })
      sessionManager.appendMessage(assistant)
      listener!({ type: 'message_end', message: assistant })
      const tool = { role: 'toolResult' as const, toolCallId: 'call', toolName: 'bash', content: [{ type: 'text' as const, text: 'Done' }], isError: false, timestamp: 4 }
      listener!({ type: 'message_start', message: tool })
      sessionManager.appendMessage(tool)
      listener!({ type: 'message_end', message: tool })
      return 'started'
    },
  }
  const events: ConversationEvent[] = []
  await streamConversation(fake, 'Hi', event => events.push(event))
  const partial = events.find(event => event.type === 'conversation' && event.branch.at(-1)?.blocks[0]?.text === 'Hello')
  assert.ok(partial)
  const done = events.at(-1)
  assert.equal(done?.type, 'done')
  if (done?.type !== 'done')
    return
  assert.deepEqual(done.branch.map(entry => entry.role), ['user', 'user', 'assistant', 'tool: bash'])
  assert.equal(done.branch[1]?.blocks[0]?.text, 'Hi')
  assert.ok(done.branch.every(entry => !entry.id.startsWith('live-')))
  assert.equal(unsubscribed, true)
})

test('live status is read after Pi persists message_end, not before it', async () => {
  const sessionManager = SessionManager.inMemory('/test')
  let listener: ((event: AgentSessionEvent) => void) | undefined
  const events: ConversationEvent[] = []
  await streamConversation({
    sessionManager,
    subscribe(callback) {
      listener = callback
      return () => {}
    },
    async prompt() {
      const message = {
        role: 'assistant' as const,
        content: [],
        api: 'openai-completions' as const,
        provider: 'test',
        model: 'test',
        timestamp: 1,
        stopReason: 'stop' as const,
        usage: { input: 18, output: 704, cacheRead: 14000, cacheWrite: 5700, totalTokens: 20422, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0.023 } },
      }
      listener!({ type: 'message_start', message })
      listener!({ type: 'message_end', message })
      sessionManager.appendMessage(message)
      return 'started'
    },
  }, 'Hi', event => events.push(event), () => ({
    ...sessionUsage(sessionManager),
    workspace: '/test',
    gitBranch: 'main',
    context: null,
    autoCompaction: true,
    subscription: false,
  }))
  const update = events.find(event => event.type === 'status')
  assert.ok(update?.type === 'status')
  assert.equal(update.status.input, 18)
  assert.equal(update.status.output, 704)
  assert.equal(update.status.cost, 0.023)
  const done = events.at(-1)
  assert.ok(done?.type === 'done')
  assert.equal(done.status?.input, 18)
})

test('closing the browser stream does not interrupt the prompt or persistence', async () => {
  const sessionManager = SessionManager.inMemory('/test')
  let disconnect: () => void = () => {}
  const sent: string[] = []
  const emit = createConversationEmitter({
    async push(data) { sent.push(data) },
    onClosed(callback) { disconnect = callback },
  })
  let completed = false
  let unsubscribed = false
  await streamConversation({
    sessionManager,
    subscribe() {
      return () => {
        unsubscribed = true
      }
    },
    async prompt(text) {
      emit({ type: 'conversation', branch: [] })
      disconnect()
      await Promise.resolve()
      sessionManager.appendMessage({ role: 'user', content: text, timestamp: 1 })
      completed = true
      return 'started'
    },
  }, 'Keep working', emit)
  assert.equal(completed, true)
  assert.equal(unsubscribed, true)
  assert.equal(sessionManager.getBranch().length, 1)
  assert.equal(sent.length, 1)
})

test('failed stream writes detach the observer without failing the run', async () => {
  for (const synchronous of [false, true]) {
    let writes = 0
    const emit = createConversationEmitter({
      push() {
        writes++
        if (synchronous)
          throw new Error('Disconnected')
        return Promise.reject(new Error('Disconnected'))
      },
      onClosed() {},
    })
    emit({ type: 'conversation', branch: [] })
    await Promise.resolve()
    emit({ type: 'done', branch: [] })
    assert.equal(writes, 1)
  }
})

test('prompt failures are streamed and listeners are always removed', async () => {
  let unsubscribed = false
  const events: ConversationEvent[] = []
  await streamConversation({
    sessionManager: SessionManager.inMemory('/test'),
    subscribe() {
      return () => {
        unsubscribed = true
      }
    },
    async prompt() { throw new Error('No configured model credentials') },
  }, 'Hello', event => events.push(event))
  assert.deepEqual(events, [
    { type: 'error', message: 'No configured model credentials' },
    { type: 'done', branch: [] },
  ])
  assert.equal(unsubscribed, true)
})

test('streaming behavior is explicit, bounded to Pi modes, and requires a session', () => {
  for (const streamingBehavior of ['steer', 'followUp']) {
    assert.deepEqual(validateConversationInput({ message: 'Next', id: 'session', streamingBehavior }), { message: 'Next', id: 'session', streamingBehavior })
    assert.throws(() => validateConversationInput({ message: 'Next', streamingBehavior }), /session ID/)
  }
  for (const streamingBehavior of ['', 'interrupt', true, null]) {
    assert.throws(() => validateConversationInput({ message: 'Next', id: 'session', streamingBehavior }), /streaming behavior/)
  }
})

test('Pi shortcuts distinguish steering, follow-up, multiline and IME input', () => {
  const enter = { key: 'Enter', altKey: false, ctrlKey: false, metaKey: false, shiftKey: false, isComposing: false, keyCode: 13 }
  assert.equal(messageShortcut(enter), 'steer')
  assert.equal(messageShortcut({ ...enter, altKey: true }), 'followUp')
  assert.equal(messageShortcut({ ...enter, key: 'q', ctrlKey: true }, true), 'followUp')
  assert.equal(messageShortcut({ ...enter, key: 'q', ctrlKey: true }), undefined)
  for (const modifier of [{ shiftKey: true }, { ctrlKey: true }, { metaKey: true }, { isComposing: true }, { keyCode: 229 }]) {
    assert.equal(messageShortcut({ ...enter, ...modifier }), undefined)
  }
})

test('queue updates are streamed as independent snapshots', async () => {
  const events: ConversationEvent[] = []
  await streamConversation({
    sessionManager: SessionManager.inMemory('/test'),
    subscribe(listener) {
      listener({ type: 'queue_update', steering: ['Change course'], followUp: ['Then test'] })
      listener({ type: 'queue_update', steering: [], followUp: ['Then test'] })
      return () => {}
    },
    async prompt() { return 'started' },
  }, 'Hello', event => events.push(event))
  assert.deepEqual(events.slice(0, 2), [
    { type: 'queue', queue: { steering: ['Change course'], followUp: ['Then test'] } },
    { type: 'queue', queue: { steering: [], followUp: ['Then test'] } },
  ])
})

test('live input reuses the session and cleanup waits for in-flight input hooks', async () => {
  const calls: unknown[] = []
  let release!: () => void
  const run = createConversationRun({
    async prompt(message, options) {
      calls.push([message, options?.streamingBehavior])
      await new Promise<void>((resolve) => {
        release = resolve
      })
      return 'queued'
    },
  })
  const submission = run.submit('Test next', 'followUp')
  let finished = false
  const finish = run.finish().then(() => {
    finished = true
  })
  await Promise.resolve()
  assert.equal(finished, false)
  release()
  assert.equal(await submission, 'queued')
  await finish
  assert.deepEqual(calls, [['Test next', 'followUp']])
  await assert.rejects(run.submit('Too late', 'steer'), /finished/)
})

test('a rejected queued prompt does not block session cleanup', async () => {
  const run = createConversationRun({
    async prompt() {
      throw new Error('Invalid command')
    },
  })
  await assert.rejects(run.submit('/unknown', 'steer'), /Invalid command/)
  await run.finish()
})
