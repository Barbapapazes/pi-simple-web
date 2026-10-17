// Neutral data contracts shared by persisted sessions and live conversations.
export interface ConversationBlock {
  type: 'text' | 'thinking' | 'toolCall' | 'image' | 'data'
  text?: string
  name?: string
  src?: string
  toolCallId?: string
  arguments?: Record<string, unknown>
  result?: { blocks: ConversationBlock[], isError: boolean, diff?: string }
}

export interface ConversationEntry {
  id: string
  type: string
  role: string
  timestamp: string
  isError: boolean
  model?: string
  toolCallId?: string
  diff?: string
  blocks: ConversationBlock[]
}
