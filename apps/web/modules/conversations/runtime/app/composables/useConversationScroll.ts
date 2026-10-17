import type { Ref } from 'vue'

export function useConversationScroll(entries: Ref<unknown[]>) {
  const viewport = ref<HTMLElement>()
  const content = ref<HTMLElement>()
  const followTail = ref(true)
  let observer: ResizeObserver | undefined
  let preserving = false
  async function preserveOnPrepend(update: () => void) {
    const element = viewport.value
    if (!element)
      return
    preserving = true
    followTail.value = false
    const height = element.scrollHeight
    const top = element.scrollTop
    update()
    await nextTick()
    element.scrollTop = top + element.scrollHeight - height
    preserving = false
  }

  function onScroll() {
    const element = viewport.value
    if (element)
      followTail.value = element.scrollHeight - element.clientHeight - element.scrollTop < 64
  }
  function scrollToLatest() {
    const element = viewport.value
    if (element)
      element.scrollTop = element.scrollHeight
  }
  function jumpToLatest() {
    followTail.value = true
    scrollToLatest()
  }
  onMounted(() => {
    observer = new ResizeObserver(() => {
      if (followTail.value && !preserving)
        scrollToLatest()
    })
    if (content.value)
      observer.observe(content.value)
  })
  onBeforeUnmount(() => observer?.disconnect())
  watch(entries, async () => {
    await nextTick()
    if (followTail.value && !preserving)
      scrollToLatest()
  })
  return { viewport, content, followTail, onScroll, jumpToLatest, preserveOnPrepend }
}
