import type { AgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import type { SessionStatus } from '../../shared/types/sessions.ts'
import { execFile } from 'node:child_process'
import { homedir } from 'node:os'
import { isAbsolute, relative, sep } from 'node:path'
import { promisify } from 'node:util'
import { calculateContextTokens, estimateTokens, ModelRuntime, SettingsManager } from '@earendil-works/pi-coding-agent'

const exec = promisify(execFile)

export async function workspaceStatus(cwd: string): Promise<Pick<SessionStatus, 'workspace' | 'gitBranch'>> {
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

// Match Pi's footer: billing totals include every branch and pre-compaction history.
export function sessionUsage(manager: SessionManager): Pick<SessionStatus, 'input' | 'output' | 'cacheRead' | 'cacheWrite' | 'cacheHitRate' | 'cost'> {
  const totals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cacheHitRate: null as number | null, cost: 0 }
  for (const entry of manager.getEntries()) {
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
  return totals
}

export function recordedContext(manager: SessionManager, contextWindow: number): SessionStatus['context'] {
  if (contextWindow <= 0)
    return null
  const branch = manager.getBranch()
  const projection = manager.buildSessionProjection()
  const invalidation = branch.findLastIndex(entry => entry.type === 'compaction' || entry.type === 'context_edit')
  // Trust only a projected, successful response after the most recent context change.
  for (let i = projection.entries.length - 1; i >= 0; i--) {
    const entry = projection.entries[i]!
    const assistant = entry.messages.find(message => message.role === 'assistant'
      && message.stopReason !== 'error' && message.stopReason !== 'aborted'
      && calculateContextTokens(message.usage) > 0)
    if (assistant?.role !== 'assistant')
      continue
    if (branch.findIndex(item => item.id === entry.sourceEntry.id) <= invalidation)
      break
    const trailing = projection.entries.slice(i + 1).flatMap(item => item.messages)
    const tokens = calculateContextTokens(assistant.usage) + trailing.reduce((sum, message) => sum + estimateTokens(message), 0)
    return { tokens, contextWindow, percent: tokens / contextWindow * 100 }
  }
  return { tokens: null, contextWindow, percent: null }
}

export async function recordedStatus(manager: SessionManager): Promise<SessionStatus> {
  const workspace = await workspaceStatus(manager.getCwd())
  const status: SessionStatus = {
    ...workspace,
    ...sessionUsage(manager),
    context: null,
    autoCompaction: SettingsManager.create(manager.getCwd()).getCompactionEnabled(),
    subscription: false,
  }
  try {
    // Catalog lookup only: no agent, extensions, credential refresh, or provider requests.
    const runtime = await ModelRuntime.create({ refreshOnCreate: false, allowModelNetwork: false })
    const selected = manager.buildSessionContext().model
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
