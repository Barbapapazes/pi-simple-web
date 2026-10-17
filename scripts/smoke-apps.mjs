import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { setTimeout } from 'node:timers/promises'

const bundle = resolve(process.argv[2])
const directory = await mkdtemp(join(tmpdir(), 'pi-apps-'))
const children = []
async function port() {
  const server = createServer()
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const value = server.address().port
  await new Promise(resolve => server.close(resolve))
  return value
}
async function start(app, extra) {
  const assigned = await port()
  const url = `http://127.0.0.1:${assigned}`
  const child = spawn(process.execPath, [join(bundle, app, '.output/server/index.mjs')], {
    cwd: directory,
    env: { ...process.env, HOST: '127.0.0.1', PORT: String(assigned), ...extra },
    stdio: 'inherit',
  })
  children.push(child)
  for (let attempt = 0; attempt < 100; attempt++) {
    assert.equal(child.exitCode, null, `${app} exited before becoming ready`)
    try {
      await fetch(url)
      return url
    }
    catch {
      await setTimeout(100)
    }
  }
  throw new Error(`${app} did not start`)
}
try {
  assert.equal(existsSync(join(bundle, 'web/.output/server/node_modules/@earendil-works/pi-coding-agent')), false)
  const origin = 'https://chat.example.com'
  const api = await start('api', { NUXT_PI_SESSION_DIR: directory, PI_CODING_AGENT_DIR: directory, NUXT_ALLOWED_ORIGINS: origin })
  const web = await start('web', { NUXT_PUBLIC_API_BASE: api })
  const home = await fetch(web)
  assert.equal(home.status, 200)
  const html = await home.text()
  assert.match(html, /<html/)
  assert.ok(html.includes(api))
  assert.equal((await fetch(`${web}/new`)).status, 200)
  assert.equal((await fetch(`${web}/pi.svg`)).status, 200)
  const icons = await fetch(`${web}/api/_nuxt_icon/lucide.json?icons=refresh-cw`)
  assert.equal(icons.status, 200)
  assert.ok((await icons.json()).icons['refresh-cw'])
  const sessions = await fetch(`${api}/api/sessions`, { headers: { origin } })
  assert.equal(sessions.status, 200)
  assert.equal(sessions.headers.get('access-control-allow-origin'), origin)
  assert.deepEqual(await sessions.json(), [])
  assert.equal((await fetch(`${api}/api/sessions/missing`)).status, 404)
  for (const path of ['/api/sessions', '/api/conversations']) {
    const preflight = await fetch(`${api}${path}`, {
      method: 'OPTIONS',
      headers: {
        'origin': origin,
        'access-control-request-method': path.endsWith('sessions') ? 'GET' : 'POST',
        'access-control-request-headers': 'content-type',
      },
    })
    assert.equal(preflight.status, 204)
    assert.equal(preflight.headers.get('access-control-allow-origin'), origin)
    assert.match(preflight.headers.get('access-control-allow-headers'), /Content-Type/i)
    for (const method of ['GET', 'OPTIONS']) {
      const denied = await fetch(`${api}${path}`, {
        method,
        headers: { 'origin': 'https://untrusted.example', 'access-control-request-method': 'POST' },
      })
      assert.equal(denied.status, 403)
      assert.equal(denied.headers.get('access-control-allow-origin'), null)
    }
  }
  const invalid = await fetch(`${api}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin },
    body: JSON.stringify({ message: '' }),
  })
  assert.equal(invalid.status, 400)
  assert.equal(invalid.headers.get('access-control-allow-origin'), origin)
  console.log('Standalone API, frontend, and CORS smoke tests passed.')
}
finally {
  await Promise.all(children.map(child => new Promise((resolve) => {
    if (child.exitCode !== null)
      return resolve()
    child.once('exit', resolve)
    child.kill()
  })))
  await rm(directory, { recursive: true, force: true })
}
