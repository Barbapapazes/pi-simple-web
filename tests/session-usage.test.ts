import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, writeFile, appendFile, readFile, rm, stat, utimes } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { listSessions, listSessionSummaries, readSession } from '../server/utils/sessions.ts'
import { readSessionUsage } from '../server/utils/session-usage.ts'

const timestamp = '2026-01-01T00:00:00.000Z'
function message(id: string, input = 10) {
  return JSON.stringify({ type: 'message', id, parentId: 'user', timestamp, message: {
    role: 'assistant', content: [{ type: 'text', text: 'Reply' }], timestamp: 2,
    api: 'openai-completions', provider: 'test', model: 'test-model', stopReason: 'stop',
    usage: { input, output: 20, cacheRead: 30, cacheWrite: 40, totalTokens: input + 90,
      cost: { input: 0.01, output: 0.02, cacheRead: 0.03, cacheWrite: 0.04, total: 0.1 } },
  } }) + '\n'
}
function header(version = 3) {
  return [
    { type: 'session', version, id: 'usage-test', cwd: '/test', timestamp },
    { type: 'message', id: 'user', parentId: null, timestamp, message: { role: 'user', content: 'Hi', timestamp: 1 } },
  ].map(entry => JSON.stringify(entry)).join('\n') + '\n'
}

test('overview usage matches detail across branches and caches only unchanged files', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-usage-'))
  try {
    const path = join(root, 'session.jsonl')
    const original = header() + message('reply')
    await writeFile(path, original)
    const [info] = await listSessions(root)
    assert.ok(info)
    const first = await readSessionUsage(info)
    assert.deepEqual(first, { input: 10, output: 20, cacheRead: 30, cacheWrite: 40, cost: 0.1 })
    assert.strictEqual(await readSessionUsage(info), first)
    await appendFile(path, message('other-branch'))
    const updated = await readSessionUsage(info)
    assert.notStrictEqual(updated, first)
    assert.deepEqual(updated, { input: 20, output: 40, cacheRead: 60, cacheWrite: 80, cost: 0.2 })
    const [summary] = await listSessionSummaries(root)
    assert.deepEqual(summary?.usage, updated)
    assert.equal('path' in summary!, false)
    const detail = await readSession('usage-test', root)
    assert.deepEqual(detail?.usage?.input, updated?.input)
    assert.deepEqual(detail?.status.cost, updated?.cost)
    assert.equal(await readFile(path, 'utf8'), original + message('other-branch'))

    // Size changes invalidate even when filesystem mtime is restored.
    const before = await stat(path)
    await appendFile(path, message('third-branch'))
    await utimes(path, before.atime, before.mtime)
    assert.equal((await readSessionUsage(info))?.input, 30)

    await rm(path)
    assert.equal(await readSessionUsage(info), null)
    await writeFile(path, header() + message('restored', 50))
    assert.equal((await readSessionUsage(info))?.input, 50)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})

test('empty and legacy usage remain readable; invalid headers are unavailable and failures are retried', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pi-web-usage-legacy-'))
  try {
    assert.deepEqual(await listSessionSummaries(root), [])
    const path = join(root, 'legacy.jsonl')
    const original = header(1) + message('reply')
    await writeFile(path, original)
    const [info] = await listSessions(root)
    assert.ok(info)
    assert.equal((await readSessionUsage(info))?.input, 10)
    assert.equal(await readFile(path, 'utf8'), original)
    await writeFile(path, header().replace('usage-test', 'wrong-id'))
    assert.equal(await readSessionUsage(info), null)
    await writeFile(path, header())
    assert.deepEqual(await readSessionUsage(info), { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 })
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
