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

export interface TranscriptBlock {
  type: 'text' | 'thinking' | 'toolCall' | 'image' | 'data'
  text?: string
  name?: string
  src?: string
  toolCallId?: string
  arguments?: Record<string, unknown>
  result?: { blocks: TranscriptBlock[], isError: boolean, diff?: string }
}

export interface TranscriptEntry {
  id: string
  type: string
  role: string
  timestamp: string
  isError: boolean
  model?: string
  toolCallId?: string
  diff?: string
  blocks: TranscriptBlock[]
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
  branch: TranscriptEntry[]
}
