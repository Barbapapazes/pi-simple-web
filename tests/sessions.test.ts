import assert from 'node:assert/strict'
import { appendFile, mkdtemp, readFile, rename, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { conversationEntry, listSessionPage, listSessions, readSession, readSessionMetrics, sessionFile, summarizeSession } from '../apps/api/modules/sessions/runtime/server/services/sessions.ts'

test('discovers sessions, reads the branch without rewriting, and rejects unknown IDs', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-test-'))
  try {
    const path = join(root, '2026-01-01_test-session.jsonl')
    const timestamp = '2026-01-01T00:00:00.000Z'
    const entries = [
      { type: 'session', version: 3, id: 'test-session', timestamp, cwd: '/test' },
      { type: 'model_change', id: 'model', parentId: null, timestamp, provider: 'test', modelId: 'test-model' },
      { type: 'message', id: 'user', parentId: 'model', timestamp, message: { role: 'user', content: '<script>alert(1)</script>', timestamp: 1 } },
      { type: 'message', id: 'old', parentId: 'user', timestamp, message: { role: 'user', content: 'Abandoned branch', timestamp: 2 } },
      { type: 'message', id: 'new', parentId: 'user', timestamp, message: { role: 'user', content: 'Current branch', timestamp: 3 } },
    ]
    const original = `${entries.map(entry => JSON.stringify(entry)).join('\n')}\n`
    await writeFile(path, original)
    const sessions = await listSessions(root)
    assert.equal(sessions.length, 1)
    assert.equal(summarizeSession(sessions[0]!).cwd, '/test')
    assert.equal('path' in summarizeSession(sessions[0]!), false)
    const session = await readSession('test-session', root)
    assert.ok(session)
    assert.deepEqual(session.model, { provider: 'test', modelId: 'test-model' })
    assert.deepEqual(session.branch.map(entry => entry.id), ['model', 'user', 'new'])
    assert.equal(session.branch[1]?.blocks[0]?.text, '<script>alert(1)</script>')
    assert.equal(await readFile(path, 'utf8'), original)
    assert.equal(await readSession('../../etc/passwd', root), null)
    assert.equal(await readSession('missing', root), null)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('legacy sessions migrate only in memory and empty directories are supported', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-legacy-'))
  try {
    assert.deepEqual(await listSessions(root), [])
    const path = join(root, 'legacy.jsonl')
    const original = `${[
      { type: 'session', version: 1, id: 'legacy', timestamp: '2025-01-01T00:00:00.000Z', cwd: '/legacy' },
      { type: 'message', timestamp: '2025-01-01T00:00:01.000Z', message: { role: 'user', content: 'Legacy message', timestamp: 1 } },
    ].map(entry => JSON.stringify(entry)).join('\n')}\n`
    await writeFile(path, original)
    const session = await readSession('legacy', root)
    assert.ok(session)
    assert.equal(session.branch[0]?.blocks[0]?.text, 'Legacy message')
    assert.ok(session.branch[0]?.id)
    assert.equal(await readFile(path, 'utf8'), original)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('read calls show only the file path, while other tools retain their arguments', () => {
  const entry = conversationEntry({
    id: 'entry',
    parentId: null,
    timestamp: '2026-01-01T00:00:00.000Z',
    type: 'message',
    message: {
      role: 'assistant',
      timestamp: 1,
      api: 'openai-completions',
      provider: 'test',
      model: 'test-model',
      stopReason: 'toolUse',
      usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
      content: [
        { type: 'toolCall', id: 'read-call', name: 'read', arguments: { path: '/test/file.ts', offset: 20, limit: 10 } },
        { type: 'toolCall', id: 'partial-read', name: 'read', arguments: {} },
        { type: 'toolCall', id: 'bash-call', name: 'bash', arguments: { command: 'pwd' } },
      ],
    },
  })
  assert.deepEqual(entry.blocks[0], {
    type: 'toolCall',
    name: 'read',
    text: '/test/file.ts',
    toolCallId: 'read-call',
    arguments: { path: '/test/file.ts', offset: 20, limit: 10 },
  })
  assert.equal(entry.blocks[1]?.text, '')
  assert.equal(entry.blocks[2]?.text, JSON.stringify({ command: 'pwd' }, null, 2))
})

test('paginates history, filters before slicing, and keeps metrics global', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-pages-'))
  try {
    for (let i = 0; i < 5; i++) {
      const timestamp = `2026-01-0${i + 1}T00:00:00.000Z`
      const path = join(root, `session-${i}.jsonl`)
      await writeFile(path, `${[
        { type: 'session', version: 3, id: `session-${i}`, timestamp, cwd: i % 2 ? '/other' : '/project' },
        { type: 'message', id: `user-${i}`, parentId: null, timestamp, message: { role: 'user', content: `Message ${i}`, timestamp: Date.parse(timestamp) } },
      ].map(entry => JSON.stringify(entry)).join('\n')}\n`)
    }
    const options = { offset: 0, limit: 2, search: '', workspace: '' }
    const first = await listSessionPage(options, root)
    assert.deepEqual(first.items.map(item => item.id), ['session-4', 'session-3'])
    assert.equal(first.total, 5)
    assert.equal(first.nextOffset, 2)
    assert.deepEqual(first.workspaces, ['/other', '/project'])
    assert.equal('path' in first.items[0]!, false)
    const second = await listSessionPage({ ...options, offset: first.nextOffset! }, root)
    assert.deepEqual(second.items.map(item => item.id), ['session-2', 'session-1'])
    const last = await listSessionPage({ ...options, offset: second.nextOffset! }, root)
    assert.deepEqual(last.items.map(item => item.id), ['session-0'])
    assert.equal(last.nextOffset, null)
    const filtered = await listSessionPage({ ...options, workspace: '/project' }, root)
    assert.deepEqual(filtered.items.map(item => item.id), ['session-4', 'session-2'])
    assert.equal(filtered.total, 3)
    assert.deepEqual(filtered.workspaces, first.workspaces)
    const search = await listSessionPage({ ...options, search: ' MESSAGE 0 ' }, root)
    assert.deepEqual(search.items.map(item => item.id), ['session-0'])
    assert.equal(search.nextOffset, null)
    const empty = await listSessionPage({ ...options, search: 'missing' }, root)
    assert.equal(empty.total, 0)
    assert.equal(empty.nextOffset, null)
    const metrics = await readSessionMetrics(root)
    assert.equal(metrics.sessions, 5)
    assert.equal(metrics.workspaces, 2)
    assert.equal(metrics.messages, 5)
    assert.equal(metrics.missingUsage, 0)
    assert.deepEqual(metrics.usage, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('detail reads reuse discovery and parsed branches, but invalidate on writes, moves and deletion', async (t) => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-detail-cache-'))
  const originalList = SessionManager.listAll.bind(SessionManager)
  let discoveries = 0
  t.mock.method(SessionManager, 'listAll', async (...args: Parameters<typeof SessionManager.listAll>) => {
    discoveries++
    return originalList(...args)
  })
  try {
    const path = join(root, 'cached.jsonl')
    const timestamp = '2026-01-01T00:00:00.000Z'
    await writeFile(path, `${[
      { type: 'session', version: 3, id: 'cached', timestamp, cwd: '/test' },
      { type: 'message', id: 'first', parentId: null, timestamp, message: { role: 'user', content: 'First', timestamp: 1 } },
    ].map(entry => JSON.stringify(entry)).join('\n')}\n`)
    const first = await readSession('cached', root)
    const second = await readSession('cached', root)
    assert.ok(first && second)
    assert.equal(first.branch, second.branch)
    assert.equal(discoveries, 1)
    const version = await sessionFile('cached', root)
    assert.equal(version?.version, first.version)
    assert.equal(discoveries, 1)
    await appendFile(path, `${JSON.stringify({ type: 'message', id: 'second', parentId: 'first', timestamp, message: { role: 'user', content: 'Second', timestamp: 2 } })}\n`)
    const changed = await readSession('cached', root)
    assert.ok(changed)
    assert.notEqual(changed.version, first.version)
    assert.equal(changed.branch.at(-1)?.blocks[0]?.text, 'Second')
    assert.equal(changed.messageCount, 2)
    assert.equal(discoveries, 1)
    await rename(path, join(root, 'moved.jsonl'))
    assert.ok(await readSession('cached', root))
    assert.equal(discoveries, 2)
    await rm(join(root, 'moved.jsonl'))
    assert.equal(await readSession('cached', root), null)
  }
  finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('normalizes tool errors and safe image content', () => {
  const base = { id: 'entry', parentId: null, timestamp: '2026-01-01T00:00:00.000Z' }
  const tool = conversationEntry({ ...base, type: 'message', message: {
    role: 'toolResult',
    toolCallId: 'call',
    toolName: 'bash',
    isError: true,
    timestamp: 1,
    content: [{ type: 'text', text: 'Failed' }, { type: 'image', mimeType: 'image/svg+xml', data: 'PHN2Zz4=' }],
    details: { diff: '-old\n+new' },
  } })
  assert.equal(tool.isError, true)
  assert.equal(tool.role, 'tool: bash')
  assert.equal(tool.toolCallId, 'call')
  assert.equal(tool.diff, '-old\n+new')
  assert.equal(tool.blocks[1]?.type, 'data')
  const message = conversationEntry({ ...base, type: 'custom_message', customType: 'attachment', display: true, content: [{ type: 'image', mimeType: 'image/png', data: 'YWJj' }] })
  assert.equal(message.blocks[0]?.src, 'data:image/png;base64,YWJj')
})
