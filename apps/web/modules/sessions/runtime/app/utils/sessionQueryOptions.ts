import type { SessionDetail } from '@pi-simple-web/shared/sessions/types/sessions'
import { defineQueryOptions } from '@pinia/colada'

export const sessionQueryOptions = defineQueryOptions((id: string) => ({
  key: ['sessions', id],
  query: () => $fetch<SessionDetail>(`/api/sessions/${encodeURIComponent(id)}`),
}))
