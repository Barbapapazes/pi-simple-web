<script setup lang="ts">
import type { StreamingBehavior } from '#conversations/shared/types/conversation'
import { messageShortcut } from '#conversations/shared/utils/conversation-input'

const props = defineProps<{ sessionId?: string, cwd?: string, disabled?: boolean }>()
const draft = ref('')
const queuing = ref(false)
const windows = ref(false)
onMounted(() => { windows.value = /Win/i.test(navigator.platform) })
const { state, send, queue } = useConversation()
const sameSession = computed(() => state.value.id === (props.sessionId || ''))
const responding = computed(() => sameSession.value && state.value.busy && !!props.sessionId)
const blocked = computed(() => props.disabled || queuing.value || state.value.busy && !responding.value)
const error = computed(() => sameSession.value ? state.value.error : '')
const pending = computed(() => sameSession.value ? state.value.queue : { steering: [], followUp: [] })

async function submit(behavior: StreamingBehavior = 'steer') {
  const message = draft.value.trim()
  if (!message || blocked.value) return
  draft.value = ''
  let accepted = false
  if (responding.value) {
    queuing.value = true
    try {
      accepted = await queue(message, props.sessionId!, behavior)
    } finally {
      queuing.value = false
    }
  } else {
    accepted = await send(message, props.sessionId, props.cwd?.trim() || undefined)
  }
  if (!accepted) draft.value = draft.value ? `${message}\n${draft.value}` : message
}

function onKeydown(event: KeyboardEvent) {
  if (!(event.target instanceof HTMLTextAreaElement)) return
  const behavior = messageShortcut(event, windows.value)
  if (!behavior) return
  event.preventDefault()
  event.stopPropagation()
  if (!event.repeat) void submit(behavior)
}
</script>

<template>
  <div class="w-full space-y-3" @keydown.capture="onKeydown">
    <UAlert v-if="error" color="error" title="Unable to complete your message" :description="error" />
    <div v-if="pending.steering.length || pending.followUp.length" class="space-y-1 px-3 text-xs text-muted" role="status" aria-live="polite">
      <p v-for="(message, index) in pending.steering" :key="`steer-${index}`" class="whitespace-pre-wrap break-words"><span class="font-semibold text-default">Steering:</span> {{ message }}</p>
      <p v-for="(message, index) in pending.followUp" :key="`follow-${index}`" class="whitespace-pre-wrap break-words"><span class="font-semibold text-default">Follow-up:</span> {{ message }}</p>
    </div>
    <UChatPrompt v-model="draft" :placeholder="responding ? 'Steer Pi or queue a follow-up…' : 'Ask Pi anything…'" :disabled="blocked" :rows="2" :maxrows="10" variant="naked" class="rounded-none border-y border-violet-400/60 px-3 py-2" :ui="{ base: 'font-mono text-sm', footer: 'pt-1' }" autofocus aria-label="Message Pi" @submit="submit()">
      <template #footer>
        <span class="px-1 text-xs text-dimmed">Enter to {{ responding ? 'steer' : 'send' }} · {{ windows ? 'Ctrl + Q' : 'Alt + Enter' }} for follow-up · Shift + Enter for a new line</span>
        <div class="flex items-center gap-1">
          <UTooltip v-if="responding" text="Queue follow-up">
            <UButton type="button" icon="i-lucide-list-plus" :disabled="!draft.trim() || blocked" aria-label="Queue follow-up" color="neutral" variant="ghost" class="rounded-none" @click="submit('followUp')" />
          </UTooltip>
          <UButton type="submit" icon="i-lucide-arrow-up" :loading="queuing" :disabled="!draft.trim() || blocked" :aria-label="responding ? 'Steer response' : 'Send message'" color="neutral" variant="ghost" class="rounded-none" />
        </div>
      </template>
    </UChatPrompt>
  </div>
</template>
