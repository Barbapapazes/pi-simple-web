import { sessionFile } from '../../../services/sessions'
import { statusEnvironment } from '../../../services/status'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[\w-]{1,128}$/.test(id))
    throw createError({ statusCode: 400, statusMessage: 'Invalid session ID' })
  const file = await sessionFile(id, useRuntimeConfig(event).piSessionDir || undefined)
  if (!file)
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  setResponseHeader(event, 'Cache-Control', 'no-store')
  return { version: file.version, environment: await statusEnvironment(file.info.cwd) }
})
