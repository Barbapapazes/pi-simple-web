import { test } from 'node:test'
import assert from 'node:assert/strict'
import { groupToolResults, previewLines } from '../shared/utils/transcript.ts'
import type { TranscriptEntry } from '../shared/types/sessions.ts'

const entry = (id: string, fields: Partial<TranscriptEntry>): TranscriptEntry => ({
  id, type: 'message', role: 'assistant', timestamp: '2026-01-01T00:00:00Z', isError: false, blocks: [], ...fields,
})

test('pairs parallel tool results by ID without mutating the transcript', () => {
  const entries = [
    entry('calls', { blocks: [
      { type: 'toolCall', name: 'read', toolCallId: 'read', text: '/file.ts' },
      { type: 'toolCall', name: 'edit', toolCallId: 'edit' },
    ] }),
    entry('edit-result', { role: 'tool: edit', toolCallId: 'edit', diff: '-old\n+new', blocks: [{ type: 'text', text: 'Edited' }] }),
    entry('read-result', { role: 'tool: read', toolCallId: 'read', isError: true, blocks: [{ type: 'text', text: 'Not found' }] }),
    entry('orphan', { role: 'tool: bash', toolCallId: 'missing', blocks: [{ type: 'text', text: 'Keep me' }] }),
  ]
  const original = JSON.stringify(entries)
  const grouped = groupToolResults(entries)
  assert.deepEqual(grouped.map(e => e.id), ['calls', 'orphan'])
  assert.equal(grouped[0]?.blocks[0]?.result?.isError, true)
  assert.equal(grouped[0]?.blocks[0]?.result?.blocks[0]?.text, 'Not found')
  assert.equal(grouped[0]?.blocks[1]?.result?.diff, '-old\n+new')
  assert.equal(JSON.stringify(entries), original)
})

test('keeps pending calls and uncorrelated legacy results', () => {
  const entries = [
    entry('pending', { blocks: [{ type: 'toolCall', name: 'bash', toolCallId: 'pending' }] }),
    entry('legacy', { role: 'tool: read', blocks: [{ type: 'text', text: 'Legacy output' }] }),
  ]
  assert.equal(groupToolResults(entries).length, 2)
  assert.equal(groupToolResults(entries)[0]?.blocks[0]?.result, undefined)
})

test('previews shell output from the tail and other output from the start', () => {
  const text = 'one\ntwo\nthree\nfour\n'
  assert.deepEqual(previewLines(text, 2, true), { text: 'three\nfour', hidden: 2 })
  assert.deepEqual(previewLines(text, 2), { text: 'one\ntwo', hidden: 2 })
  assert.deepEqual(previewLines('one', 5), { text: 'one', hidden: 0 })
  assert.deepEqual(previewLines('', 5), { text: '', hidden: 0 })
})
