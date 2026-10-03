<script setup lang="ts">
import type { ConversationEntry } from '#shared/types/conversation'

const props = defineProps<{ entry: ConversationEntry, busy?: boolean }>()
const isUser = computed(() => props.entry.role === 'user')
const isAssistant = computed(() => props.entry.role === 'assistant')
const isTool = computed(() => props.entry.role.startsWith('tool:') || props.entry.role === 'bashExecution')
const label = computed(() => isUser.value ? 'You' : isAssistant.value ? 'Pi' : props.entry.role.replaceAll('_', ' '))
const shellCall = computed(() => props.entry.role === 'bashExecution'
  ? {
      ...props.entry.blocks[0],
      type: 'toolCall' as const,
      name: 'bash',
      result: { blocks: props.entry.blocks.slice(1), isError: props.entry.isError },
    }
  : null)
</script>

<template>
  <article class="pi-entry min-w-0" :aria-label="`${label} message`">
    <ConversationTool v-if="shellCall" :block="shellCall" />
    <div v-else class="space-y-4" :class="isUser ? 'pi-user' : isTool ? `pi-tool pi-tool-${entry.isError ? 'error' : 'success'}` : !isAssistant ? 'pi-custom' : 'pi-assistant'">
      <p v-if="isTool || !isUser && !isAssistant" class="text-xs font-semibold text-muted">
        {{ label }}
      </p>
      <p v-if="entry.isError && !isTool" class="pi-tool-error-label text-xs">
        Error
      </p>
      <template v-for="(block, index) in entry.blocks" :key="block.toolCallId || index">
        <ConversationText v-if="block.type === 'text'" :text="block.text || ''" :markdown="!isTool" :preformatted="isTool" :preview="isTool ? 10 : undefined" />
        <details v-else-if="block.type === 'thinking'" class="pi-thinking">
          <summary class="cursor-pointer text-sm">
            Thinking…
          </summary>
          <ConversationText :text="block.text || ''" class="mt-3" />
        </details>
        <img v-else-if="block.type === 'image'" :src="block.src" alt="Session attachment" loading="lazy" class="max-h-96 max-w-full object-contain">
        <ConversationTool v-else-if="block.type === 'toolCall'" :block="block" :busy="busy" />
        <details v-else class="text-sm">
          <summary class="cursor-pointer text-xs text-muted">
            Entry data
          </summary>
          <ConversationText :text="block.text || ''" preformatted :preview="10" class="mt-3" />
        </details>
      </template>
    </div>
  </article>
</template>
