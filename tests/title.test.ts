import assert from 'node:assert/strict'
import { test } from 'node:test'
import { truncateTitle } from '../shared/utils/title.ts'

test('titles of at most 100 characters remain unchanged', () => {
  for (const title of ['', 'Conversation', 'a'.repeat(100)]) {
    assert.equal(truncateTitle(title), title)
  }
})

test('long titles show 100 characters followed by an ellipsis', () => {
  assert.equal(truncateTitle('a'.repeat(101)), `${'a'.repeat(100)}…`)
})

test('title truncation preserves Unicode characters', () => {
  assert.equal(truncateTitle('😀'.repeat(101)), `${'😀'.repeat(100)}…`)
})
