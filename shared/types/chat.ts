import type { SessionStatus, TranscriptEntry } from './sessions'

export type StreamingBehavior = 'steer' | 'followUp'

export type ChatQueue = { steering: string[], followUp: string[] }

export type ChatEvent =
  | { type: 'queue', queue: ChatQueue }
  | { type: 'started', id: string, cwd: string, branch: TranscriptEntry[], status?: SessionStatus }
  | { type: 'transcript', branch: TranscriptEntry[], status?: SessionStatus }
  | { type: 'status', status: SessionStatus }
  | { type: 'error', message: string }
  | { type: 'done', branch: TranscriptEntry[], status?: SessionStatus }
