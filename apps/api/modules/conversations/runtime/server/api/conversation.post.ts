import type { AgentSession } from '@earendil-works/pi-coding-agent'
import { createAgentSession, SessionManager } from '@earendil-works/pi-coding-agent'
import { conversationEntry, findSessionInfo, invalidateSessionIndex } from '../../../../sessions/runtime/server/services/sessions'
import { liveStatus, workspaceStatus } from '../../../../sessions/runtime/server/services/status'
import { createConversationResourceLoader, disposeConversationSession } from '../services/agent'
import { createConversationRun, resolveConversationCwd, streamConversation, validateConversationInput } from '../services/conversation'
import { activeRuns, activeSessions, createLiveConversation, liveConversations } from '../services/live-conversations'
import { observeConversation } from '../services/observe-conversation'

export default defineEventHandler(async (event) => {
  if (!getHeader(event, 'content-type')?.startsWith('application/json')) {
    throw createError({ statusCode: 415, statusMessage: 'Expected application/json.' })
  }
  let input
  try {
    input = validateConversationInput(await readBody(event))
  }
  catch (error) {
    throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Invalid message.' })
  }
  if (input.id && activeRuns.has(input.id)) {
    if (!input.streamingBehavior)
      throw createError({ statusCode: 409, statusMessage: 'Choose steering or follow-up for an active response.' })
    try {
      const disposition = await activeRuns.get(input.id)!.submit(input.message, input.streamingBehavior)
      return { disposition }
    }
    catch (error) {
      throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Unable to queue your message.' })
    }
  }
  if (input.streamingBehavior) {
    throw createError({ statusCode: 409, statusMessage: 'This response is no longer active. Send a new message instead.' })
  }
  const sessionDir = useRuntimeConfig(event).piSessionDir || undefined
  const lock = input.id || crypto.randomUUID()
  if (activeSessions.has(lock))
    throw createError({ statusCode: 409, statusMessage: 'This session is already responding.' })
  activeSessions.add(lock)
  let session: AgentSession | undefined
  try {
    const info = input.id ? await findSessionInfo(input.id, sessionDir) : undefined
    if (input.id && !info)
      throw createError({ statusCode: 404, statusMessage: 'Session not found.' })
    let cwd: string
    try {
      cwd = await resolveConversationCwd(info?.cwd || input.cwd)
    }
    catch (error) {
      throw createError({ statusCode: 400, statusMessage: error instanceof Error ? error.message : 'Invalid workspace.' })
    }
    const sessionManager = info
      ? SessionManager.open(info.path, sessionDir)
      : sessionDir ? SessionManager.create(cwd, sessionDir) : undefined
    const resourceLoader = await createConversationResourceLoader(cwd)
    ;({ session } = await createAgentSession({ cwd, sessionManager, resourceLoader }))
    await session.bindExtensions({})
  }
  catch (error) {
    try {
      if (session)
        await disposeConversationSession(session)
    }
    finally {
      activeSessions.delete(lock)
    }
    throw error
  }

  const agent = session
  const run = createConversationRun(agent)
  // Also lock newly created sessions by their real ID so reopening the tab
  // cannot start a second run while the original continues in the background.
  activeSessions.add(agent.sessionId)
  const live = createLiveConversation(agent.sessionId, agent.sessionManager.getCwd(), agent.sessionManager.getBranch().map(conversationEntry))
  liveConversations.set(agent.sessionId, live)
  activeRuns.set(agent.sessionId, run)
  invalidateSessionIndex(sessionDir)
  const emit = live.publish
  // Attach before starting; losing this observer never cancels the owned agent.
  const response = observeConversation(event, live)
  void (async () => {
    try {
      const workspace = await workspaceStatus(agent.sessionManager.getCwd())
      const getStatus = () => liveStatus(agent, workspace)
      emit({ type: 'status', status: getStatus() })
      await streamConversation(agent, input.message, emit, getStatus, run.finish)
    }
    catch (error) {
      console.error('Background conversation failed:', error)
      emit({ type: 'error', message: error instanceof Error ? error.message : 'Pi could not complete this message.' })
      emit({ type: 'done', branch: agent.sessionManager.getBranch().map(conversationEntry) })
    }
    finally {
      activeRuns.delete(agent.sessionId)
      liveConversations.delete(agent.sessionId)
      invalidateSessionIndex(sessionDir)
      try {
        await disposeConversationSession(agent)
      }
      finally {
        activeSessions.delete(lock)
        activeSessions.delete(agent.sessionId)
      }
    }
  })().catch((error) => { console.error('Background conversation cleanup failed:', error) })
  return response
})
