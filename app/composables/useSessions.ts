import type { SessionSummary } from '../../shared/types/sessions'

export function useSessions() {
  const search = useState('session-search', () => '')
  const workspace = useState('session-workspace', () => '')
  const query = useQuery({
    key: ['sessions'],
    query: () => $fetch<SessionSummary[]>('/api/sessions'),
  })
  const workspaces = computed(() => [...new Set(query.data.value?.map(session => session.cwd) || [])].sort())
  const workspaceOptions = computed(() => [
    { label: 'All workspaces', value: '' },
    ...workspaces.value.filter(Boolean).map(cwd => ({ label: cwd, value: cwd })),
  ])
  const filteredSessions = computed(() => {
    const term = search.value.trim().toLowerCase()
    return (query.data.value || []).filter(session =>
      (!workspace.value || session.cwd === workspace.value)
      && (!term || [session.name, session.firstMessage, session.cwd, session.id].some(value => value?.toLowerCase().includes(term))),
    )
  })
  return { ...query, search, workspace, workspaces, workspaceOptions, filteredSessions }
}
