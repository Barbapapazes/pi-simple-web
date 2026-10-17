import { readSessionMetrics } from '../../services/sessions'

// Nitro hashes the arguments, keeping aggregates isolated by session directory.
const cachedMetrics = defineCachedFunction(readSessionMetrics, {
  name: 'session-metrics',
  maxAge: 30,
  swr: false,
})

export default defineEventHandler(async (event) => {
  const { piSessionDir } = useRuntimeConfig(event)
  return cachedMetrics(piSessionDir || undefined)
})
