import type { StreamingBehavior } from '../types/conversation.ts'

export function messageShortcut(
  event: { key: string, altKey: boolean, ctrlKey: boolean, metaKey: boolean, shiftKey: boolean, isComposing: boolean, keyCode: number },
  windows = false,
): StreamingBehavior | undefined {
  if (event.isComposing || event.keyCode === 229 || event.shiftKey || event.metaKey)
    return
  if (windows && event.key.toLowerCase() === 'q' && event.ctrlKey && !event.altKey)
    return 'followUp'
  if (event.key !== 'Enter' || event.ctrlKey)
    return
  return event.altKey ? 'followUp' : 'steer'
}
