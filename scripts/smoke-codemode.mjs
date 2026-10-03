import assert from 'node:assert/strict'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import process from 'node:process'
import { pathToFileURL } from 'node:url'

// Resolve only from the built server, never from the source checkout's dependencies.
const output = resolve(process.argv[2] || '.output')
const sdkEntry = join(output, 'server/node_modules/@earendil-works/pi-coding-agent/dist/index.js')
const directory = await mkdtemp(join(tmpdir(), 'pi-web-codemode-'))
const previousAgentDir = process.env.PI_CODING_AGENT_DIR
process.env.PI_CODING_AGENT_DIR = directory
let session
try {
  const { createAgentSession, createCodemodeExtension, DefaultResourceLoader, SessionManager, SettingsManager } = await import(
    pathToFileURL(sdkEntry).href,
  )
  const resourceLoader = new DefaultResourceLoader({
    cwd: directory,
    agentDir: directory,
    extensionFactories: [createCodemodeExtension({ mode: 'on' })],
  })
  await resourceLoader.reload()
  assert.deepEqual(resourceLoader.getExtensions().errors, [])
  ;({ session } = await createAgentSession({
    cwd: directory,
    agentDir: directory,
    resourceLoader,
    settingsManager: SettingsManager.inMemory({ defaultTools: ['+codemode'] }),
    sessionManager: SessionManager.inMemory(directory),
  }))
  await session.bindExtensions({})
  const fixture = join(directory, 'fixture.txt')
  await writeFile(fixture, 'codemode-bundle-ok')
  const codemode = session.agent.state.tools.find(tool => tool.name === 'codemode')
  assert.ok(codemode, 'codemode must be callable in the production SDK')
  const args = { code: `text(await tools.read({ path: ${JSON.stringify(fixture)} }));` }
  // Nested tool calls require an issuing assistant message, but no model request.
  session.agent.state.messages.push({
    role: 'assistant',
    content: [{ type: 'toolCall', id: 'bundle-smoke', name: 'codemode', arguments: args }],
    api: 'openai-completions',
    provider: 'fixture',
    model: 'fixture',
    usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
    stopReason: 'toolUse',
    timestamp: Date.now(),
  })
  const result = await codemode.execute('bundle-smoke', args)
  assert.ok(!result.isError, JSON.stringify(result.content))
  assert.match(JSON.stringify(result.content), /Script completed/)
  assert.match(JSON.stringify(result.content), /codemode-bundle-ok/)
  console.log('Production codemode smoke test passed (WASM and tool bridge).')
}
finally {
  session?.dispose()
  if (previousAgentDir === undefined)
    delete process.env.PI_CODING_AGENT_DIR
  else
    process.env.PI_CODING_AGENT_DIR = previousAgentDir
  await rm(directory, { recursive: true, force: true })
}
