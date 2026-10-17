import type { ConversationBlock, ConversationEntry } from '@pi-simple-web/shared/types/conversation'

// Pair by ID, never by adjacency: parallel tools may complete out of order.
// Clone the presentation data so persisted/live conversation state stays untouched.
export function groupToolResults(entries: ConversationEntry[]): ConversationEntry[] {
  const calls = new Map<string, ConversationBlock>()
  const grouped = entries.map(entry => ({ ...entry, blocks: entry.blocks.map(block => ({ ...block })) }))
  for (const entry of grouped) {
    for (const block of entry.blocks) {
      if (block.type === 'toolCall' && block.toolCallId)
        calls.set(block.toolCallId, block)
    }
  }
  return grouped.filter((entry) => {
    if (!entry.role.startsWith('tool:') || !entry.toolCallId)
      return true
    const call = calls.get(entry.toolCallId)
    if (!call)
      return true
    call.result = { blocks: entry.blocks, isError: entry.isError, diff: entry.diff }
    return false
  })
}

// Preserve object identity for unchanged messages so token updates do not
// re-render historical Markdown. The WeakMap releases replaced snapshots.
export function createToolResultGrouper() {
  const cache = new WeakMap<ConversationEntry, { results: (ConversationEntry | undefined)[], view: ConversationEntry }>()
  const entryCalls = new WeakMap<ConversationEntry, string[]>()
  function callIds(entry: ConversationEntry) {
    let ids = entryCalls.get(entry)
    if (!ids) {
      ids = entry.blocks.filter(block => block.type === 'toolCall' && block.toolCallId).map(block => block.toolCallId!)
      entryCalls.set(entry, ids)
    }
    return ids
  }
  return (entries: ConversationEntry[]): ConversationEntry[] => {
    const calls = new Set<string>()
    const results = new Map<string, ConversationEntry>()
    for (const entry of entries) {
      if (entry.role.startsWith('tool:') && entry.toolCallId)
        results.set(entry.toolCallId, entry)
      for (const id of callIds(entry))
        calls.add(id)
    }
    return entries.filter(entry => !entry.role.startsWith('tool:') || !entry.toolCallId || !calls.has(entry.toolCallId)).map((entry) => {
      if (!callIds(entry).length)
        return entry
      const paired = entry.blocks.map(block => block.type === 'toolCall' && block.toolCallId ? results.get(block.toolCallId) : undefined)
      if (!paired.some(Boolean))
        return entry
      const cached = cache.get(entry)
      if (cached && paired.every((result, index) => result === cached.results[index]))
        return cached.view
      const view = { ...entry, blocks: entry.blocks.map((block, index): ConversationBlock => {
        const result = paired[index]
        return result ? { ...block, result: { blocks: result.blocks, isError: result.isError, diff: result.diff } } : block
      }) }
      cache.set(entry, { results: paired, view })
      return view
    })
  }
}

export function previewLines(text: string, limit: number, tail = false) {
  const lines = text.trimEnd().split('\n')
  return {
    text: (tail ? lines.slice(-limit) : lines.slice(0, limit)).join('\n'),
    hidden: Math.max(0, lines.length - limit),
  }
}
