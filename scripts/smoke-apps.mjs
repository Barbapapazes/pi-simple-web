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
const servers = []
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
  const api = await start('api', { NUXT_PI_SESSION_DIR: directory, PI_CODING_AGENT_DIR: directory })
  const web = await start('web', { NUXT_API_BASE: api })
  const home = await fetch(web)
  assert.equal(home.status, 200)
  assert.match(await home.text(), /<html/)
  assert.equal((await fetch(`${web}/new`)).status, 200)
  assert.equal((await fetch(`${web}/pi.svg`)).status, 200)
  const icons = await fetch(`${web}/api/_nuxt_icon/lucide.json?icons=refresh-cw`)
  assert.equal(icons.status, 200)
  assert.ok((await icons.json()).icons['refresh-cw'])
  for (const base of [api, web]) {
    const sessions = await fetch(`${base}/api/sessions`)
    assert.equal(sessions.status, 200)
    assert.deepEqual(await sessions.json(), [])
    assert.equal((await fetch(`${base}/api/sessions/missing`)).status, 404)
    assert.equal((await fetch(`${base}/api/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': base },
      body: JSON.stringify({ message: '' }),
    })).status, 400)
    assert.equal((await fetch(`${base}/api/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': 'https://untrusted.example' },
      body: JSON.stringify({ message: 'do not run' }),
    })).status, 403)
  }

  // Exercise the production proxy with a deterministic SSE upstream, no model
  // credentials required. The first event must arrive before the stream ends.
  const upstream = createServer(async (req, res) => {
    // Server rendering loads the sidebar's session query before SSE is tested.
    if (req.url === '/api/sessions') {
      res.setHeader('content-type', 'application/json')
      res.end('[]')
      return
    }
    assert.equal(req.url, '/api/conversations')
    assert.equal(req.headers.origin, `http://${req.headers.host}`)
    let body = ''
    for await (const chunk of req)
      body += chunk
    const input = JSON.parse(body)
    if (input.streamingBehavior) {
      res.setHeader('content-type', 'application/json')
      res.end(JSON.stringify({ disposition: input.streamingBehavior }))
      return
    }
    assert.equal(input.message, 'stream fixture')
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' })
    res.write('data: {"type":"started","id":"fixture","branch":[]}\n\n')
    await setTimeout(1000)
    res.end('data: {"type":"done","branch":[]}\n\n')
  })
  servers.push(upstream)
  await new Promise(resolve => upstream.listen(0, '127.0.0.1', resolve))
  const streamWeb = await start('web', { NUXT_API_BASE: `http://127.0.0.1:${upstream.address().port}` })
  const response = await fetch(`${streamWeb}/api/conversations`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': streamWeb },
    body: JSON.stringify({ message: 'stream fixture' }),
  })
  assert.equal(response.status, 200)
  assert.match(response.headers.get('content-type'), /text\/event-stream/)
  const reader = response.body.getReader()
  const first = new TextDecoder().decode((await reader.read()).value)
  assert.match(first, /started/)
  assert.doesNotMatch(first, /done/)
  let rest = ''
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done)
      break
    rest += new TextDecoder().decode(chunk.value)
  }
  assert.match(rest, /done/)
  for (const streamingBehavior of ['steer', 'followUp']) {
    const queued = await fetch(`${streamWeb}/api/conversations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': streamWeb },
      body: JSON.stringify({ id: 'fixture', message: 'queued', streamingBehavior }),
    })
    assert.equal(queued.status, 200)
    assert.deepEqual(await queued.json(), { disposition: streamingBehavior })
  }
  console.log('Standalone API, frontend, origin protection, SSE, and queued input smoke tests passed.')
}
finally {
  await Promise.all(children.map(child => new Promise((resolve) => {
    if (child.exitCode !== null)
      return resolve()
    child.once('exit', resolve)
    child.kill()
  })))
  await Promise.all(servers.map(server => new Promise(resolve => server.close(resolve))))
  await rm(directory, { recursive: true, force: true })
}
