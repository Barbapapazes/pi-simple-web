import type { SessionMetrics } from '@pi-simple-web/shared/sessions/types/sessions'

export function useSessionMetrics() {
  const apiBase = useRuntimeConfig().public.apiBase
  return useQuery({
    key: ['sessions', 'metrics'],
    query: () => $fetch<SessionMetrics>('/api/sessions/metrics', { baseURL: apiBase }),
    staleTime: 30_000,
  })
}
