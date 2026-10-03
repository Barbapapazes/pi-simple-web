<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'

const { workspace, workspaceOptions } = useSessions()
const items = computed<DropdownMenuItem[]>(() => workspaceOptions.value.map(option => ({
  label: option.label,
  icon: workspace.value === option.value ? 'i-lucide-check' : 'i-lucide-folder-open',
  onSelect: () => { workspace.value = option.value },
})))
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'start', collisionPadding: 16 }"
    :ui="{
      content: 'w-max min-w-(--reka-dropdown-menu-trigger-width) max-w-[min(48rem,calc(100vw-2rem))]',
      itemLabel: 'overflow-visible whitespace-normal text-clip break-all',
    }"
  >
    <UTooltip :text="workspace || 'All workspaces'" :ui="{ content: 'max-w-sm', text: 'whitespace-normal break-all' }">
      <UButton
        :label="workspace || 'All workspaces'"
        icon="i-lucide-folder-open"
        trailing-icon="i-lucide-chevron-down"
        color="neutral"
        variant="outline"
        aria-label="Filter by workspace"
        class="w-full min-w-0"
        :ui="{ label: 'min-w-0 flex-1 truncate text-left' }"
      />
    </UTooltip>
  </UDropdownMenu>
</template>
