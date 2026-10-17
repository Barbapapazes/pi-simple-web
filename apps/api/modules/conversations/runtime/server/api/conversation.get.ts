import { liveConversations } from '../services/live-conversations'
import { observeConversation } from '../services/observe-conversation'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{1,128}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid session ID' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  const live = liveConversations.get(id)
  if (!live)
    return sendNoContent(event)
  return observeConversation(event, live)
})
