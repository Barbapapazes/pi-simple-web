import type { TranscriptBlock, TranscriptEntry } from '../types/sessions.ts'

// Pair by ID, never by adjacency: parallel tools may complete out of order.
// Clone the presentation data so persisted/live transcript state stays untouched.
export function groupToolResults(entries: TranscriptEntry[]): TranscriptEntry[] {
  const calls = new Map<string, TranscriptBlock>()
  const grouped = entries.map(entry => ({ ...entry, blocks: entry.blocks.map(block => ({ ...block })) }))
  for (const entry of grouped) {
    for (const block of entry.blocks) {
      if (block.type === 'toolCall' && block.toolCallId) calls.set(block.toolCallId, block)
    }
  }
  return grouped.filter(entry => {
    if (!entry.role.startsWith('tool:') || !entry.toolCallId) return true
    const call = calls.get(entry.toolCallId)
    if (!call) return true
    call.result = { blocks: entry.blocks, isError: entry.isError, diff: entry.diff }
    return false
  })
}

export function previewLines(text: string, limit: number, tail = false) {
  const lines = text.trimEnd().split('\n')
  return {
    text: (tail ? lines.slice(-limit) : lines.slice(0, limit)).join('\n'),
    hidden: Math.max(0, lines.length - limit),
  }
}
