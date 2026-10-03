<script setup lang="ts">
import { formatCost, formatTokens } from '#shared/utils/status'
import { truncateTitle } from '#shared/utils/title'

const { data: sessions, search, workspace, workspaces, filteredSessions, error, isPending, isLoading, refetch } = useSessions()
const totalMessages = computed(() => (sessions.value || []).reduce((total, session) => total + session.messageCount, 0))
const totalUsage = computed(() => (sessions.value || []).reduce((totals, session) => {
  if (session.usage) {
    totals.input += session.usage.input
    totals.output += session.usage.output
    totals.cacheRead += session.usage.cacheRead
    totals.cacheWrite += session.usage.cacheWrite
    totals.cost += session.usage.cost
  }
  return totals
}, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, cost: 0 }))
const missingUsage = computed(() => (sessions.value || []).filter(session => !session.usage).length)
const stats = computed(() => [
  { label: 'Total sessions', value: (sessions.value?.length || 0).toLocaleString(), detail: '' },
  { label: 'Workspaces', value: workspaces.value.length.toLocaleString(), detail: '' },
  { label: 'Messages', value: totalMessages.value.toLocaleString(), detail: '' },
  { label: 'Input tokens', value: formatTokens(totalUsage.value.input), detail: `Cache read: ${formatTokens(totalUsage.value.cacheRead)} · write: ${formatTokens(totalUsage.value.cacheWrite)}` },
  { label: 'Output tokens', value: formatTokens(totalUsage.value.output), detail: '' },
  { label: 'Estimated cost', value: formatCost(totalUsage.value.cost), detail: '' },
])
function workspaceName(cwd: string) {
  return cwd.split(/[\\/]/).filter(Boolean).pop() || 'Unknown'
}
useHead({ title: 'Sessions · Autobots' })
</script>

<template>
  <UDashboardPanel id="sessions-overview" class="min-h-0" :ui="{ body: 'gap-6 p-4 sm:p-6 lg:p-8' }">
    <template #header>
      <UDashboardNavbar title="Sessions" icon="i-lucide-layout-dashboard" :ui="{ title: 'font-semibold', right: 'gap-2' }">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton icon="i-lucide-refresh-cw" color="neutral" variant="outline" :loading="isLoading" aria-label="Refresh sessions" @click="refetch()">
            <span class="hidden sm:inline">Refresh</span>
          </UButton>
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4 sm:grid-cols-3">
        <div v-for="stat in stats" :key="stat.label" class="rounded-lg border border-default p-5">
          <div>
            <p class="text-sm text-muted">
              {{ stat.label }}
            </p>
            <UTooltip v-if="stat.detail" :text="stat.detail">
              <p tabindex="0" class="mt-2 w-fit text-3xl font-semibold tracking-tight text-highlighted">
                {{ stat.value }}
              </p>
            </UTooltip>
            <p v-else class="mt-2 text-3xl font-semibold tracking-tight text-highlighted">
              {{ stat.value }}
            </p>
          </div>
        </div>
      </div>

      <p v-if="missingUsage" class="text-xs text-muted">
        Usage unavailable for {{ missingUsage }} session(s); totals include only available usage.
      </p>

      <section class="min-w-0 rounded-lg border border-default">
        <div class="flex flex-wrap items-center justify-between gap-3 border-b border-default p-4">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-semibold text-highlighted">
              Session history
            </h2>
            <UBadge color="neutral" variant="subtle" size="sm">
              {{ filteredSessions.length }}
            </UBadge>
          </div>
          <div class="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
            <UInput v-model="search" icon="i-lucide-search" placeholder="Search sessions…" aria-label="Search session history" />
            <WorkspaceDropdown class="w-full sm:w-52" />
          </div>
        </div>

        <UAlert v-if="error" color="error" title="Unable to load sessions" description="Check access to your Pi session directory, then refresh." class="m-4" />
        <div v-if="isPending && !error" class="space-y-4 p-6" role="status" aria-label="Loading sessions">
          <USkeleton v-for="i in 4" :key="i" class="h-12 w-full" />
        </div>
        <div v-else-if="filteredSessions.length" class="overflow-x-auto">
          <table class="w-full min-w-[64rem] table-fixed text-left text-sm">
            <thead class="border-b border-default bg-muted/40 text-xs text-muted">
              <tr>
                <th scope="col" class="px-4 py-3 font-medium">
                  Conversation
                </th>
                <th scope="col" class="hidden w-40 px-4 py-3 font-medium md:table-cell">
                  Workspace
                </th>
                <th scope="col" class="w-24 px-4 py-3 text-right font-medium">
                  Messages
                </th>
                <th scope="col" class="w-28 px-4 py-3 text-right font-medium">
                  Input
                </th>
                <th scope="col" class="w-24 px-4 py-3 text-right font-medium">
                  Output
                </th>
                <th scope="col" class="w-24 px-4 py-3 text-right font-medium">
                  <UTooltip text="Recorded API estimate in USD, not necessarily actual subscription spending" :ui="{ content: 'max-w-xs', text: 'whitespace-normal' }">
                    <span tabindex="0">Est. cost</span>
                  </UTooltip>
                </th>
                <th scope="col" class="hidden w-32 px-4 py-3 font-medium sm:table-cell">
                  Last updated
                </th>
                <th scope="col" class="w-10">
                  <span class="sr-only">Open</span>
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-default">
              <tr v-for="session in filteredSessions" :key="session.id" class="group transition hover:bg-muted/40">
                <td class="px-4 py-4">
                  <SessionPreviewPopover v-slot="{ close }" :session="session" side="bottom">
                    <NuxtLink :to="`/sessions/${session.id}`" class="block min-w-0 rounded-md focus-visible:outline-2 focus-visible:outline-primary" @click="close">
                      <p class="truncate font-medium text-highlighted group-hover:text-primary">
                        {{ truncateTitle(session.name || session.firstMessage || 'Untitled session') }}
                      </p>
                      <p v-if="session.name && session.firstMessage" class="mt-1 truncate text-xs text-muted">
                        {{ session.firstMessage }}
                      </p>
                    </NuxtLink>
                  </SessionPreviewPopover>
                </td>
                <td class="hidden max-w-48 px-4 py-4 md:table-cell">
                  <UTooltip :text="session.cwd" :ui="{ content: 'max-w-sm', text: 'whitespace-normal break-all' }">
                    <span tabindex="0" class="block truncate text-muted">{{ workspaceName(session.cwd) }}</span>
                  </UTooltip>
                </td>
                <td class="px-4 py-4 text-right tabular-nums text-muted">
                  {{ session.messageCount }}
                </td>
                <td class="px-4 py-4 text-right tabular-nums text-muted">
                  <template v-if="session.usage">
                    <UTooltip :text="`${session.usage.input.toLocaleString()} input tokens (excluding cache)`">
                      <span tabindex="0">{{ formatTokens(session.usage.input) }}</span>
                    </UTooltip>
                    <UTooltip v-if="session.usage.cacheRead || session.usage.cacheWrite" :text="`Cache read: ${session.usage.cacheRead.toLocaleString()} tokens; cache write: ${session.usage.cacheWrite.toLocaleString()} tokens`">
                      <p tabindex="0" class="mt-1 whitespace-nowrap text-xs">
                        R {{ formatTokens(session.usage.cacheRead) }} · W {{ formatTokens(session.usage.cacheWrite) }}
                      </p>
                    </UTooltip>
                  </template>
                  <UTooltip v-else text="Usage unavailable">
                    <span tabindex="0">—</span>
                  </UTooltip>
                </td>
                <td class="px-4 py-4 text-right tabular-nums text-muted">
                  <UTooltip :text="session.usage ? `${session.usage.output.toLocaleString()} output tokens` : 'Usage unavailable'">
                    <span tabindex="0">{{ session.usage ? formatTokens(session.usage.output) : '—' }}</span>
                  </UTooltip>
                </td>
                <td class="px-4 py-4 text-right tabular-nums text-muted">
                  <UTooltip :text="session.usage ? `Recorded API estimate: $${session.usage.cost.toFixed(6)} USD` : 'Usage unavailable'">
                    <span tabindex="0">{{ session.usage ? formatCost(session.usage.cost) : '—' }}</span>
                  </UTooltip>
                </td>
                <td class="hidden whitespace-nowrap px-4 py-4 text-xs text-muted sm:table-cell">
                  <time :datetime="session.modified">{{ new Date(session.modified).toLocaleDateString() }}</time>
                </td>
                <td class="pe-3">
                  <UButton :to="`/sessions/${session.id}`" icon="i-lucide-chevron-right" color="neutral" variant="ghost" size="xs" :aria-label="`Open ${session.name || 'session'}`" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <div v-else-if="!error" class="flex flex-col items-center px-6 py-16 text-center">
          <UIcon name="i-lucide-messages-square" class="mb-4 size-10 text-dimmed" />
          <h3 class="font-semibold">
            {{ sessions?.length ? 'No matching conversations' : 'No sessions yet' }}
          </h3>
          <p class="mt-2 max-w-sm text-sm text-muted">
            {{ sessions?.length ? 'Try another search or workspace filter.' : 'Start a new conversation to work with Pi in your local workspace.' }}
          </p>
          <UButton v-if="!sessions?.length" to="/new" icon="i-lucide-plus" class="mt-4">
            New conversation
          </UButton>
          <UButton v-if="sessions?.length" class="mt-4" color="neutral" variant="outline" @click="search = ''; workspace = ''">
            Clear filters
          </UButton>
        </div>
      </section>
    </template>
  </UDashboardPanel>
</template>
