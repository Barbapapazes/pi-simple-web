import type { SessionPage } from '@pi-simple-web/shared/sessions/types/sessions'
import { useInfiniteQuery } from '@pinia/colada'

export function useSessions() {
  const search = useState('session-search', () => '')
  const workspace = useState('session-workspace', () => '')
  const apiBase = useRuntimeConfig().public.apiBase
  const query = useInfiniteQuery<SessionPage, Error, number>(() => {
    // Capture filters with the key so an in-flight page cannot use newer filters.
    const term = search.value.trim()
    const cwd = workspace.value
    return {
      key: ['sessions', 'list', term, cwd],
      initialPageParam: 0,
      query: ({ pageParam, signal }) => $fetch<SessionPage>('/api/sessions', {
        baseURL: apiBase,
        signal,
        query: { offset: pageParam, limit: 30, search: term, workspace: cwd },
      }),
      getNextPageParam: page => page.nextOffset,
    }
  })
  const data = computed(() => {
    // Sessions can move between offset pages when updated externally.
    const unique = new Map(query.data.value?.pages.flatMap(page => page.items).map(session => [session.id, session]))
    return [...unique.values()]
  })
  const total = computed(() => query.data.value?.pages[0]?.total || 0)
  const workspaces = computed(() => query.data.value?.pages[0]?.workspaces || [])
  const workspaceOptions = computed(() => [
    { label: 'All workspaces', value: '' },
    ...workspaces.value.filter(Boolean).map(cwd => ({ label: cwd, value: cwd })),
  ])
  return { ...query, data, total, search, workspace, workspaces, workspaceOptions, filteredSessions: data }
}
