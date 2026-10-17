import type { SessionDetail } from '@pi-simple-web/shared/sessions/types/sessions'
import { defineQueryOptions } from '@pinia/colada'

export const sessionQueryOptions = defineQueryOptions((id: string) => {
  const apiBase = useRuntimeConfig().public.apiBase
  return {
    key: ['sessions', id],
    query: () => $fetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`, { baseURL: apiBase }),
  }
})
