<script setup lang="ts">
import { useSessions } from '#sessions/app/composables/useSessions'

const cwd = ref('')
const { workspaces } = useSessions()
const { state: conversation } = useConversation()
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
            Start a conversation with Pi in your local workspace.
          </p>
        </div>
        <div class="space-y-2">
          <label for="workspace-path" class="block text-sm font-medium text-highlighted">Workspace</label>
          <UInput id="workspace-path" v-model="cwd" list="workspace-suggestions" icon="i-lucide-folder-open" placeholder="Server working directory (default)" :disabled="conversation.busy" class="w-full" aria-describedby="workspace-help" />
          <datalist id="workspace-suggestions">
            <option v-for="workspace in workspaces.filter(Boolean)" :key="workspace" :value="workspace" />
          </datalist>
          <p id="workspace-help" class="text-xs text-muted">
            Enter an existing absolute directory path on the server, or leave blank to use its working directory. Pi will use it for files, commands, and project instructions.
          </p>
        </div>
        <ConversationComposer :cwd="cwd" />
      </div>
    </template>
  </UDashboardPanel>
</template>
