import type { SessionStatus } from '../../../../sessions/runtime/shared/types/sessions.ts'
import type { ConversationEntry } from '../../../../../shared/types/conversation.ts'

export type StreamingBehavior = 'steer' | 'followUp'

export type ConversationQueue = { steering: string[], followUp: string[] }

export type ConversationEvent =
  | { type: 'queue', queue: ConversationQueue }
  | { type: 'started', id: string, cwd: string, branch: ConversationEntry[], status?: SessionStatus }
  | { type: 'conversation', branch: ConversationEntry[], status?: SessionStatus }
  | { type: 'status', status: SessionStatus }
  | { type: 'error', message: string }
  | { type: 'done', branch: ConversationEntry[], status?: SessionStatus }
