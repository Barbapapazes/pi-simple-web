<script setup lang="ts">
useHead({ title: 'New conversation · Autobots' })
</script>

<template>
  <UDashboardPanel id="new-conversation" class="min-h-0" :ui="{ body: 'p-4 sm:p-8' }">
    <template #header>
      <UDashboardNavbar title="New conversation">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>
    <template #body>
      <div class="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 py-12">
        <div class="space-y-4">
          <img src="/pi.svg" alt="Pi" width="48" height="48" class="size-12">
          <h1 class="text-3xl font-semibold tracking-tight text-highlighted sm:text-4xl">
            What can we work on?
          </h1>
          <p class="text-muted">
            Start a conversation with Pi.
          </p>
        </div>
        <ConversationComposer />
      </div>
    </template>
  </UDashboardPanel>
</template>
