import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'
import { test } from 'node:test'
import { setTimeout } from 'node:timers/promises'
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import { createConversationResourceLoader, disposeConversationSession } from '../modules/conversations/runtime/server/services/agent.ts'

// A local JSON-RPC fixture: no credentials, model requests, or external network.
const serverScript = `
const { createInterface } = require('node:readline');
const { writeFileSync } = require('node:fs');
writeFileSync(process.argv[1], String(process.pid));
const input = createInterface({ input: process.stdin });
input.on('close', () => process.exit(0));
input.on('line', (line) => {
  const request = JSON.parse(line);
  if (request.id === undefined) return;
  let result = {};
  if (request.method === 'initialize') {
    result = {
      protocolVersion: request.params.protocolVersion,
      capabilities: { tools: {} },
      serverInfo: { name: 'test', version: '1.0.0' },
    };
  }
  if (request.method === 'tools/list') {
    result = { tools: [{ name: 'hello', description: 'Say hello', inputSchema: { type: 'object' } }] };
  }
  if (request.method === 'tools/call') {
    result = { content: [{ type: 'text', text: 'Hello from MCP' }] };
  }
  process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: request.id, result }) + '\\n');
});
`

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (predicate())
      return
    await setTimeout(50)
  }
  assert.fail('Timed out waiting for the local MCP fixture')
}

for (const exposure of ['codemode', 'deferred', 'direct']) {
  test(`web sessions connect ${exposure} MCP tools and close their server`, { timeout: 15000 }, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pi-web-mcp-'))
    const previousAgentDir = process.env.PI_CODING_AGENT_DIR
    process.env.PI_CODING_AGENT_DIR = directory
    const pidPath = join(directory, 'server.pid')
    let session: Awaited<ReturnType<typeof createAgentSession>>['session'] | undefined
    try {
      await writeFile(join(directory, 'mcp.json'), JSON.stringify({
        mcpServers: {
          fixture: { command: process.execPath, args: ['-e', serverScript, pidPath], exposure },
        },
      }))
      const resourceLoader = await createConversationResourceLoader(directory)
      assert.deepEqual(resourceLoader.getExtensions().errors, [])
      ;({ session } = await createAgentSession({
        cwd: directory,
        agentDir: directory,
        resourceLoader,
        sessionManager: SessionManager.inMemory(directory),
      }))
      await session.bindExtensions({})
      const agent = session
      await waitFor(() => agent.getAllTools().some(tool => tool.name === 'mcp__fixture__hello'))
      const tool = agent.getAllTools().find(tool => tool.name === 'mcp__fixture__hello')!
      // MCP codemode tools use deferred registration so discovery stays lazy.
      assert.equal(tool.exposure, exposure === 'codemode' ? 'deferred' : exposure)
      assert.ok(agent.getCallableToolNames().includes(tool.name))
      const entryPoint = exposure === 'deferred' ? 'tool_search' : exposure === 'direct' ? tool.name : 'codemode'
      assert.ok(agent.getActiveToolNames().includes(entryPoint))
      assert.ok(agent.getActiveToolNames().includes('read'), 'configured default tools are preserved')

      if (exposure === 'direct' || exposure === 'codemode') {
        const callable = agent.agent.state.tools.find(tool => tool.name === entryPoint)!
        const args = exposure === 'codemode'
          ? { code: 'text(await tools.mcp__fixture__hello({}));' }
          : {}
        // Issue the parent call without a model request so nested MCP calls can
        // traverse the real session tool pipeline.
        agent.agent.state.messages.push({
          role: 'assistant',
          content: [{ type: 'toolCall', id: 'fixture-call', name: entryPoint, arguments: args }],
          api: 'openai-completions',
          provider: 'fixture',
          model: 'fixture',
          usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
          stopReason: 'toolUse',
          timestamp: Date.now(),
        })
        const result = await callable.execute('fixture-call', args)
        assert.ok(!result.isError, JSON.stringify(result.content))
        assert.match(JSON.stringify(result.content), /Hello from MCP/)
      }

      const pid = Number(await readFile(pidPath, 'utf8'))
      await disposeConversationSession(agent)
      session = undefined
      await waitFor(() => {
        try {
          process.kill(pid, 0)
          return false
        }
        catch (error) {
          return (error as NodeJS.ErrnoException).code === 'ESRCH'
        }
      })
    }
    finally {
      if (session)
        await disposeConversationSession(session)
      if (previousAgentDir === undefined)
        delete process.env.PI_CODING_AGENT_DIR
      else
        process.env.PI_CODING_AGENT_DIR = previousAgentDir
      await rm(directory, { recursive: true, force: true })
    }
  })
}

test('web resource loading honors disabled built-in extensions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pi-web-extensions-'))
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR
  process.env.PI_CODING_AGENT_DIR = directory
  try {
    await writeFile(join(directory, 'settings.json'), JSON.stringify({
      extensions: ['-builtin:mcp', '-builtin:codemode', '-builtin:tool-search'],
    }))
    const resourceLoader = await createConversationResourceLoader(directory)
    assert.deepEqual(resourceLoader.getExtensions().errors, [])
    assert.deepEqual(resourceLoader.getExtensions().extensions, [])
  }
  finally {
    if (previousAgentDir === undefined)
      delete process.env.PI_CODING_AGENT_DIR
    else
      process.env.PI_CODING_AGENT_DIR = previousAgentDir
    await rm(directory, { recursive: true, force: true })
  }
})
