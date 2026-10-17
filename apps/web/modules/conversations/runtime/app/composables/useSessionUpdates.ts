import type { SessionDetail, SessionStatus } from '@pi-simple-web/shared/sessions/types/sessions'
import type { Ref } from 'vue'

// Prefer a resumable observer. Idle/external sessions need only a file-version
// check, backing off to once a minute and doing no work in hidden tabs.
export function useSessionUpdates(id: Ref<string>, session: Ref<SessionDetail | undefined>, refetch: () => Promise<unknown>) {
  const { state, connect, disconnect } = useConversation()
  const cache = useQueryCache()
  const apiBase = useRuntimeConfig().public.apiBase
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let generation = 0
  let interval = 15_000
  let mounted = false

  async function check(token: number, currentId: string) {
    if (!mounted || document.hidden || token !== generation)
      return
    try {
      await connect(currentId)
      if (token !== generation || document.hidden || (state.value.id === currentId && state.value.busy))
        return
      if (!session.value)
        return
      controller = new AbortController()
      const latest = await $fetch<{ version: string, environment: Pick<SessionStatus, 'workspace' | 'gitBranch' | 'autoCompaction'> }>(`/api/sessions/${encodeURIComponent(currentId)}/version`, {
        baseURL: apiBase,
        credentials: 'include',
        signal: controller.signal,
      })
      if (token !== generation)
        return
      if (latest.version !== session.value?.version) {
        interval = 15_000
        await refetch()
      }
      else {
        interval = Math.min(60_000, interval * 2)
        const current = session.value
        if (current && Object.entries(latest.environment).some(([key, value]) => current.status[key as keyof SessionStatus] !== value)) {
          cache.setQueryData(['sessions', currentId], { ...current, status: { ...current.status, ...latest.environment } })
        }
      }
    }
    catch {
      interval = Math.min(60_000, interval * 2)
      // A transient version-check failure shouldn't hide already loaded history.
    }
    finally {
      if (mounted && !document.hidden && token === generation)
        timer = setTimeout(() => void check(token, currentId), interval)
    }
  }
  function stop(currentId = id.value) {
    generation++
    clearTimeout(timer)
    controller?.abort()
    disconnect(currentId)
  }
  function restart() {
    stop()
    if (!document.hidden) {
      interval = 15_000
      void check(generation, id.value)
    }
  }
  watch(id, (_value, previous) => {
    if (mounted) {
      stop(previous)
      restart()
    }
  })
  onMounted(() => {
    mounted = true
    document.addEventListener('visibilitychange', restart)
    window.addEventListener('online', restart)
    restart()
  })
  onBeforeUnmount(() => {
    mounted = false
    stop()
    document.removeEventListener('visibilitychange', restart)
    window.removeEventListener('online', restart)
  })
}
