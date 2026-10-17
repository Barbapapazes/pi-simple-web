<script setup lang="ts">
import { createToolResultGrouper } from '@pi-simple-web/shared/conversations/utils/conversation'
import { truncateTitle } from '@pi-simple-web/shared/utils/title'
import { useSession } from '#sessions/app/composables/useSession'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { state: conversation } = useConversation()
const isResponding = computed(() => conversation.value.id === id.value && conversation.value.busy)
const liveBranch = computed(() => conversation.value.id === id.value ? conversation.value.branch : null)
const { data: session, error, isPending, isLoading, refetch } = useSession(id)
useSessionUpdates(id, session, refetch)
const title = computed(() => truncateTitle(session.value?.name || session.value?.firstMessage || 'Conversation'))
const status = computed(() => liveBranch.value && conversation.value.status ? conversation.value.status : session.value?.status)
watch(session, () => {
  if (!isResponding.value && conversation.value.id === id.value)
    conversation.value.branch = null
})
const groupToolResults = createToolResultGrouper()
const visibleEntries = computed(() => groupToolResults(liveBranch.value ?? session.value?.branch ?? []).filter(entry =>
  (entry.type === 'message' && entry.role !== 'system')
  || ['compaction', 'branch_summary', 'custom_message'].includes(entry.type),
))
const limit = ref(60)
const renderedEntries = computed(() => visibleEntries.value.slice(-limit.value))
const olderCount = computed(() => Math.max(0, visibleEntries.value.length - limit.value))
const { viewport, content, followTail, onScroll, jumpToLatest, preserveOnPrepend } = useConversationScroll(renderedEntries)
let loadingOlder = false
async function loadOlder() {
  if (loadingOlder || !olderCount.value)
    return
  loadingOlder = true
  try {
    await preserveOnPrepend(() => {
      limit.value += 60
    })
  }
  finally {
    loadingOlder = false
  }
}
function handleScroll() {
  onScroll()
  if (!followTail.value && (viewport.value?.scrollTop ?? Infinity) < 150)
    void loadOlder()
}
watch(visibleEntries, (entries, previous) => {
  // Don't evict the message being read when live messages arrive at the tail.
  if (!followTail.value && previous && entries.length > previous.length)
    limit.value += entries.length - previous.length
})
watch(id, () => {
  limit.value = 60
  followTail.value = true
})
useHead({ title: () => `${session.value?.name || 'Session'} · Autobots` })
</script>

<template>
  <UDashboardPanel id="session-conversation" class="min-h-0" :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden' }">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ left: 'min-w-0 flex-1', title: 'truncate text-sm font-semibold', right: 'gap-1 sm:gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="isLoading" aria-label="Refresh conversation" @click="refetch()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div ref="viewport" class="min-h-0 flex-1 overflow-y-auto" @scroll="handleScroll">
        <div ref="content" class="pi-conversation mx-auto w-full max-w-5xl px-3 py-6 sm:px-6">
          <UAlert v-if="error && !liveBranch" color="error" title="Unable to load this session" description="It may have been removed, or the server cannot read it." class="mb-6" />
          <div v-if="isPending && !error && !liveBranch" class="space-y-8" role="status" aria-label="Loading conversation">
            <USkeleton class="ms-auto h-24 w-3/4 rounded-xl" />
            <USkeleton class="h-40 w-full rounded-xl" />
            <USkeleton class="ms-auto h-24 w-3/4 rounded-xl" />
          </div>
          <template v-else-if="session || liveBranch">
            <p v-if="session" class="mb-8 text-center text-xs text-dimmed">
              {{ new Date(session.created).toLocaleDateString() }}
            </p>
            <div v-if="olderCount" class="mb-6 text-center">
              <UButton color="neutral" variant="ghost" size="sm" @click="loadOlder">
                Load older messages ({{ olderCount }})
              </UButton>
            </div>
            <div v-if="renderedEntries.length" class="space-y-5">
              <ConversationEntry v-for="entry in renderedEntries" :key="entry.id" :entry="entry" :busy="isResponding" />
            </div>
            <p v-else class="text-center text-sm text-muted">
              Send a message to begin.
            </p>
          </template>
        </div>
      </div>
    </template>

    <template #footer>
      <div class="pi-conversation relative mx-auto w-full max-w-5xl shrink-0 px-3 pb-4 sm:px-6">
        <div v-if="!followTail" class="absolute inset-x-0 bottom-full z-10 mb-2 flex justify-center pointer-events-none">
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-arrow-down" label="Jump to latest" class="pointer-events-auto" @click="jumpToLatest" />
        </div>
        <p v-if="isResponding && !conversation.connected" class="px-3 pb-2 text-xs text-muted" role="status">
          Reconnecting to the live response…
        </p>
        <ConversationComposer :key="id" :session-id="id" :disabled="!session && !liveBranch" />
        <ConversationStatus v-if="status" :status="status" :model="session?.model" :thinking-level="session?.thinkingLevel" />
      </div>
    </template>
  </UDashboardPanel>
</template>
