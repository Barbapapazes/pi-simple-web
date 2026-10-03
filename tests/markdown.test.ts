import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseMarkdown } from '@comark/nuxt/parse'
import { transcriptMarkdownOptions } from '../shared/utils/markdown.ts'

test('transcript Markdown renders headings, formatting, lists, and fenced code', async () => {
  const document = await parseMarkdown('# Heading\n\n**bold** and `code`\n\n- item\n\n```js\nconst x = 1\n```', transcriptMarkdownOptions)
  assert.deepEqual(document.nodes, [
    ['h1', {}, 'Heading'],
    ['p', {}, ['strong', {}, 'bold'], ' and ', ['code', {}, 'code']],
    ['ul', {}, ['li', {}, 'item']],
    ['pre', { language: 'js' }, ['code', { class: 'language-js' }, 'const x = 1']],
  ])
})

test('transcript HTML, components, attributes, and unsafe links remain literal', async () => {
  const paragraphs = [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '::theme-toggle\n::',
    ':theme-toggle',
    'hello{onclick=alert(1)}',
    '[bad](javascript:alert%281%29)',
  ]
  const document = await parseMarkdown(paragraphs.join('\n\n'), transcriptMarkdownOptions)
  assert.deepEqual(document.nodes, paragraphs.map(text => ['p', {}, text]))
})
