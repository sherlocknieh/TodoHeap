<script setup>
import { computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useLlmStore } from '@/stores/llm'
import { AGENT_TOOL_LABELS, AGENT_TOOL_NAMES } from '@/lib/agentTools'
import { useResizablePanel } from '@/utils/resizablePanel'
import { summarizeRequest } from '@/utils/contextStats'
import AppIcon from '@/components/AppIcon.vue'

defineProps({
  show: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const agent = useAgentStore()
const llm = useLlmStore()

const { width: panelWidth, resizing: panelResizing, collapseArmed: panelCollapseArmed, start: startResize } = useResizablePanel({
  key: 'ai-context-width',
  initial: 300,
  min: 240,
  side: 'right',
  onCollapse: () => emit('close')
})

// 取最近一条带请求快照的用户消息，面板展示的始终是真实发出去的内容
const latestRequest = computed(() => {
  for (let index = agent.messages.length - 1; index >= 0; index -= 1) {
    const message = agent.messages[index]
    if (message.role === 'user' && message.requests?.length) {
      return message.requests[message.requests.length - 1]
    }
  }
  return null
})

const contextStats = computed(() => summarizeRequest(latestRequest.value))

// 服务商有返回用量时展示真实输入输出，否则只显示字符估算
const usage = computed(() => latestRequest.value?.usage || null)

const userCount = computed(() => agent.messages.filter((message) => message.role === 'user').length)
const assistantCount = computed(() => agent.messages.filter((message) => message.role === 'assistant').length)

const providerLabel = computed(() => {
  if (llm.isBuiltin) return '内置网关'
  return llm.presets.find((preset) => preset.id === llm.config?.presetId)?.label || '自定义'
})

const systemPrompt = computed(() => (
  latestRequest.value?.messages?.find((message) => message.role === 'system')?.content || ''
))

// 原始消息取会话记录，展开时剔除大块的请求快照
const rawMessages = computed(() => agent.messages)

const rawMessageJson = (message) => {
  const { requests, ...rest } = message
  // 图片本体是 base64，展开时只保留元数据
  const images = (rest.images || []).map(({ dataUrl, ...meta }) => meta)
  return JSON.stringify({ ...rest, images }, null, 2)
}


const breakdown = computed(() => {
  const stats = contextStats.value
  if (!stats) return []
  const share = (value) => (stats.total ? (value / stats.total) * 100 : 0)
  return [
    { key: 'system', label: '系统提示', value: stats.system, width: share(stats.system), percent: Math.round(share(stats.system)), dot: 'bg-accent-700' },
    { key: 'history', label: '对话历史', value: stats.history, width: share(stats.history), percent: Math.round(share(stats.history)), dot: 'bg-accent-500' },
    { key: 'tools', label: '工具结果', value: stats.tools, width: share(stats.tools), percent: Math.round(share(stats.tools)), dot: 'bg-accent-300 dark:bg-accent-400/60' }
  ]
})

// 请求里的工具少于全集，说明本轮由技能限定了工具范围
const toolLimited = computed(() => (
  Boolean(latestRequest.value) && latestRequest.value.tools.length < AGENT_TOOL_NAMES.length
))

const formatTokens = (value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value))

const formatNumber = (value) => Number(value || 0).toLocaleString()

const EMPTY_RAW_HINT = '发送一条消息后，这里会展示会话消息记录。'

const formatDateTime = (iso) => {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return '—'
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatShortTime = (iso) => {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return ''
  const pad = (value) => String(value).padStart(2, '0')
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

// 导出当前会话（含内存中的请求快照），便于离线排查
const exportSession = () => {
  const session = agent.activeSession
  if (!session) return
  const payload = {
    session: {
      id: session.id,
      title: session.title,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt
    },
    model: {
      mode: llm.isBuiltin ? 'builtin' : 'byok',
      provider: providerLabel.value,
      model: llm.activeModel,
      temperature: llm.config?.temperature
    },
    messages: agent.messages.map((message) => ({
      ...message,
      images: (message.images || []).map(({ dataUrl, ...meta }) => meta)
    }))
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = `todoheap-agent-${session.id}.json`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div v-if="show" data-detail-panel :class="[
    'relative max-w-full h-full min-h-0 bg-surface dark:bg-surface-dark flex flex-col z-20 border-l border-hairline dark:border-hairline-dark'
  ]" :style="{ width: panelWidth + 'px' }">
    <!-- 左缘拖拽条与任务详情面板一致，宽度独立保存 -->
    <div
      class="absolute inset-y-0 -left-1 z-40 w-2 cursor-col-resize touch-none transition-colors"
      :class="panelCollapseArmed ? 'bg-accent-700/60' : panelResizing ? 'bg-accent-500/50' : 'hover:bg-accent-500/30'"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度，继续拖动即收起"
      @pointerdown="startResize"
    ></div>

    <div class="shrink-0 h-12 flex items-center justify-between px-3 border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">上下文</span>
      <button type="button"
        class="p-1.5 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
        title="关闭" @click="emit('close')">
        <AppIcon name="close" :size="15" />
      </button>
    </div>

    <div class="flex-1 min-h-0 overflow-auto px-4 py-3 space-y-3">
      <!-- 概览：两列字段，取自会话与最近一次真实请求 -->
      <dl class="grid grid-cols-2 gap-x-3 gap-y-2.5">
        <div class="min-w-0">
          <dt class="eyebrow">会话</dt>
          <dd class="truncate text-xs text-neutral-900 dark:text-neutral-100" :title="agent.activeSession?.title">
            {{ agent.activeSession?.title || '新对话' }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">消息数</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ agent.messages.length }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">提供商</dt>
          <dd class="truncate text-xs text-neutral-800 dark:text-neutral-200">{{ providerLabel }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">模型</dt>
          <dd class="truncate text-xs text-neutral-800 dark:text-neutral-200" :title="llm.activeModel">
            {{ llm.activeModel || '未配置' }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">上下文估算</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">
            {{ contextStats ? `≈ ${formatTokens(contextStats.tokens)} tokens` : '—' }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">字符总数</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">
            {{ contextStats ? formatNumber(contextStats.total) : '—' }}
          </dd>
        </div>
        <div v-if="usage" class="min-w-0">
          <dt class="eyebrow">输入词元</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ formatNumber(usage.prompt) }}</dd>
        </div>
        <div v-if="usage" class="min-w-0">
          <dt class="eyebrow">输出词元</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ formatNumber(usage.completion) }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">用户消息</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ userCount }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">助手消息</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ assistantCount }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">创建时间</dt>
          <dd class="whitespace-nowrap text-xs tabular-nums text-neutral-800 dark:text-neutral-200">
            {{ formatDateTime(agent.activeSession?.createdAt) }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">最后活动</dt>
          <dd class="whitespace-nowrap text-xs tabular-nums text-neutral-800 dark:text-neutral-200">
            {{ formatDateTime(agent.activeSession?.updatedAt) }}
          </dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">temperature</dt>
          <dd class="text-xs tabular-nums text-neutral-800 dark:text-neutral-200">{{ llm.config?.temperature ?? '默认' }}</dd>
        </div>
        <div class="min-w-0">
          <dt class="eyebrow">最近请求</dt>
          <dd class="whitespace-nowrap text-xs tabular-nums text-neutral-800 dark:text-neutral-200">
            {{ latestRequest ? formatDateTime(latestRequest.createdAt) : '—' }}
          </dd>
        </div>
      </dl>

      <!-- 上下文构成：数据来自最近一次真实请求 -->
      <section v-if="contextStats" class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <div class="flex items-center justify-between">
          <p class="eyebrow">上下文构成</p>
          <span class="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            ≈ {{ formatTokens(contextStats.tokens) }} tokens
          </span>
        </div>
        <div class="flex h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
          <div v-for="row in breakdown" :key="row.key" :class="row.dot" :style="{ width: row.width + '%' }"></div>
        </div>
        <ul class="space-y-1">
          <li v-for="row in breakdown" :key="row.key" class="flex items-center gap-2 text-[11px]">
            <span class="h-1.5 w-1.5 shrink-0 rounded-full" :class="row.dot"></span>
            <span class="text-neutral-600 dark:text-neutral-400">{{ row.label }}</span>
            <span class="ml-auto tabular-nums text-neutral-700 dark:text-neutral-300">
              {{ formatNumber(row.value) }} 字符 · {{ row.percent }}%
            </span>
          </li>
        </ul>
      </section>

      <!-- 系统提示词原文 -->
      <section v-if="systemPrompt" class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <p class="eyebrow">系统提示词</p>
        <pre class="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-lg border border-hairline bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ systemPrompt }}</pre>
      </section>

      <!-- 本轮可用工具 -->
      <section v-if="latestRequest" class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <div class="flex items-center justify-between">
          <p class="eyebrow">本轮工具</p>
          <span class="text-[11px] tabular-nums text-neutral-600 dark:text-neutral-400">{{ latestRequest.tools.length }} 个</span>
        </div>
        <p v-if="toolLimited" class="text-[11px] text-accent-700 dark:text-accent-300">技能限定了工具范围</p>
        <div class="flex max-h-32 flex-wrap gap-1 overflow-auto">
          <span v-for="name in latestRequest.tools" :key="name" class="chip">
            {{ AGENT_TOOL_LABELS[name] || name }}
          </span>
        </div>
      </section>

      <!-- 原始消息：最近一次请求逐条列出，每条独立展开 -->
      <section class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <div class="flex items-center justify-between">
          <p class="eyebrow">原始消息</p>
          <button type="button" :disabled="!agent.messages.length"
            class="inline-flex items-center gap-1 rounded text-[11px] text-neutral-500 transition-colors hover:text-accent-700 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-accent-300"
            @click="exportSession">
            <AppIcon name="download" :size="12" /> 导出会话
          </button>
        </div>
        <template v-if="rawMessages.length">
          <p class="text-[11px] text-neutral-500 dark:text-neutral-400">会话消息 · {{ rawMessages.length }} 条</p>
          <div class="overflow-hidden rounded-lg border border-hairline dark:border-hairline-dark">
            <details v-for="message in rawMessages" :key="message.id"
              class="group border-b border-hairline last:border-b-0 dark:border-hairline-dark">
              <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
                <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">{{ message.role }}</span>
                <span class="min-w-0 flex-1 truncate text-neutral-400 dark:text-neutral-500" :title="message.id">
                  • {{ message.id }}
                </span>
                <span class="shrink-0 tabular-nums text-neutral-500 dark:text-neutral-400">{{ formatShortTime(message.createdAt) }}</span>
                <AppIcon name="chevronDown" :size="12"
                  class="shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
              </summary>
              <pre class="max-h-56 overflow-auto border-t border-hairline bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ rawMessageJson(message) }}</pre>
            </details>
          </div>
        </template>
        <p v-else class="rounded-lg border border-dashed border-hairline px-3 py-2 text-[11px] leading-5 text-neutral-500 dark:border-hairline-dark dark:text-neutral-400">
          {{ EMPTY_RAW_HINT }}
        </p>
      </section>

      <p v-if="latestRequest" class="text-[11px] leading-5 text-neutral-400 dark:text-neutral-500">
        完整提示词可在用户消息下的「查看请求」中展开。
      </p>
    </div>
  </div>
</template>
