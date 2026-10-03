<script setup lang="ts">
import type { SessionDetail, SessionStatus } from '#sessions/shared/types/sessions'
import { formatTokens } from '#shared/utils/status'

defineProps<{ status: SessionStatus, model?: SessionDetail['model'], thinkingLevel?: string }>()
</script>

<template>
  <div class="mt-3 space-y-1 font-mono text-xs text-muted" aria-label="Session usage">
    <UTooltip :text="status.workspace" :ui="{ content: 'max-w-sm', text: 'whitespace-normal break-all' }">
      <div tabindex="0" class="truncate">
        {{ status.workspace }}<span v-if="status.gitBranch"> ({{ status.gitBranch }})</span>
      </div>
    </UTooltip>
    <div class="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <UTooltip :text="`Input tokens: ${status.input.toLocaleString()}`">
          <span tabindex="0" :aria-label="`Input tokens: ${status.input}`">↑{{ formatTokens(status.input) }}</span>
        </UTooltip>
        <UTooltip :text="`Output tokens: ${status.output.toLocaleString()}`">
          <span tabindex="0" :aria-label="`Output tokens: ${status.output}`">↓{{ formatTokens(status.output) }}</span>
        </UTooltip>
        <UTooltip v-if="status.cacheRead" :text="`Cache read tokens: ${status.cacheRead.toLocaleString()}`">
          <span tabindex="0" :aria-label="`Cache read tokens: ${status.cacheRead}`">R{{ formatTokens(status.cacheRead) }}</span>
        </UTooltip>
        <UTooltip v-if="status.cacheWrite" :text="`Cache write tokens: ${status.cacheWrite.toLocaleString()}`">
          <span tabindex="0" :aria-label="`Cache write tokens: ${status.cacheWrite}`">W{{ formatTokens(status.cacheWrite) }}</span>
        </UTooltip>
        <UTooltip v-if="(status.cacheRead || status.cacheWrite) && status.cacheHitRate !== null" text="Cache hit rate of the latest model request">
          <span tabindex="0" :aria-label="`Cache hit rate: ${status.cacheHitRate.toFixed(1)} percent`">CH{{ status.cacheHitRate.toFixed(1) }}%</span>
        </UTooltip>
        <UTooltip text="Total recorded model cost across the entire session (USD); subscription costs are estimates" :ui="{ content: 'max-w-xs', text: 'whitespace-normal' }">
          <span tabindex="0">${{ status.cost.toFixed(3) }}<span v-if="status.subscription"> (sub)</span></span>
        </UTooltip>
        <UTooltip
          :text="status.context?.tokens != null ? `Estimated context: ${status.context.tokens.toLocaleString()} / ${status.context.contextWindow.toLocaleString()} tokens` : 'Context usage is unknown until a successful model response; the model limit may be unavailable'"
          :ui="{ content: 'max-w-xs', text: 'whitespace-normal' }"
        >
          <span
            tabindex="0"
            :class="status.context?.percent != null && status.context.percent > 90 ? 'text-error' : status.context?.percent != null && status.context.percent > 70 ? 'text-warning' : ''"
            aria-label="Context usage"
          >{{ status.context?.percent != null ? `${status.context.percent.toFixed(1)}%` : '?' }}/{{ status.context ? formatTokens(status.context.contextWindow) : '?' }}</span>
        </UTooltip>
        <UTooltip v-if="status.autoCompaction" text="Automatic compaction enabled">
          <span tabindex="0">(auto)</span>
        </UTooltip>
      </div>
      <div v-if="model" class="ml-auto flex min-w-0 max-w-full items-baseline gap-2" aria-label="Agent model and thinking level">
        <UTooltip :text="`${model.provider}/${model.modelId}`" class="min-w-0" :ui="{ content: 'max-w-sm', text: 'whitespace-normal break-all' }">
          <span tabindex="0" class="truncate">{{ model.provider }}/{{ model.modelId }}</span>
        </UTooltip>
        <template v-if="thinkingLevel">
          <span aria-hidden="true">·</span>
          <span class="shrink-0" :aria-label="`Thinking level: ${thinkingLevel}`">{{ thinkingLevel }}</span>
        </template>
      </div>
    </div>
  </div>
</template>
