<script setup lang="ts">
import type { SessionSummary } from '#shared/types/sessions'

withDefaults(defineProps<{
  session: SessionSummary
  side?: 'right' | 'bottom'
}>(), { side: 'right' })

const route = useRoute()
const open = ref(false)
function close() {
  open.value = false
}
watch(() => route.fullPath, close)
</script>

<template>
  <UPopover
    v-model:open="open"
    mode="hover"
    :open-delay="350"
    :close-delay="150"
    :content="{ side, align: 'start', sideOffset: 12 }"
    :ui="{ content: 'w-88 max-w-[calc(100vw-2rem)] overflow-hidden' }"
  >
    <slot :close="close" />
    <template #content>
      <div class="space-y-3 p-4">
        <div class="space-y-1">
          <p class="text-xs font-medium text-muted">Conversation preview</p>
          <h3 v-if="session.name" class="line-clamp-2 text-sm font-semibold break-words text-highlighted">{{ session.name }}</h3>
        </div>
        <div class="rounded-md bg-muted/50 p-3">
          <p class="mb-1.5 text-xs font-medium text-muted">Opening message</p>
          <p class="line-clamp-8 text-sm leading-relaxed whitespace-pre-wrap break-words text-toned">{{ session.firstMessage || 'No messages yet.' }}</p>
        </div>
        <div class="space-y-1.5 border-t border-default pt-3 text-xs text-muted">
          <p class="line-clamp-2 break-all">{{ session.cwd || 'Unknown workspace' }}</p>
          <div class="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
            <span>{{ session.messageCount }} {{ session.messageCount === 1 ? 'message' : 'messages' }}</span>
            <time :datetime="session.modified">Updated {{ new Date(session.modified).toLocaleDateString() }}</time>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>
