import type { SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import type { ConversationEntry } from '@pi-simple-web/shared/types/conversation'

export type StreamingBehavior = 'steer' | 'followUp'

export interface ConversationQueue { steering: string[], followUp: string[] }

export type ConversationEvent
  = | { type: 'queue', queue: ConversationQueue }
    | { type: 'started', id: string, cwd: string, branch: ConversationEntry[], status?: SessionStatus }
    | { type: 'message', entry: ConversationEntry }
    | { type: 'conversation', branch: ConversationEntry[], status?: SessionStatus }
    | { type: 'status', status: SessionStatus }
    | { type: 'error', message: string }
    | { type: 'done', branch: ConversationEntry[], status?: SessionStatus }
