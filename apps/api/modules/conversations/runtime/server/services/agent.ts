import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { createCodemodeExtension, createMcpExtension, createToolSearchExtension, DefaultResourceLoader, getAgentDir } from '@earendil-works/pi-coding-agent'

export async function createConversationResourceLoader(cwd: string) {
  const resourceLoader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    // SDK sessions do not include the CLI's built-ins. Keep their names and
    // replacement behavior so configured exclusions and third-party overrides work.
    extensionFactories: [
      { name: 'codemode', factory: createCodemodeExtension({ mode: 'on' }), builtin: true, replaceable: true },
      { name: 'tool-search', factory: createToolSearchExtension(), builtin: true, replaceable: true },
      { name: 'mcp', factory: createMcpExtension(), builtin: true, replaceable: true },
    ],
  })
  await resourceLoader.reload()
  return resourceLoader
}

export async function disposeConversationSession(session: AgentSession) {
  try {
    // dispose() alone does not emit session_shutdown. MCP uses this event to
    // close connections and stop any stdio server processes owned by the run.
    await session.extensionRunner.emit({ type: 'session_shutdown', reason: 'quit' })
  }
  finally {
    session.dispose()
  }
}
