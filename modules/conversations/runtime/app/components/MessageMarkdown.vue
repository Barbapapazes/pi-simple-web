<script setup lang="ts">
import { conversationMarkdownOptions } from '#conversations/shared/utils/markdown'

defineProps<{ text: string }>()
</script>

<template>
  <div class="pi-markdown min-w-0 break-words [&_pre]:max-w-full [&_pre]:overflow-x-auto">
    <Suspense>
      <Markdown :value="text" :options="conversationMarkdownOptions" />
      <template #fallback>
        <p class="whitespace-pre-wrap">
          {{ text }}
        </p>
      </template>
    </Suspense>
  </div>
</template>
