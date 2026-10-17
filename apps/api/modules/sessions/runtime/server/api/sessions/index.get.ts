import { listSessionPage } from '../../services/sessions'

export default defineEventHandler(async (event) => {
  const { piSessionDir } = useRuntimeConfig(event)
  const query = getQuery(event)
  const offset = query.offset === undefined ? 0 : Number(query.offset)
  const limit = query.limit === undefined ? 30 : Number(query.limit)
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(limit) || limit < 1 || limit > 100
    || (query.search !== undefined && typeof query.search !== 'string')
    || (query.workspace !== undefined && typeof query.workspace !== 'string')) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid pagination or filters' })
  }
  return listSessionPage({ offset, limit, search: query.search as string || '', workspace: query.workspace as string || '' }, piSessionDir || undefined)
})
