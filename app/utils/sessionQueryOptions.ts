import { defineQueryOptions } from '@pinia/colada'
import type { SessionDetail } from '#shared/types/sessions'

export const sessionQueryOptions = defineQueryOptions((id: string) => ({
  key: ['sessions', id],
  query: () => $fetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
}))
