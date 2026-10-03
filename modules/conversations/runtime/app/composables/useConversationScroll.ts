import type { Ref } from 'vue'

export function useConversationScroll(entries: Ref<unknown[]>) {
  const viewport = ref<HTMLElement>()
  const content = ref<HTMLElement>()
  const followTail = ref(true)
  let observer: ResizeObserver | undefined

  function onScroll() {
    const element = viewport.value
    if (element) followTail.value = element.scrollHeight - element.clientHeight - element.scrollTop < 64
  }
  function scrollToLatest() {
    const element = viewport.value
    if (element) element.scrollTop = element.scrollHeight
  }
  function jumpToLatest() {
    followTail.value = true
    scrollToLatest()
  }
  onMounted(() => {
    observer = new ResizeObserver(() => { if (followTail.value) scrollToLatest() })
    if (content.value) observer.observe(content.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(entries, async () => {
    await nextTick()
    if (followTail.value) scrollToLatest()
  })
  return { viewport, content, followTail, onScroll, jumpToLatest }
}
