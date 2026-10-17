import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { runInNewContext } from 'node:vm'

// Execute the actual middleware with Nitro's auto-imported helpers supplied.
const source = readFileSync(new URL('../apps/api/server/middleware/cors.ts', import.meta.url), 'utf8')
const trustedOrigin = 'https://barbabot.soubiran.dev'

function request(method: string, headers: Record<string, string>, pathname = '/api/conversations') {
  const responseHeaders: Record<string, string> = {}
  const event = { method, headers, statusCode: 200 }
  const handler = runInNewContext(source.replace('export default ', ''), {
    defineEventHandler: (handler: unknown) => handler,
    getRequestURL: () => new URL(pathname, 'https://barbabot-api.soubiran.dev'),
    getHeader: (_event: unknown, name: string) => headers[name],
    useRuntimeConfig: () => ({ allowedOrigins: trustedOrigin }),
    appendResponseHeader: (_event: unknown, name: string, value: string) => { responseHeaders[name] = value },
    setResponseHeader: (_event: unknown, name: string, value: string) => { responseHeaders[name] = value },
    createError: (details: object) => Object.assign(new Error('CORS request rejected'), details),
    sendNoContent: () => { event.statusCode = 204 },
  })
  return { run: () => handler(event), event, responseHeaders }
}

for (const method of ['GET', 'POST', 'OPTIONS']) {
  test(`trusted ${method} requests support credentials`, () => {
    const result = request(method, {
      'origin': trustedOrigin,
      'access-control-request-method': 'POST',
      'access-control-request-headers': 'content-type',
    })
    result.run()
    assert.equal(result.responseHeaders['Access-Control-Allow-Origin'], trustedOrigin)
    assert.equal(result.responseHeaders['Access-Control-Allow-Credentials'], 'true')
    assert.equal(result.responseHeaders.Vary, 'Origin')
    assert.equal(result.responseHeaders['Access-Control-Expose-Headers'], 'ETag')
    if (method === 'OPTIONS')
      assert.equal(result.event.statusCode, 204)
  })
}

test('untrusted origins do not receive credential permission', () => {
  const result = request('GET', { origin: 'https://untrusted.example' })
  assert.throws(result.run, { statusCode: 403 })
  assert.equal(result.responseHeaders['Access-Control-Allow-Credentials'], undefined)
  assert.equal(result.responseHeaders['Access-Control-Allow-Origin'], undefined)
})

test('requests without an origin do not receive credential permission', () => {
  const result = request('GET', {})
  result.run()
  assert.equal(result.responseHeaders['Access-Control-Allow-Credentials'], undefined)
})

test('credential support does not relax preflight validation', () => {
  const result = request('OPTIONS', {
    'origin': trustedOrigin,
    'access-control-request-method': 'DELETE',
  })
  assert.throws(result.run, { statusCode: 403 })
})
