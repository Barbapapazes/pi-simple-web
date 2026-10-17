import type { ConversationEvent, ConversationQueue } from '@pi-simple-web/shared/conversations/types/conversation'
import type { SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import type { ConversationEntry } from '@pi-simple-web/shared/types/conversation'
import type { createConversationRun } from './conversation.ts'

// Process-local agent ownership: reconnecting attaches observers, never starts an agent.
export const activeSessions = new Set<string>()
export const activeRuns = new Map<string, ReturnType<typeof createConversationRun>>()
export const liveConversations = new Map<string, ReturnType<typeof createLiveConversation>>()

export function createLiveConversation(id: string, cwd: string, initial: ConversationEntry[]) {
  let branch = new Map(initial.map(entry => [entry.id, entry]))
  let status: SessionStatus | undefined
  let queue: ConversationQueue = { steering: [], followUp: [] }
  let ended = false
  const observers = new Set<{ emit: (event: ConversationEvent) => void, close: () => void }>()
  return {
    publish(event: ConversationEvent) {
      if (ended)
        return
      if ('status' in event && event.status)
        status = event.status
      if (event.type === 'message')
        branch.set(event.entry.id, event.entry)
      if ('branch' in event)
        branch = new Map(event.branch.map(entry => [entry.id, entry]))
      if (event.type === 'queue')
        queue = event.queue
      for (const observer of observers) {
        try {
          observer.emit(event)
        }
        catch {
          observers.delete(observer)
        }
      }
      if (event.type === 'done') {
        ended = true
        for (const observer of observers) {
          try {
            observer.close()
          }
          catch { /* A disconnected observer cannot prevent other completions. */ }
        }
        observers.clear()
      }
    },
    subscribe(emit: (event: ConversationEvent) => void, close: () => void) {
      // A fresh snapshot makes reconnect lossless without an unbounded replay log.
      emit({ type: 'started', id, cwd, branch: [...branch.values()], status })
      emit({ type: 'queue', queue })
      if (ended) {
        emit({ type: 'done', branch: [...branch.values()], status })
        close()
        return () => {}
      }
      const observer = { emit, close }
      observers.add(observer)
      return () => observers.delete(observer)
    },
  }
}
