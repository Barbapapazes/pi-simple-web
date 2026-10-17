<script setup lang="ts">
defineProps<{ label: string }>()
const open = ref(false)
function toggle(event: Event) {
  open.value = (event.target as HTMLDetailsElement).open
}
</script>

<template>
  <details @toggle="toggle">
    <summary class="cursor-pointer text-sm">
      {{ label }}
    </summary>
    <div v-if="open" class="mt-3">
      <slot />
    </div>
  </details>
</template>
