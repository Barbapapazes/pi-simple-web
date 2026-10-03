<script setup lang="ts">
const route = useRoute()
const sidebarOpen = ref(false)
watch(() => route.fullPath, () => {
  sidebarOpen.value = false
})
</script>

<template>
  <UDashboardGroup unit="rem" class="bg-muted/40">
    <UDashboardSidebar
      id="sessions-sidebar"
      v-model:open="sidebarOpen"
      :default-size="18"
      :min-size="15"
      :max-size="24"
      collapsible
      resizable
      :menu="{ title: 'Pi sessions', description: 'Browse local conversations', inset: true }"
      class="border-r-0"
      :ui="{ header: 'h-16', body: 'min-h-0 gap-5 overflow-hidden' }"
    >
      <!-- These slots render in both desktop and mobile containers.
           Give each container its own component instance and render cache. -->
      <template #header="{ collapsed }">
        <SessionSidebarHeader :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <SessionSidebarContent :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <main class="m-2 flex min-w-0 flex-1 overflow-hidden rounded-xl bg-default shadow-sm ring ring-default lg:my-3 lg:me-3 lg:ms-0">
      <slot />
    </main>
  </UDashboardGroup>
</template>
