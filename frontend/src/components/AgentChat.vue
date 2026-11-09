<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agent'
import { useLlmStore } from '@/stores/llm'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useScheduleStore } from '@/stores/schedules'
import AppIcon from '@/components/AppIcon.vue'
import { AGENT_TOOL_LABELS } from '@/lib/agentTools'

const router = useRouter()
const agent = useAgentStore()

const props = defineProps({
  selectedTaskId: { type: [Number, String], default: null }
})
const emit = defineEmits(['open-sidebar'])
const llm = useLlmStore()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const scheduleStore = useScheduleStore()

// 输入草稿放在 store，侧栏点选技能时直接填入这里
const draft = computed({
  get: () => agent.draft,
  set: (value) => { agent.draft = value }
})
const inputRef = ref(null)
const scrollRef = ref(null)
const isComposing = ref(false)
const expandedCalls = ref(new Set())
const expandedRequests = ref(new Set())

const SUGGESTIONS = [
  { icon: 'list', text: '今天有哪些任务最该先做？' },
  { icon: 'sparkles', text: '把「准备季度汇报」拆成 5 个子任务，下周五前完成' },
  { icon: 'clock', text: '这周有哪些任务快逾期了？' },
  { icon: 'calendar', text: '帮我建一条明天 15:00-16:00 的评审会日程' },
  { icon: 'target', text: '帮我做一次全局任务优化', skillId: 'global-optimize' }
]

const toolLabel = (name) => AGENT_TOOL_LABELS[name] || name

const parseArguments = (call) => {
  if (call.args) return call.args
  try {
    return call.arguments ? JSON.parse(call.arguments) : {}
  } catch {
    return {}
  }
}

// 用最关键的参数概括一次工具调用，避免把完整 JSON 塞进气泡
const callSummary = (call) => {
  const args = parseArguments(call)
  const parts = []
  if (args.title) parts.push(args.title)
  if (args.query) parts.push(`“${args.query}”`)
  if (args.id != null) parts.push(`#${args.id}`)
  if (args.new_parent_id !== undefined) parts.push(`→ ${args.new_parent_id ?? '根层级'}`)
  if (args.start_at) parts.push(String(args.start_at).slice(0, 16).replace('T', ' '))
  return parts.join(' · ')
}

const statusIcon = (call) => {
  if (call.status === 'running') return 'loader'
  if (call.status === 'success') return 'check'
  if (call.status === 'error') return 'alert'
  if (call.status === 'cancelled') return 'close'
  return 'clock'
}

const statusClass = (call) => {
  if (call.status === 'running') return 'animate-spin text-neutral-400'
  if (call.status === 'success') return 'text-accent-600 dark:text-accent-400'
  if (call.status === 'error') return 'text-rose-600 dark:text-rose-400'
  if (call.status === 'cancelled') return 'text-neutral-400'
  return 'text-neutral-400'
}

const isExpanded = (id) => expandedCalls.value.has(id)

const toggleCall = (id) => {
  const next = new Set(expandedCalls.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedCalls.value = next
}

const prettyResult = (call) => {
  try {
    return JSON.stringify(call.result, null, 2)
  } catch {
    return String(call.result)
  }
}

const isRequestExpanded = (id) => expandedRequests.value.has(id)

const toggleRequest = (id) => {
  const next = new Set(expandedRequests.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  expandedRequests.value = next
}

// 还原每次请求的实际内容，保留系统提示与工具结果的原始换行
const formatRequest = (request) => {
  const lines = [
    `model: ${request.model || '未记录'}`,
    `temperature: ${request.temperature ?? '默认'}`,
    `tools: ${request.tools?.length ? request.tools.join(', ') : '（无）'}`,
    ''
  ]
  ;(request.messages || []).forEach((message, index) => {
    lines.push(`#${index + 1} ${message.role}`)
    if (message.content) lines.push(message.content)
    if (Array.isArray(message.tool_calls)) {
      message.tool_calls.forEach((call) => {
        lines.push(`tool_call ${call.function?.name}(${call.function?.arguments || '{}'})`)
      })
    }
    if (message.tool_call_id) lines.push(`tool_call_id: ${message.tool_call_id}`)
    lines.push('')
  })
  return lines.join('\n').trimEnd()
}

const canSend = computed(() => Boolean(draft.value.trim()) && !agent.running)

const lastMessage = computed(() => agent.messages[agent.messages.length - 1])

const sendDraft = () => {
  if (!canSend.value) return
  const content = draft.value
  draft.value = ''
  nextTick(() => autoResize())
  agent.send(content)
}

const sendSuggestion = (item) => {
  if (agent.running) return
  // 指向技能时把技能指令填入输入框，普通示例直接发送
  if (item.skillId) {
    const skill = agent.skills.find((entry) => entry.id === item.skillId)
    if (skill && agent.useSkill(skill.id)) return
  }
  agent.send(item.text)
}

const onEnter = (event) => {
  if (isComposing.value) return
  event.preventDefault()
  sendDraft()
}

const autoResize = () => {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 160)}px`
}

const scrollToBottom = () => {
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

const openProviderSettings = () => {
  router.push({ name: 'settings', query: { tab: 'provider' } })
}

const approvalDescription = computed(() => {
  const pending = agent.pendingApproval
  if (!pending) return ''
  return `${toolLabel(pending.name)} ${callSummary(pending)}`.trim()
})

watch(
  () => `${agent.messages.length}:${lastMessage.value?.content?.length || 0}:${lastMessage.value?.toolCalls?.length || 0}`,
  () => nextTick(scrollToBottom)
)

watch(draft, () => nextTick(autoResize))
watch(() => authStore.user?.id, (id) => agent.init(id))
watch(() => agent.activeSessionId, () => nextTick(scrollToBottom))
watch(() => props.selectedTaskId, (id) => agent.setContext({ selectedTaskId: id }), { immediate: true })

onMounted(() => {
  agent.init(authStore.user?.id)
  // 内置模式下先校准模型列表，避免继续使用已下线的旧型号
  if (llm.isBuiltin) llm.loadBuiltinModels()
  // 预取数据，工具调用时可直接命中本地缓存
  todoStore.fetchTodos()
  scheduleStore.fetchSchedules()
  nextTick(scrollToBottom)
})
</script>

<template>
  <div class="h-full flex flex-col min-h-0 w-full">
    <!-- 会话操作交给主区域顶栏承载，聊天区不再单独设置 header -->
    <Teleport defer to="#main-topbar-actions">
      <button class="chip max-w-[12rem] min-w-0 hover:border-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
        title="在侧栏管理会话" @click="emit('open-sidebar')">
        <AppIcon name="layers" :size="12" />
        <span class="truncate">{{ agent.activeSession?.title || '新对话' }}</span>
      </button>
      <div class="flex shrink-0 items-center gap-1.5">
        <button class="chip hover:border-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
          :title="llm.isConfigured ? '模型已接入，点击修改' : '尚未接入模型'" @click="openProviderSettings">
          <AppIcon name="key" :size="12" />
          <span class="max-w-[9rem] truncate">{{ llm.isConfigured ? (llm.isBuiltin ? `内置 · ${llm.activeModel}` : llm.activeModel) : '未接入模型' }}</span>
        </button>
        <button v-if="agent.hasMessages && !agent.running" class="p-1.5 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
          title="清空当前对话" @click="agent.clear()">
          <AppIcon name="trash" :size="14" />
        </button>
      </div>
    </Teleport>

    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto pt-3 pr-1 space-y-4">
      <!-- 未配置模型：引导到模型接入 -->
      <section v-if="!llm.isConfigured" class="panel p-5 text-center space-y-3">
        <AppIcon name="key" :size="22" class="mx-auto text-accent-700 dark:text-accent-400" />
        <div>
          <p class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">接入第三方大模型</p>
          <p class="mx-auto mt-1 max-w-sm text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            可以自带密钥直连 OpenAI 兼容服务（如 DeepSeek、Kimi、GLM、Qwen、Gemini、OpenRouter、本地 Ollama），也可以使用 TodoHeap 内置模型。
          </p>
        </div>
        <button class="btn-primary mx-auto" @click="openProviderSettings">配置模型</button>
      </section>

      <!-- 空会话：给出可直接点击的示例 -->
      <section v-else-if="!agent.hasMessages" class="space-y-2">
        <p class="text-xs text-neutral-500 dark:text-neutral-400">试试这样问：</p>
        <button v-for="item in SUGGESTIONS" :key="item.text"
          class="w-full text-left panel px-3 py-2.5 text-sm text-neutral-700 dark:text-neutral-300 hover:border-accent-300 dark:hover:border-accent-500/40 transition-colors flex items-start gap-2.5"
          @click="sendSuggestion(item)">
          <AppIcon :name="item.icon" :size="15" class="mt-0.5 opacity-70" />
          <span class="flex-1">{{ item.text }}</span>
          <AppIcon name="chevronRight" :size="14" class="mt-0.5 opacity-40" />
        </button>
      </section>

      <template v-for="message in agent.messages" :key="message.id">
        <!-- 用户消息：可展开查看这一轮实际发给模型的全部提示词 -->
        <div v-if="message.role === 'user'" class="space-y-1.5">
          <div class="flex justify-end">
            <div class="max-w-[85%] rounded-lg bg-accent-700 px-3 py-2 text-sm leading-6 text-white whitespace-pre-wrap break-words dark:bg-accent-500 dark:text-accent-950">
              {{ message.content }}
            </div>
          </div>
          <div v-if="message.requests?.length" class="flex justify-end">
            <button
              class="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-neutral-500 transition-colors hover:text-accent-700 dark:text-neutral-400 dark:hover:text-accent-300"
              :aria-expanded="isRequestExpanded(message.id)" @click="toggleRequest(message.id)">
              <AppIcon name="eye" :size="12" />
              {{ isRequestExpanded(message.id) ? '收起请求' : `查看请求 · ${message.requests.length} 次` }}
            </button>
          </div>
          <div v-if="isRequestExpanded(message.id)" class="space-y-1.5">
            <div v-for="(request, index) in message.requests" :key="index" class="panel p-2.5">
              <p class="mb-1 text-[11px] font-medium text-neutral-700 dark:text-neutral-300">
                第 {{ index + 1 }} 次请求 · {{ request.model || '未记录模型' }} · {{ request.tools?.length || 0 }} 个工具
              </p>
              <pre class="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">{{ formatRequest(request) }}</pre>
            </div>
          </div>
        </div>

        <!-- Agent 消息：文本 + 工具执行记录 -->
        <div v-else class="flex items-start gap-2">
          <div class="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center dark:bg-accent-500/15 dark:text-accent-300">
            <AppIcon name="sparkles" :size="13" />
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <p v-if="message.content" class="text-sm leading-6 whitespace-pre-wrap break-words text-neutral-800 dark:text-neutral-200">{{ message.content }}</p>

            <div v-for="call in message.toolCalls" :key="call.id"
              class="rounded-lg border border-hairline dark:border-hairline-dark px-2.5 py-1.5">
              <div class="flex items-center gap-2 text-xs">
                <AppIcon :name="statusIcon(call)" :size="13" :class="statusClass(call)" />
                <span class="font-medium text-neutral-800 dark:text-neutral-200">{{ toolLabel(call.name) }}</span>
                <span class="min-w-0 flex-1 truncate text-neutral-500 dark:text-neutral-400">{{ callSummary(call) }}</span>
                <button v-if="call.result !== undefined" class="shrink-0 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  @click="toggleCall(call.id)">
                  {{ isExpanded(call.id) ? '收起' : '详情' }}
                </button>
              </div>
              <pre v-if="isExpanded(call.id)"
                class="mt-2 max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px] leading-4 text-neutral-700 dark:bg-neutral-900 dark:text-neutral-300">{{ prettyResult(call) }}</pre>
            </div>

            <p v-if="message.streaming && !message.content && !message.toolCalls?.length"
              class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <AppIcon name="loader" :size="12" class="animate-spin" />
              正在思考…
            </p>
          </div>
        </div>
      </template>
    </div>

    <p v-if="agent.error" class="shrink-0 pt-2 text-xs text-rose-600 dark:text-rose-400 flex items-start gap-1.5">
      <AppIcon name="alert" :size="13" class="mt-0.5" />
      <span>{{ agent.error }}</span>
    </p>

    <!-- 破坏性操作确认 -->
    <section v-if="agent.pendingApproval" class="shrink-0 mt-2 panel border-amber-300 dark:border-amber-500/40 p-3 space-y-2">
      <div class="flex items-start gap-2">
        <AppIcon name="alert" :size="15" class="mt-0.5 text-amber-600 dark:text-amber-400" />
        <div class="min-w-0">
          <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">确认{{ approvalDescription }}？</p>
          <p class="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            这是破坏性操作，确认后才会执行。可先让 Agent 说明影响再决定。
          </p>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-ghost" @click="agent.resolveApproval(false)">取消</button>
        <button class="btn-primary" @click="agent.resolveApproval(true)">确认执行</button>
      </div>
    </section>

    <!-- 输入区 -->
    <div class="shrink-0 pt-2">
      <div class="panel p-2">
        <div class="flex items-end gap-2">
          <textarea ref="inputRef" v-model="draft" rows="1"
            class="flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-400"
            placeholder="告诉 Agent 要做什么…"
            :disabled="!llm.isConfigured"
            @input="autoResize"
            @keydown.enter.exact="onEnter"
            @compositionstart="isComposing = true"
            @compositionend="isComposing = false"></textarea>
          <button v-if="agent.running" class="btn-outline shrink-0" title="停止生成" @click="agent.stop()">
            <AppIcon name="stop" :size="14" />
            <span>停止</span>
          </button>
          <button v-else class="btn-primary shrink-0" :disabled="!canSend" title="发送" @click="sendDraft">
            <AppIcon name="send" :size="14" />
          </button>
        </div>
      </div>
      <p class="mt-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
        Enter 发送，Shift+Enter 换行
        <span class="text-neutral-300 dark:text-neutral-700">·</span>
        当前模型：{{ llm.activeModel || '未配置' }}
      </p>
    </div>
  </div>
</template>
