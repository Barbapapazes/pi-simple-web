<script setup lang="ts">
import { groupToolResults } from '#shared/utils/transcript'
import { truncateTitle } from '#shared/utils/title'

const route = useRoute()
const id = computed(() => String(route.params.id))
const { state: chat } = useChat()
const liveBranch = computed(() => chat.value.id === id.value && chat.value.busy ? chat.value.branch : null)
const isResponding = computed(() => chat.value.id === id.value && chat.value.busy)
const transcriptViewport = ref<HTMLElement>()
const transcriptContent = ref<HTMLElement>()
const followTail = ref(true)
let resizeObserver: ResizeObserver | undefined

function onTranscriptScroll() {
  const viewport = transcriptViewport.value
  if (viewport) followTail.value = viewport.scrollHeight - viewport.clientHeight - viewport.scrollTop < 64
}
function scrollToLatest() {
  const viewport = transcriptViewport.value
  if (viewport) viewport.scrollTop = viewport.scrollHeight
}
function jumpToLatest() {
  followTail.value = true
  scrollToLatest()
}
onMounted(() => {
  resizeObserver = new ResizeObserver(() => { if (followTail.value) scrollToLatest() })
  if (transcriptContent.value) resizeObserver.observe(transcriptContent.value)
})
onBeforeUnmount(() => resizeObserver?.disconnect())
const { data: session, error, isPending, isLoading, refetch } = useQuery(() => sessionQueryOptions(id.value))
let refreshInterval: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  refreshInterval = setInterval(() => {
    if (!isLoading.value) void refetch()
  }, 5000)
})
onBeforeUnmount(() => clearInterval(refreshInterval))
const title = computed(() => truncateTitle(session.value?.name || session.value?.firstMessage || 'Conversation'))
const status = computed(() => isResponding.value && chat.value.status ? chat.value.status : session.value?.status)
watch(isResponding, (busy, wasBusy) => { if (wasBusy && !busy) void refetch() })
const visibleEntries = computed(() => groupToolResults(liveBranch.value ?? session.value?.branch ?? []).filter(entry =>
  entry.type === 'message' && entry.role !== 'system'
  || ['compaction', 'branch_summary', 'custom_message'].includes(entry.type),
))
watch(visibleEntries, async () => {
  await nextTick()
  if (followTail.value) scrollToLatest()
})
useHead({ title: () => `${session.value?.name || 'Session'} · Autobots` })
</script>

<template>
  <UDashboardPanel id="session-transcript" class="min-h-0" :ui="{ body: 'p-0 sm:p-0 gap-0 overflow-hidden' }">
    <template #header>
      <UDashboardNavbar :title="title" :ui="{ left: 'min-w-0 flex-1', title: 'truncate text-sm font-semibold', right: 'gap-1 sm:gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="ghost" :loading="isLoading" aria-label="Refresh transcript" @click="refetch()" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div ref="transcriptViewport" class="min-h-0 flex-1 overflow-y-auto" @scroll="onTranscriptScroll">
      <div ref="transcriptContent" class="pi-transcript mx-auto w-full max-w-5xl px-3 py-6 sm:px-6">
        <UAlert v-if="error && !liveBranch" color="error" title="Unable to load this session" description="It may have been removed, or the server cannot read it." class="mb-6" />
        <div v-if="isPending && !error && !liveBranch" class="space-y-8" role="status" aria-label="Loading transcript">
          <USkeleton class="ms-auto h-24 w-3/4 rounded-xl" />
          <USkeleton class="h-40 w-full rounded-xl" />
          <USkeleton class="ms-auto h-24 w-3/4 rounded-xl" />
        </div>
        <template v-else-if="session || liveBranch">
          <p v-if="session" class="mb-8 text-center text-xs text-dimmed">{{ new Date(session.created).toLocaleDateString() }}</p>
          <div v-if="visibleEntries.length" class="space-y-5">
            <TranscriptEntry v-for="entry in visibleEntries" :key="entry.id" :entry="entry" :busy="isResponding" />
          </div>
          <p v-else class="text-center text-sm text-muted">Send a message to begin.</p>
        </template>
      </div>
      </div>
    </template>

    <template #footer>
      <div class="pi-transcript relative mx-auto w-full max-w-5xl shrink-0 px-3 pb-4 sm:px-6">
        <div v-if="!followTail" class="absolute inset-x-0 bottom-full z-10 mb-2 flex justify-center pointer-events-none">
          <UButton size="xs" color="neutral" variant="soft" icon="i-lucide-arrow-down" label="Jump to latest" class="pointer-events-auto" @click="jumpToLatest" />
        </div>
        <ChatComposer :key="id" :session-id="id" :disabled="!session && !liveBranch" />
        <SessionStatus v-if="status" :status="status" :model="session?.model" :thinking-level="session?.thinkingLevel" />
      </div>
    </template>
  </UDashboardPanel>
</template>
