import { readSession } from '../../utils/sessions'

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id || !/^[A-Za-z0-9_-]{1,128}$/.test(id)) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid session ID' })
  }
  const { piSessionDir } = useRuntimeConfig(event)
  const session = await readSession(id, piSessionDir || undefined)
  if (!session) {
    throw createError({ statusCode: 404, statusMessage: 'Session not found' })
  }
  return session
})
