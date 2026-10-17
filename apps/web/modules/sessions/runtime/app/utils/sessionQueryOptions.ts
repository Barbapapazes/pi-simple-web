import type { SessionDetail } from '@pi-simple-web/shared/sessions/types/sessions'
import { defineQueryOptions } from '@pinia/colada'

const etags = new Map<string, string>()

export const sessionQueryOptions = defineQueryOptions((id: string) => {
  const apiBase = useRuntimeConfig().public.apiBase
  const cache = useQueryCache()
  const etagKey = `${apiBase}/${id}`
  return {
    key: ['sessions', id],
    query: async ({ signal }) => {
      const cached = cache.getQueryData<SessionDetail>(['sessions', id])
      const etag = cached && etags.get(etagKey)
      const response = await $fetch.raw<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, {
        baseURL: apiBase,
        signal,
        headers: etag ? { 'If-None-Match': etag } : undefined,
      })
      if (response.status === 304 && cached)
        return cached
      const nextEtag = response.headers.get('etag')
      if (nextEtag) {
        etags.delete(etagKey)
        etags.set(etagKey, nextEtag)
        if (etags.size > 32)
          etags.delete(etags.keys().next().value!)
      }
      return response._data!
    },
    refetchOnWindowFocus: false,
  }
})
