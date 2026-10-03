import type { ConversationEntry } from '../../../../../shared/types/conversation.ts'

export interface SessionUsage {
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cost: number
}

export interface SessionSummary {
  id: string
  name?: string
  cwd: string
  created: string
  modified: string
  messageCount: number
  firstMessage: string
  usage: SessionUsage | null
}

export interface SessionStatus {
  workspace: string
  gitBranch: string | null
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheHitRate: number | null
  cost: number
  context: { tokens: number | null, contextWindow: number, percent: number | null } | null
  autoCompaction: boolean
  subscription: boolean
}

export interface SessionDetail extends SessionSummary {
  model: { provider: string, modelId: string } | null
  thinkingLevel: string
  leafId: string | null
  entryCount: number
  status: SessionStatus
  branch: ConversationEntry[]
}
