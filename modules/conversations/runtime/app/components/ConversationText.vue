<script setup lang="ts">
import { previewLines } from '#conversations/shared/utils/conversation'

const props = withDefaults(defineProps<{
  text: string
  preformatted?: boolean
  markdown?: boolean
  preview?: number
  tail?: boolean
  contentClass?: string
}>(), { preformatted: false, markdown: true, contentClass: 'text-sm leading-7' })
const expanded = ref(false)
const preview = computed(() => previewLines(props.text, props.preview || Number.MAX_SAFE_INTEGER, props.tail))
const displayed = computed(() => expanded.value || !props.preview ? props.text : preview.value.text)
</script>

<template>
  <div :class="contentClass">
    <button v-if="preview.hidden && tail && !expanded" type="button" class="pi-expand mb-2" :aria-expanded="false" @click="expanded = true">
      … ({{ preview.hidden }} earlier lines, click to expand)
    </button>
    <MessageMarkdown v-if="markdown && !preformatted" :text="displayed" />
    <pre v-else-if="preformatted" class="overflow-x-auto whitespace-pre-wrap break-words">{{ displayed }}</pre>
    <p v-else class="whitespace-pre-wrap break-words">
      {{ displayed }}
    </p>
    <button v-if="preview.hidden && (!tail || expanded)" type="button" class="pi-expand mt-2" :aria-expanded="expanded" @click="expanded = !expanded">
      {{ expanded ? 'Collapse output' : `… (${preview.hidden} more lines, click to expand)` }}
    </button>
  </div>
</template>
