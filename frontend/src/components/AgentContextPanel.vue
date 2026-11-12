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
const latestRequestEntry = computed(() => {
  for (let index = agent.messages.length - 1; index >= 0; index -= 1) {
    const message = agent.messages[index]
    if (message.role === 'user' && message.requests?.length) {
      return { index, request: message.requests[message.requests.length - 1] }
    }
  }
  return null
})

const latestRequest = computed(() => latestRequestEntry.value?.request || null)

// 实时会话消息：模型刚产出的回复还没进请求快照，面板以会话为准
const liveMessages = computed(() => agent.messages.flatMap((message) => {
  if (message.role === 'user') {
    return [{ role: 'user', content: summarizeContent(message.content) || message.content || '' }]
  }
  if (message.role !== 'assistant') return []
  const calls = (message.toolCalls || []).filter((call) => call.result !== undefined)
  // 正在流式输出且尚无内容的占位消息不参与统计
  if (!message.content && !message.reasoning && !calls.length) return []
  const entry = {
    role: 'assistant',
    content: message.content || '',
    ...(message.reasoning ? { reasoning_content: message.reasoning } : {})
  }
  if (!calls.length) return [entry]
  return [
    {
      ...entry,
      tool_calls: calls.map((call) => ({
        id: call.id,
        type: 'function',
        function: { name: call.name, arguments: call.arguments || '{}' }
      }))
    },
    ...calls.map((call) => ({
      role: 'tool',
      tool_call_id: call.id,
      content: typeof call.result === 'string' ? call.result : JSON.stringify(call.result)
    }))
  ]
}))

// 本轮完整上下文：请求里的 system 提示 + 实时会话消息
const panelMessages = computed(() => [
  ...rawRequestMessages.value.filter((message) => message.role === 'system'),
  ...liveMessages.value
])

const contextStats = computed(() => summarizeRequest({
  messages: panelMessages.value,
  body: latestRequest.value?.body
}))

const providerLabel = computed(() => {
  if (llm.isBuiltin) return '内置网关'
  return llm.presets.find((preset) => preset.id === llm.config?.presetId)?.label || '自定义'
})

// 最近一次请求实际发送的消息，是模型真正看到的内容
const rawRequestMessages = computed(() => latestRequest.value?.messages || [])

// 参数在界面上的展示文案：布尔与对象转成一眼能读懂的词
const paramText = (key, value) => {
  if (value === undefined || value === null) return '默认'
  if (key === 'stream') return value ? '开' : '关'
  if (key === 'thinking') return value.type === 'disabled' ? '关闭' : '开启'
  return String(value)
}

// 请求参数：键值与真实请求一致，展示文案单独映射
const requestParams = computed(() => {
  const body = latestRequest.value?.body
  if (!body) return []
  const rows = [
    { key: 'model', value: body.model },
    { key: 'temperature', value: body.temperature },
    { key: 'stream', value: body.stream }
  ]
  if (body.tool_choice) rows.push({ key: 'tool_choice', value: body.tool_choice })
  // 只有下发思考参数时才展示，与真实请求保持一致
  if (body.reasoning_effort) rows.push({ key: 'reasoning_effort', value: body.reasoning_effort })
  if (body.thinking) rows.push({ key: 'thinking', value: body.thinking })
  return rows.map((row) => ({ ...row, text: paramText(row.key, row.value) }))
})

// 参数源码：值与真实请求逐字段一致，展开后才显示
const requestParamsJson = computed(() => (
  latestRequest.value?.body
    ? JSON.stringify(Object.fromEntries(requestParams.value.map((row) => [row.key, row.value])), null, 2)
    : ''
))

// 完整请求体：值原样保留，仅按参数、工具、消息的顺序重排键，便于先看协议字段再看大块内容
const requestBody = computed(() => {
  const body = latestRequest.value?.body
  if (!body) return null
  const { tools, messages, ...params } = body
  const ordered = { ...params }
  if (tools !== undefined) ordered.tools = tools
  if (messages !== undefined) ordered.messages = messages
  return ordered
})

const requestBodyJson = computed(() => (
  requestBody.value ? JSON.stringify(requestBody.value, null, 2) : ''
))

// 长度按紧凑序列化计：美化用的缩进换行不占上下文，不应算进「字符」里
const requestBodyChars = computed(() => (
  requestBody.value ? JSON.stringify(requestBody.value).length : 0
))

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
  if (message.role === 'system') return 'system · 提示词'
  if (hasReasoning(message)) return `${message.role} · 含思考`
  return message.role
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

// 思考内容在折叠态只给一个标记，展开后看完整 JSON
const hasReasoning = (message) => (
  message.role === 'assistant' && typeof message.reasoning_content === 'string' && message.reasoning_content.length > 0
)

// 上下文各类：先静态前缀，再过程类内容，正文对话放末尾
const breakdown = computed(() => {
  const stats = contextStats.value
  if (!stats) return []
  const share = (value) => (stats.total ? (value / stats.total) * 100 : 0)
  const row = (key, label, value, dot, extra = {}) => ({
    key,
    label,
    value,
    width: share(value),
    percent: Math.round(share(value)),
    dot,
    ...extra
  })
  return [
    row('system', '系统提示', stats.system, 'bg-context-system'),
    row('tools', '工具定义', stats.tools, 'bg-context-tools'),
    row('toolCalls', '工具调用', stats.toolCalls, 'bg-context-calls', { count: stats.toolCallCount, unit: '次' }),
    row('toolOutput', '工具输出', stats.toolOutput, 'bg-context-output'),
    row('reasoning', '思考消息', stats.reasoning, 'bg-context-reasoning', { count: stats.reasoningCount, unit: '段' }),
    row('messages', '对话消息', stats.messages, 'bg-context-messages')
  ]
})

// 每个区域标题右侧的字符数，与上方占比行同源
const sectionChars = (key) => breakdown.value.find((row) => row.key === key)?.value || 0

// 下方只有两个区域：工具定义单独成块，其余消息按请求里的真实顺序排列
const sections = computed(() => [
  {
    key: 'tools',
    label: '工具定义',
    kind: 'tool',
    items: requestTools.value,
    chars: sectionChars('tools'),
    empty: '最近一次请求未包含工具定义'
  },
  {
    key: 'messages',
    label: '本轮上下文',
    kind: 'message',
    items: panelMessages.value,
    chars: sectionChars('system') + sectionChars('reasoning') + sectionChars('toolCalls') + sectionChars('toolOutput') + sectionChars('messages'),
    empty: '本轮还没有消息'
  }
])

// 请求里的工具少于全集，说明本轮由技能限定了工具范围
const toolLimited = computed(() => (
  Boolean(latestRequest.value) && latestRequest.value.tools.length < AGENT_TOOL_NAMES.length
))

const formatTokens = (value) => (value >= 1000 ? `${(value / 1000).toFixed(1)}k` : String(value))

const formatNumber = (value) => Number(value || 0).toLocaleString()

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
      <!-- 请求参数：协议字段一眼可见，源码结构收进展开区 -->
      <section v-if="requestParams.length" class="space-y-1.5">
        <p class="eyebrow">请求参数</p>
        <dl class="grid grid-cols-[auto_1fr] items-baseline gap-x-3 gap-y-1 text-[11px]">
          <template v-for="row in requestParams" :key="row.key">
            <dt class="font-mono text-[10px] text-neutral-500 dark:text-neutral-400">{{ row.key }}</dt>
            <dd class="truncate text-neutral-800 dark:text-neutral-200" :title="row.text">{{ row.text }}</dd>
          </template>
        </dl>
        <details class="group">
          <summary class="flex cursor-pointer items-center gap-1 text-[11px] text-neutral-500 dark:text-neutral-400">
            <AppIcon name="chevronDown" :size="12" class="transition-transform group-open:rotate-180" />
            源码结构
          </summary>
          <pre class="mt-1.5 max-h-48 overflow-auto rounded-md border border-hairline bg-neutral-50 p-2 text-[10px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ requestParamsJson }}</pre>
        </details>
      </section>

      <!-- 上下文构成：占比条 + 明细，顶部先给最关心的用量 -->
      <section v-if="contextStats" class="space-y-1.5">
        <div class="flex items-baseline justify-between">
          <p class="eyebrow">上下文构成</p>
          <span class="text-sm tabular-nums text-neutral-900 dark:text-neutral-100">
            ≈ {{ formatTokens(contextStats.tokens) }}
            <span class="text-[11px] font-normal text-neutral-500 dark:text-neutral-400">tokens</span>
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
              <template v-if="row.count">{{ row.count }} {{ row.unit }} · </template>{{ formatNumber(row.value) }} 字符 · {{ row.percent }}%
            </span>
          </li>
        </ul>
      </section>

      <!-- 工具定义单独成块，其余消息按会话里的真实顺序排列 -->
      <section v-for="section in sections" :key="section.key" class="space-y-1.5">
        <div class="flex items-baseline justify-between gap-2">
          <p class="eyebrow">{{ section.label }}</p>
          <span class="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">
            {{ section.items.length }} 项 · {{ formatNumber(section.chars) }} 字符
          </span>
        </div>
        <p v-if="section.key === 'tools' && toolLimited" class="text-[11px] text-accent-700 dark:text-accent-300">受模式或技能限定</p>

        <!-- 工具定义：每条都可展开看完整 schema -->
        <div v-if="section.items.length" class="overflow-hidden rounded-lg border border-hairline dark:border-hairline-dark">
          <details v-for="(item, index) in section.items" :key="`${section.key}-${index}`"
            class="group border-b border-hairline last:border-b-0 dark:border-hairline-dark">
            <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
              <span v-if="section.kind === 'message'" class="shrink-0 tabular-nums text-neutral-400 dark:text-neutral-500">{{ index + 1 }}</span>
              <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">
                {{ section.kind === 'tool' ? item.label : requestMessageLabel(item) }}
              </span>
              <span class="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400"
                :class="section.kind === 'tool' ? 'font-mono text-[10px]' : ''">
                {{ section.kind === 'tool' ? item.name : requestMessageSummary(item) }}
              </span>
              <span v-if="section.kind !== 'tool' && hasReasoning(item)"
                class="shrink-0 rounded bg-accent-50 px-1 text-[10px] text-accent-700 dark:bg-accent-500/15 dark:text-accent-300">
                思考 {{ formatNumber(item.reasoning_content.length) }}
              </span>
              <AppIcon name="chevronDown" :size="12"
                class="shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
            </summary>
            <div v-if="section.kind === 'tool'"
              class="space-y-1.5 border-t border-hairline bg-neutral-50 p-2 dark:border-hairline-dark dark:bg-neutral-900">
              <p class="text-[11px] leading-4 text-neutral-600 dark:text-neutral-400">{{ item.description }}</p>
              <pre class="max-h-48 overflow-auto rounded bg-white p-2 text-[10px] leading-4 text-neutral-700 dark:bg-neutral-950 dark:text-neutral-300">{{ item.json }}</pre>
            </div>
            <pre v-else
              class="max-h-56 overflow-auto border-t border-hairline bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ requestMessageJson(item) }}</pre>
          </details>
        </div>
        <p v-else class="rounded-lg border border-dashed border-hairline px-3 py-2 text-[11px] leading-5 text-neutral-500 dark:border-hairline-dark dark:text-neutral-400">
          {{ section.empty }}
        </p>
      </section>

      <!-- 完整请求体：值原样展示，键按参数、工具、消息排列，便于逐字段核对 -->
      <section v-if="requestBodyJson" class="space-y-1.5 border-t border-hairline pt-3 dark:border-hairline-dark">
        <div class="flex items-baseline justify-between gap-2">
          <p class="eyebrow">完整请求体</p>
          <span class="text-[11px] tabular-nums text-neutral-500 dark:text-neutral-400">{{ formatNumber(requestBodyChars) }} 字符</span>
        </div>
        <details class="group overflow-hidden rounded-lg border border-hairline dark:border-hairline-dark">
          <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px]">
            <span class="shrink-0 font-medium text-neutral-800 dark:text-neutral-200">body</span>
            <span class="min-w-0 flex-1 truncate font-mono text-[10px] text-neutral-400 dark:text-neutral-500">参数 · tools · messages</span>
            <AppIcon name="chevronDown" :size="12"
              class="shrink-0 text-neutral-400 transition-transform group-open:rotate-180" />
          </summary>
          <pre class="max-h-72 overflow-auto border-t border-hairline bg-neutral-50 p-2 text-[10px] leading-4 text-neutral-700 dark:border-hairline-dark dark:bg-neutral-900 dark:text-neutral-300">{{ requestBodyJson }}</pre>
        </details>
      </section>

      <!-- 导出入口：会话记录与请求快照一起打包 -->
      <div class="flex items-center justify-between gap-2 border-t border-hairline pt-3 dark:border-hairline-dark">
        <p class="text-[11px] text-neutral-500 dark:text-neutral-400">
          <template v-if="panelMessages.length">本轮上下文 · {{ panelMessages.length }} 条消息</template>
          <template v-else>最近一次请求</template>
        </p>
        <button type="button" :disabled="!agent.messages.length"
          class="inline-flex shrink-0 items-center gap-1 rounded text-[11px] text-neutral-500 transition-colors hover:text-accent-700 disabled:opacity-40 dark:text-neutral-400 dark:hover:text-accent-300"
          @click="exportSession">
          <AppIcon name="download" :size="12" /> 导出会话
        </button>
      </div>

      <!-- 会话时间线：次要信息收进一行 -->
      <p class="border-t border-hairline pt-2 text-[11px] leading-5 text-neutral-400 dark:border-hairline-dark dark:text-neutral-500">
        创建 {{ formatDateTime(agent.activeSession?.createdAt) }} · 最后活动 {{ formatDateTime(agent.activeSession?.updatedAt) }}
        <template v-if="latestRequest"> · 最近请求 {{ formatDateTime(latestRequest.createdAt) }}</template>
      </p>
    </div>
  </div>
</template>
