import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { SessionManager } from '@earendil-works/pi-coding-agent'
import { recordedContext, recordedStatus, sessionUsage, workspaceStatus } from '../modules/sessions/runtime/server/services/status.ts'
import { formatCost, formatTokens } from '../shared/utils/status.ts'

function assistant(input = 18, output = 704, cacheRead = 14000, cacheWrite = 5700, cost = 0.023) {
  return {
    role: 'assistant' as const, content: [{ type: 'text' as const, text: 'Reply' }],
    api: 'openai-completions' as const, provider: 'test', model: 'test-model', timestamp: 1,
    stopReason: 'stop' as const,
    usage: { input, output, cacheRead, cacheWrite, totalTokens: input + output + cacheRead + cacheWrite,
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: cost } },
  }
}

test('cost formatting preserves small nonzero estimates', () => {
  assert.deepEqual([0, 0.0012, 0.01, 1.234, 1234].map(formatCost), ['$0.00', '$0.0012', '$0.01', '$1.23', '$1,234.00'])
})

test('compact token formatting matches the terminal footer', () => {
  assert.deepEqual([0, 18, 704, 1000, 5700, 14000, 999999, 1100000, 10000000].map(formatTokens),
    ['0', '18', '704', '1.0k', '5.7k', '14k', '1000k', '1.1M', '10M'])
})

test('usage includes abandoned branches, summaries, tools and cache warming without double counting', () => {
  const manager = SessionManager.inMemory('/test')
  const user = manager.appendMessage({ role: 'user', content: 'Hi', timestamp: 1 })
  manager.appendMessage(assistant())
  manager.branch(user)
  manager.appendMessage(assistant(10, 20, 90, 0, 0.01))
  const usage = assistant(1, 2, 3, 4, 0.001).usage
  manager.appendUsage('cache_warm', 'test', 'test-model', usage)
  manager.appendMessage({ role: 'toolResult', toolName: 'nested', toolCallId: 'call', isError: false, content: [], timestamp: 2, usage })
  manager.appendCompaction('Summary', user, 100, undefined, false, usage)
  manager.branchWithSummary(null, 'Branch summary', undefined, false, usage)
  const totals = sessionUsage(manager)
  assert.equal(totals.input, 32)
  assert.equal(totals.output, 732)
  assert.equal(totals.cacheRead, 14102)
  assert.equal(totals.cacheWrite, 5716)
  assert.equal(totals.cacheHitRate, 90)
  assert.ok(Math.abs(totals.cost - 0.037) < 1e-10)
})

test('context follows the active branch, includes trailing tools, and invalidates old usage after compaction/edits', () => {
  const manager = SessionManager.inMemory('/test')
  const user = manager.appendMessage({ role: 'user', content: 'Hi', timestamp: 1 })
  const reply = manager.appendMessage(assistant(10, 20, 70, 0))
  manager.appendMessage({ role: 'toolResult', toolName: 'bash', toolCallId: 'call', isError: false,
    content: [{ type: 'text', text: '12345678' }], timestamp: 2 })
  assert.deepEqual(recordedContext(manager, 1000), { tokens: 102, contextWindow: 1000, percent: 10.2 })
  manager.appendCompaction('Summary', user, 102)
  assert.equal(recordedContext(manager, 1000)?.tokens, null)
  manager.appendMessage({ ...assistant(10, 10, 30, 0), stopReason: 'error' })
  assert.equal(recordedContext(manager, 1000)?.tokens, null)
  manager.appendMessage(assistant(10, 10, 30, 0))
  assert.equal(recordedContext(manager, 1000)?.tokens, 50)
  manager.appendContextEdit(reply, null)
  assert.equal(recordedContext(manager, 1000)?.tokens, null)
  manager.appendMessage(assistant(10, 10, 10, 0))
  assert.equal(recordedContext(manager, 1000)?.tokens, 30)
  manager.branch(user)
  assert.equal(recordedContext(manager, 1000)?.tokens, null)
  assert.equal(recordedContext(manager, 0), null)
})

test('unknown models and missing workspaces remain browsable', async () => {
  const manager = SessionManager.inMemory('/nonexistent/pi-web-status-test')
  manager.appendModelChange('unknown-provider', 'unknown-model')
  const status = await recordedStatus(manager)
  assert.equal(status.workspace, manager.getCwd())
  assert.equal(status.gitBranch, null)
  assert.equal(status.context, null)
  assert.equal(status.cacheHitRate, null)
  assert.equal(status.cost, 0)
})

test('workspace status discovers the current Git branch', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'pi-status-git-'))
  try {
    await promisify(execFile)('git', ['init', '-b', 'status-test', cwd])
    // rev-parse requires a first commit; no user identity or hooks needed.
    await promisify(execFile)('git', ['-C', cwd, '-c', 'user.name=Test', '-c', 'user.email=test@example.com',
      '-c', 'core.hooksPath=/dev/null', 'commit', '--allow-empty', '-m', 'Test'])
    assert.equal((await workspaceStatus(cwd)).gitBranch, 'status-test')
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
})
