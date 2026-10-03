<script setup lang="ts">
defineProps<{ collapsed: boolean }>()
</script>

<template>
  <NuxtLink to="/" class="flex min-w-0 items-center gap-2.5 rounded-md focus-visible:outline-2 focus-visible:outline-primary" aria-label="Pi sessions overview">
    <img src="/pi.svg" alt="" width="32" height="32" class="size-8 shrink-0" />
    <span v-if="!collapsed" class="font-semibold tracking-tight text-highlighted">Pi workspace</span>
  </NuxtLink>
</template>
