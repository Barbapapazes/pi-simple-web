<script setup lang="ts">
const props = defineProps<{ hasMore: boolean, loading: boolean, failed: boolean }>()
const emit = defineEmits<{ load: [] }>()
const sentinel = ref<HTMLElement>()
let observer: IntersectionObserver | undefined
function observe() {
  observer?.disconnect()
  if (sentinel.value && props.hasMore && !props.loading && !props.failed)
    observer?.observe(sentinel.value)
}
onMounted(() => {
  observer = new IntersectionObserver((entries) => {
    if (entries.some(entry => entry.isIntersecting) && props.hasMore && !props.loading && !props.failed)
      emit('load')
  }, { rootMargin: '150px' })
  observe()
})
watch(() => [props.hasMore, props.loading, props.failed], observe, { flush: 'post' })
onBeforeUnmount(() => observer?.disconnect())
</script>

<template>
  <div ref="sentinel" class="flex min-h-12 items-center justify-center p-2" role="status">
    <span v-if="loading" class="text-xs text-muted">Loading sessions…</span>
    <UButton v-else-if="hasMore" color="neutral" variant="ghost" size="xs" @click="emit('load')">
      {{ failed ? 'Retry loading more' : 'Load more sessions' }}
    </UButton>
  </div>
</template>
