import type { ConversationEntry } from '@pi-simple-web/shared/types/conversation'

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

export interface SessionPage {
  items: SessionSummary[]
  nextOffset: number | null
  total: number
  workspaces: string[]
}

export interface SessionMetrics {
  sessions: number
  workspaces: number
  messages: number
  usage: SessionUsage
  missingUsage: number
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
  version: string
  model: { provider: string, modelId: string } | null
  thinkingLevel: string
  leafId: string | null
  entryCount: number
  status: SessionStatus
  branch: ConversationEntry[]
}
