<script setup lang="ts">
import type { ConversationBlock } from '#shared/types/conversation'

const props = defineProps<{ block: ConversationBlock, busy?: boolean }>()
const expanded = ref(false)
const args = computed(() => props.block.arguments || {})
const name = computed(() => props.block.name || 'tool')
const isShell = computed(() => ['bash', 'powershell'].includes(name.value))
const isFile = computed(() => ['read', 'edit', 'write'].includes(name.value))
const path = computed(() => String(args.value.path || args.value.file_path || (name.value === 'read' ? props.block.text : '') || '…'))
const range = computed(() => {
  if (name.value !== 'read' || (args.value.offset == null && args.value.limit == null)) return ''
  const start = Number(args.value.offset ?? 1)
  return `:${start}${args.value.limit != null ? `-${start + Number(args.value.limit) - 1}` : ''}`
})
const command = computed(() => String(args.value.command || props.block.text || '…'))
const state = computed(() => props.block.result ? (props.block.result.isError ? 'error' : 'success') : props.busy ? 'pending' : 'unknown')
const hideRead = computed(() => name.value === 'read' && !props.block.result?.isError && !expanded.value)
const diffLines = computed(() => props.block.result?.diff?.split('\n') || [])
</script>

<template>
  <section class="pi-tool" :class="`pi-tool-${state}`" :aria-label="`${name} tool ${state}`">
    <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
      <strong v-if="isShell" class="min-w-0 whitespace-pre-wrap break-words">{{ name === 'bash' ? '$' : 'PS>' }} {{ command }}</strong>
      <template v-else>
        <strong>{{ name }}</strong>
        <span v-if="isFile" class="pi-path break-all">{{ path }}<span class="pi-range">{{ range }}</span></span>
      </template>
      <span v-if="isShell && args.timeout" class="pi-tool-muted">(timeout {{ args.timeout }}s)</span>
      <span v-if="state === 'pending'" class="pi-tool-muted" role="status">running…</span>
      <span v-else-if="state === 'error'" class="pi-tool-error-label">failed</span>
      <button v-if="name === 'read' && block.result" type="button" class="pi-expand" :aria-expanded="expanded" @click="expanded = !expanded">
        ({{ expanded ? 'click to collapse' : 'click to expand' }})
      </button>
    </div>
    <ConversationText v-if="!isFile && !isShell" :text="block.text || ''" preformatted :preview="10" class="mt-3 pi-tool-muted" />
    <ConversationText v-if="name === 'write' && typeof args.content === 'string'" :text="args.content" preformatted :preview="10" class="mt-3 pi-tool-muted" />
    <div v-if="diffLines.length && !block.result?.isError" class="mt-3 overflow-x-auto" aria-label="Edit diff">
      <pre v-for="(line, index) in diffLines" :key="index" :class="/^\+/.test(line) ? 'pi-diff-added' : /^-/.test(line) ? 'pi-diff-removed' : 'pi-tool-muted'">{{ line || ' ' }}</pre>
    </div>
    <div v-else-if="block.result && !hideRead" class="mt-3 space-y-3 pi-tool-muted">
      <template v-for="(result, index) in block.result.blocks" :key="index">
        <img v-if="result.type === 'image'" :src="result.src" alt="Tool attachment" loading="lazy" class="max-h-96 max-w-full object-contain">
        <ConversationText v-else :text="result.text || ''" preformatted :preview="name === 'read' && expanded ? undefined : isShell ? 5 : 10" :tail="isShell" />
      </template>
    </div>
  </section>
</template>
