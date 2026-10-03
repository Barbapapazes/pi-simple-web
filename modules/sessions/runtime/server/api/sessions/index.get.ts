import { listSessionSummaries } from '../../services/sessions'

export default defineEventHandler(async (event) => {
  const { piSessionDir } = useRuntimeConfig(event)
  return listSessionSummaries(piSessionDir || undefined)
})
