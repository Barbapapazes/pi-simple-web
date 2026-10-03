import type { SessionDetail } from '#sessions/shared/types/sessions'
import { defineQueryOptions } from '@pinia/colada'

export const sessionQueryOptions = defineQueryOptions((id: string) => ({
  key: ['sessions', id],
  query: () => $fetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
}))
