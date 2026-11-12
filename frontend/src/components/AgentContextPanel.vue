<script setup>
import { computed } from 'vue'
import { useAgentStore } from '@/stores/agent'
import { useLlmStore } from '@/stores/llm'
import { AGENT_TOOL_LABELS, AGENT_TOOL_NAMES } from '@/lib/agentTools'
import { AGENT_MODES } from '@/lib/agentModes'
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

// 当前会话的工作模式，与输入区保持一致
const modeLabel = computed(() => (
  AGENT_MODES.find((mode) => mode.id === agent.activeMode)?.label || 'Plan'
))

// 请求次数：一次用户消息可能触发多轮工具调用
const requestCount = computed(() => (
  agent.messages.reduce((sum, message) => sum + (message.requests?.length || 0), 0)
))

const providerLabel = computed(() => {
  if (llm.isBuiltin) return '内置网关'
  return llm.presets.find((preset) => preset.id === llm.config?.presetId)?.label || '自定义'
})

// 最近一次请求实际发送的消息：system 里含工具清单，是模型真正看到的内容
const rawRequestMessages = computed(() => latestRequest.value?.messages || [])

// 实际发出的请求体：model / temperature / stream / tool_choice / tools 与 messages 同源
const requestBody = computed(() => latestRequest.value?.body || null)

// 参数摘要只列协议层字段，工具定义与消息在下方分别展开
const requestParams = computed(() => {
  const body = latestRequest.value?.body
  if (!body) return []
  return [
    { key: 'model', label: 'model', value: body.model || '—' },
    { key: 'temperature', label: 'temperature', value: body.temperature ?? '默认' },
    { key: 'stream', label: 'stream', value: String(Boolean(body.stream)) },
    { key: 'tool_choice', label: 'tool_choice', value: body.tool_choice || '（未发送）' }
  ]
})

// 本轮工具定义：名称、中文标签与完整 schema，展开即可核对模型收到的约束
const requestTools = computed(() => {
  const definitions = latestRequest.value?.body?.tools
  if (Array.isArray(definitions)) {
    return definitions.map((definition) => {
      const fn = definition?.function || {}
      return {
        name: fn.name || '',
        label: AGENT_TOOL_LABELS[fn.name] || fn.name || '',
        description: fn.description || '',
        json: JSON.stringify(definition, null, 2)
      }
    })
  }
  // 旧快照只存了工具名，退化成只有名称的条目
  return (latestRequest.value?.tools || []).map((name) => ({
    name,
    label: AGENT_TOOL_LABELS[name] || name,
    description: '',
    json: ''
  }))
})

const requestMessageLabel = (message) => {
  if (message.role !== 'system') return message.role
  return String(message.content || '').startsWith('本轮可用工具') ? 'system · 工具清单' : 'system · 提示词'
}

const requestMessageJson = (message) => JSON.stringify(message, null, 2)

// 消息摘要：列表里先给一眼能看懂的内容，展开再看完整 JSON
const summarizeContent = (content) => {
  if (typeof content === 'string') return content.replace(/\s+/g, ' ').trim()
  if (!Array.isArray(content)) return ''
  return content
    .map((part) => {
      if (part?.type === 'text') return String(part.text || '')
      if (part?.type === 'image_url') return '[图片]'
      return ''
    })
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const requestMessageSummary = (message) => {
  if (message.role === 'assistant' && Array.isArray(message.tool_calls) && message.tool_calls.length) {
    const names = message.tool_calls.map((call) => AGENT_TOOL_LABELS[call.function?.name] || call.function?.name)
    return `调用 ${names.join('、')}`
  }
  if (message.role === 'tool') return summarizeContent(message.content).slice(0, 80)
  return summarizeContent(message.content).slice(0, 80)
}

// 工具结果按条数折叠，避免长列表把面板撑爆
const toolMessageCount = computed(() => rawRequestMessages.value.filter((message) => message.role === 'tool').length)


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

// 请求快照只存在内存中，刷新后为空属于正常情况
const EMPTY_REQUEST_HINT = '请求快照只保留在当前页面，刷新后不再显示；发送一条消息即可重新记录。'

const formatDateTime = (iso) => {
  const date = new Date(iso)
  if (!iso || Number.isNaN(date.getTime())) return '—'
  const pad = (value) => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
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
      <!-- 会话摘要：标题与模式一眼可见 -->
      <div class="space-y-1">
        <p class="truncate text-sm font-medium text-neutral-900 dark:text-neutral-100" :title="agent.activeSession?.title">
          {{ agent.activeSession?.title || '新对话' }}
        </p>
        <div class="flex flex-wrap items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span class="chip">{{ modeLabel }}</span>
          <span class="chip">{{ providerLabel }}</span>
          <span class="chip">{{ llm.activeModel || '未配置模型' }}</span>
        </div>
      </div>

      <!-- 关键指标：只留最常看的四项 -->
      <dl class="grid grid-cols-2 gap-2">
        <div class="rounded-lg border border-hairline px-2.5 py-2 dark:border-hairline-dark">
          <dt class="eyebrow">上下文估算</dt>
          <dd class="mt-0.5 text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
            {{ contextStats ? `≈ ${formatTokens(contextStats.tokens)}` : '—' }}
            <span class="text-[11px] font-normal text-neutral-500 dark:text-neutral-400">tokens</span>
          </dd>
        </div>
        <div class="rounded-lg border border-hairline px-2.5 py-2 dark:border-hairline-dark">
          <dt class="eyebrow">字符总数</dt>
          <dd class="mt-0.5 text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
            {{ contextStats ? formatNumber(contextStats.total) : '—' }}
          </dd>
        </div>
        <div class="rounded-lg border border-hairline px-2.5 py-2 dark:border-hairline-dark">
          <dt class="eyebrow">消息 / 请求</dt>
          <dd class="mt-0.5 text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
            {{ agent.messages.length }} <span class="text-[11px] font-normal text-neutral-500 dark:text-neutral-400">/ {{ requestCount }}</span>
          </dd>
        </div>
        <div class="rounded-lg border border-hairline px-2.5 py-2 dark:border-hairline-dark">
          <dt class="eyebrow">temperature</dt>
          <dd class="mt-0.5 text-sm tabular-nums text-neutral-900 dark:text-neutral-100">{{ llm.config?.temperature ?? '默认' }}</dd>
        </div>
      </dl>

      <!-- 上下文构成：占比条 + 明细 -->
      <section v-if="contextStats" class="space-y-1.5">
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

      <!-- 请求参数：实际发出的协议字段，与消息列表同源 -->
      <section v-if="requestBody" class="space-y-1.5">
        <p class="eyebrow">请求参数</p>
        <dl class="grid grid-cols-2 gap-1.5">
          <div v-for="param in requestParams" :key="param.key"
            class="rounded-md border border-hairline px-2 py-1 dark:border-hairline-dark">
            <dt class="text-[10px] uppercase tracking-wide text-neutral-400 dark:text-neutral-500">{{ param.label }}</dt>
            <dd class="truncate text-[11px] tabular-nums text-neutral-800 dark:text-neutral-200" :title="String(param.value)">
              {{ param.value }}
            </dd>
          </div>
        </dl>
      </section>

      <!-- 本轮工具：按模式与技能限定后的实际范围，展开可看完整 schema -->
      <section v-if="latestRequest" class="space-y-1.5">
        <div class="flex items-center justify-between">
          <p class="eyebrow">本轮工具</p>
          <span class="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ requestTools.length }} 个</span>
        </div>
        <p v-if="toolLimited" class="text-[11px] text-accent-700 dark:text-accent-300">受模式或技能限定</p>
        <div v-if="requestTools.length" class="overflow-hidden rounded-lg border border-hairline dark:border-hairline-dark">
          <details v-for="tool in requestTools" :key="tool.name"
            class="group border-b border-hairline last:border-b-0 dark:border-hairline-dark">
            <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">{{ tool.label }}</span>
              <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{{ tool.name }}</span>
              <AppIcon name="chevronDown" :size="12"
                class="shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
            </summary>
            <div class="space-y-1.5 border-t border-hairline bg-neutral-50 p-2 dark:border-hairline-dark dark:bg-neutral-900">
              <p class="text-[11px] leading-4 text-neutral-600 dark:text-neutral-400">{{ tool.description }}</p>
              <pre class="max-h-48 overflow-auto rounded bg-white p-2 text-[10px] leading-4 text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">{{ tool.json }}</pre>
            </div>
          </details>
        </div>
        <p v-else class="text-[11px] text-neutral-500 dark:text-neutral-400">本轮未发送工具定义</p>
      </section>

      <!-- 最近一次请求：模型真正收到的消息，带内容摘要 -->
      <section class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <div class="flex items-center justify-between gap-2">
          <p v-if="rawRequestMessages.length" class="text-[11px] text-neutral-500 dark:text-neutral-400">
            最近一次请求 · {{ rawRequestMessages.length }} 条消息<template v-if="toolMessageCount">（含 {{ toolMessageCount }} 条工具结果）</template>
          </p>
          <p v-else class="text-[11px] text-neutral-500 dark:text-neutral-400">最近一次请求</p>
          <button type="button" :disabled="!agent.messages.length"
            class="inline-flex shrink-0 items-center gap-1 rounded text-[11px] text-neutral-500 transition-colors hover:text-accent-700 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-accent-300"
            @click="exportSession">
            <AppIcon name="download" :size="12" /> 导出会话
          </button>
        </div>
        <div v-if="rawRequestMessages.length" class="overflow-hidden rounded-lg border border-hairline dark:border-hairline-dark">
          <details v-for="(message, index) in rawRequestMessages" :key="`req-${index}`"
            class="group border-b border-hairline last:border-b-0 dark:border-hairline-dark">
            <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              <span class="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">{{ index + 1 }}</span>
              <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">{{ requestMessageLabel(message) }}</span>
              <span class="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">{{ requestMessageSummary(message) }}</span>
              <AppIcon name="chevronDown" :size="12"
                class="shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
            </summary>
            <pre class="max-h-56 overflow-auto border-t border-hairline bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ requestMessageJson(message) }}</pre>
          </details>
        </div>
        <p v-else class="rounded-lg border border-dashed border-hairline px-3 py-2 text-[11px] leading-5 text-neutral-500 dark:border-hairline-dark dark:text-neutral-400">
          {{ EMPTY_REQUEST_HINT }}
        </p>
      </section>

      <!-- 会话时间线：次要信息收进一行 -->
      <p class="border-t border-hairline pt-2 text-[11px] leading-5 text-neutral-400 dark:border-hairline-dark dark:text-neutral-500">
        创建 {{ formatDateTime(agent.activeSession?.createdAt) }} · 最后活动 {{ formatDateTime(agent.activeSession?.updatedAt) }}
        <template v-if="latestRequest"> · 最近请求 {{ formatDateTime(latestRequest.createdAt) }}</template>
      </p>
    </div>
  </div>
</template>
