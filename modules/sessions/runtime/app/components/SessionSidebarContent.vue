<script setup lang="ts">
defineProps<{ collapsed: boolean }>()

const route = useRoute()
const queryCache = useQueryCache()
function preloadSession(id: string) {
  // Refresh only stale entries and reuse any request already in flight.
  void queryCache.refresh(queryCache.ensure(sessionQueryOptions(id))).catch(() => {
    // Prefetch failures should not interrupt navigation; the page handles errors.
  })
}
const { data: sessions, filteredSessions, search, error, isPending, isLoading, refetch } = useSessions()
const groups = computed(() => {
  const named = filteredSessions.value.filter(session => session.name)
  const other = filteredSessions.value.filter(session => !session.name)
  return [
    { label: 'Named sessions', sessions: named },
    { label: 'Conversations', sessions: other },
  ].filter(group => group.sessions.length)
})
</script>

<template>
  <UButton to="/new" color="primary" class="shrink-0" icon="i-lucide-plus" :label="collapsed ? undefined : 'New conversation'" :block="!collapsed" :square="collapsed" aria-label="New conversation" />
  <UNavigationMenu
    :items="[{ label: 'All sessions', icon: 'i-lucide-layout-dashboard', to: '/', exact: true }]"
    :collapsed="collapsed"
    orientation="vertical"
    class="shrink-0"
  />
  <template v-if="!collapsed">
    <div class="flex shrink-0 flex-col gap-2">
      <UInput v-model="search" icon="i-lucide-search" placeholder="Search sessions…" aria-label="Search sessions" class="w-full" />
      <WorkspaceDropdown />
    </div>
    <div class="flex shrink-0 items-center justify-between px-2">
      <span class="text-xs font-medium text-muted">SESSION HISTORY</span>
      <UButton icon="i-lucide-refresh-cw" size="xs" color="neutral" variant="ghost" :loading="isLoading" aria-label="Refresh session history" @click="refetch()" />
    </div>
    <p v-if="error" class="px-2 text-xs text-error" role="alert">
      Unable to load sessions. Try refreshing.
    </p>
    <p v-else-if="isPending" class="px-2 text-xs text-muted" role="status">
      Loading sessions…
    </p>
    <nav v-else aria-label="Session history" class="min-h-0 flex-1 space-y-6 overflow-y-auto">
      <div v-for="group in groups" :key="group.label">
        <h2 v-if="group.label !== 'Conversations'" class="mb-2 px-2 text-xs font-medium text-muted">
          {{ group.label }}
        </h2>
        <div class="space-y-0.5">
          <SessionPreviewPopover
            v-for="session in group.sessions"
            :key="session.id"
            v-slot="{ close }"
            :session="session"
          >
            <NuxtLink
              :to="`/sessions/${session.id}`"
              :aria-current="route.params.id === session.id ? 'page' : undefined"
              class="group flex min-w-0 items-center gap-2 rounded-md px-2 py-2 text-sm transition focus-visible:outline-2 focus-visible:outline-primary"
              :class="route.params.id === session.id ? 'bg-primary/10 text-primary' : 'text-toned hover:bg-elevated hover:text-highlighted'"
              @click="close"
              @mouseenter="preloadSession(session.id)"
              @focus="preloadSession(session.id)"
            >
              <UIcon name="i-lucide-message-square" class="size-4 shrink-0 opacity-60" />
              <span class="truncate">{{ session.name || session.firstMessage || 'Untitled session' }}</span>
            </NuxtLink>
          </SessionPreviewPopover>
        </div>
      </div>
      <p v-if="!groups.length" class="px-2 text-xs text-muted">
        {{ sessions?.length ? 'No matching sessions.' : 'No sessions yet.' }}
      </p>
    </nav>
  </template>
</template>
