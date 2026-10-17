import type { AgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import type { SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { calculateContextTokens, estimateTokens, ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent'

import { createVersionedCache } from './versioned-cache.ts'

const exec = promisify(execFile)
const workspaces = createVersionedCache<Pick<SessionStatus, 'workspace' | 'gitBranch'>>(64, 64 * 1024, 5000)
const compactionSettings = createVersionedCache<boolean>(64, 64, 5000)
const runtimes = createVersionedCache<ModelRuntime>(1, 1, 60_000)
type UsageTotals = Pick<SessionStatus, 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'cacheHitRate' | 'cost'>
const usageTotals = new WeakMap<SessionManager, { count: number, last: ReturnType<SessionManager['getEntries']>[number] | undefined, totals: UsageTotals }>()

export async function workspaceStatus(cwd: string): Promise<Pick<SessionStatus, 'workspace' | 'gitBranch'>> {
  return workspaces.get(cwd, '', 1024, () => readWorkspaceStatus(cwd))
}

async function readWorkspaceStatus(cwd: string): Promise<Pick<SessionStatus, 'workspace' | 'gitBranch'>> {
  const path = relative(homedir(), cwd)
  const workspace = !isAbsolute(path) && path !== '..' && !path.startsWith(`..${sep}`)
    ? path ? `~${sep}${path}` : '~'
    : cwd
  let gitBranch: string | null = null
  try {
    const { stdout } = await exec('git', ['-C', cwd, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeout: 1000, maxBuffer: 4096 })
    gitBranch = stdout.trim() || null
  }
  catch { /* Missing workspaces, git, or repositories are valid for browsing. */ }
  return { workspace, gitBranch }
}

export async function statusEnvironment(cwd: string) {
  const [workspace, autoCompaction] = await Promise.all([
    workspaceStatus(cwd),
    compactionSettings.get(cwd, '', 1, async () => SettingsManager.create(cwd).getCompactionEnabled()),
  ])
  return { ...workspace, autoCompaction }
}

// Match Pi's footer: billing totals include every branch and pre-compaction history.
export function sessionUsage(manager: SessionManager): UsageTotals {
  const cached = usageTotals.get(manager)
  if (cached && cached.count === manager.getEntryCount() && (!cached.last || manager.getEntry(cached.last.id) === cached.last))
    return { ...cached.totals }
  const entries = manager.getEntries()
  // Persisted entries are immutable and append-only during a run. Branch moves
  // don't affect billing totals; reload/truncation falls back to a full sum.
  const reusable = cached && cached.count <= entries.length && (cached.count === 0 || entries[cached.count - 1] === cached.last)
  const totals: UsageTotals = reusable ? { ...cached.totals } : { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheHitRate: null, cost: 0 }
  for (let index = reusable ? cached.count : 0; index < entries.length; index++) {
    const entry = entries[index]!
    const usage = entry.type === 'usage' || entry.type === 'compaction' || entry.type === 'branch_summary'
      ? entry.usage
      : entry.type === 'message' && (entry.message.role === 'assistant' || entry.message.role === 'toolResult')
        ? entry.message.usage
        : undefined
    if (!usage)
      continue
    totals.input += usage.input
    totals.output += usage.output
    totals.cacheRead += usage.cacheRead
    totals.cacheWrite += usage.cacheWrite
    totals.cost += usage.cost.total
    if (entry.type === 'message' && entry.message.role === 'assistant') {
      const prompt = usage.input + usage.cacheRead + usage.cacheWrite
      totals.cacheHitRate = prompt > 0 ? usage.cacheRead / prompt * 100 : null
    }
  }
  usageTotals.set(manager, { count: entries.length, last: entries.at(-1), totals: { ...totals } })
  return totals
}

export function recordedContext(manager: SessionManager, contextWindow: number): SessionStatus['context'] {
  if (contextWindow <= 0)
    return null
  const branch = manager.getBranch()
  const projection = manager.buildSessionProjection()
  const branchIndexes = new Map(branch.map((entry, index) => [entry.id, index]))
  const invalidation = branch.findLastIndex(entry => entry.type === 'compaction' || entry.type === 'context_edit')
  // Trust only a projected, successful response after the most recent context change.
  for (let i = projection.entries.length - 1; i >= 0; i--) {
    const entry = projection.entries[i]!
    const assistant = entry.messages.find(message => message.role === 'assistant'
      && message.stopReason !== 'error' && message.stopReason !== 'aborted'
      && calculateContextTokens(message.usage) > 0)
    if (assistant?.role !== 'assistant')
      continue
    if ((branchIndexes.get(entry.sourceEntry.id) ?? -1) <= invalidation)
      break
    const trailing = projection.entries.slice(i + 1).flatMap(item => item.messages)
    const tokens = calculateContextTokens(assistant.usage) + trailing.reduce((sum, message) => sum + estimateTokens(message), 0)
    return { tokens, contextWindow, percent: tokens / contextWindow * 100 }
  }
  return { tokens: null, contextWindow, percent: null }
}

export async function recordedStatus(manager: SessionManager, selected = manager.buildSessionContext().model): Promise<SessionStatus> {
  const environment = await statusEnvironment(manager.getCwd())
  const status: SessionStatus = {
    ...environment,
    ...sessionUsage(manager),
    context: null,
    subscription: false,
  }
  try {
    // Catalog lookup only: no agent, extensions, credential refresh, or provider requests.
    const runtime = await runtimes.get('catalog', '', 1, () => ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false }))
    const model = selected && runtime.getModel(selected.provider, selected.modelId)
    status.context = recordedContext(manager, model?.contextWindow ?? 0)
    status.subscription = !!selected && (selected.provider === 'kimi-coding' || runtime.isUsingSubscription(selected.provider))
  }
  catch { /* A missing/broken model catalog must not prevent conversation browsing. */ }
  return status
}

export function liveStatus(session: Pick<AgentSession, 'sessionManager' | 'getContextUsage' | 'autoCompactionEnabled' | 'model' | 'modelRuntime'>, workspace: Pick<SessionStatus, 'workspace' | 'gitBranch'>): SessionStatus {
  return {
    ...workspace,
    ...sessionUsage(session.sessionManager),
    context: session.getContextUsage() ?? null,
    autoCompaction: session.autoCompactionEnabled,
    subscription: !!session.model && (session.model.provider === 'kimi-coding' || session.modelRuntime.isUsingSubscription(session.model.provider)),
  }
}
