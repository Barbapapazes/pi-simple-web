import { createHash } from 'node:crypto'
import { readSession } from '../../services/sessions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{1,128}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session ID' })
  }
  const { piSessionDir } = useRuntimeConfig(event)
  const session = await readSession(id, piSessionDir || undefined)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }
  const etag = `"${createHash('sha256').update(`${session.version}:${JSON.stringify(session.status)}`).digest('hex')}"`
  setResponseHeader(event, 'Cache-Control', 'private, no-cache')
  setResponseHeader(event, 'ETag', etag)
  if (getHeader(event, 'if-none-match') === etag) {
    setResponseStatus(event, 304)
    return null
  }
  return session
})
