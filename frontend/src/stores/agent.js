// 对话 Agent：组织系统提示、模型调用、工具执行与破坏性操作确认
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'
import { useTodoStore } from './todos'
import { useScheduleStore } from './schedules'
import { useLlmStore } from './llm'
import { createAgentToolRunner, DESTRUCTIVE_TOOLS } from '@/lib/agentTools'

const STORAGE_PREFIX = 'todoheap.agent.v1.'
const MAX_STEPS = 12
const MAX_STORED_MESSAGES = 60
const MAX_TOOL_RESULT_CHARS = 6000

const createId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
}

const formatNow = () => {
  const now = new Date()
  const pad = (value) => String(value).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}（${Intl.DateTimeFormat().resolvedOptions().timeZone}）`
}

const buildSystemPrompt = ({ selectedTaskId = null } = {}) => `你是 TodoHeap 的任务管理 Agent，可以直接读写当前登录用户的全部数据：任务（树形结构与回收站）、日程事件和用户偏好。

当前本地时间：${formatNow()}
${selectedTaskId != null ? `用户当前在界面上选中了任务 id ${selectedTaskId}；用户说“这个任务”时优先指它，但执行写操作前先用 get_todo 确认。` : ''}

工具使用规则：
- 涉及数据的问题先调用工具获取真实数据，不要凭空编造任务 id 或内容。
- id 必须来自工具返回结果；不确定 id 时先用 list_todos 或 list_trash 查找。
- 刚创建的任务 id 可能从本地临时值变为服务器 id；若后续更新失败，先用 list_todos 重新确认。
- 时间一律使用带时区的 ISO 8601，例如 2026-11-10T18:00:00+08:00；"明天下午三点"要换算成具体日期。
- 拆解任务时优先使用 create_todo 的 subtasks 一次创建子树，保持层级清晰。
- 删除、清理已完成、永久删除、清空回收站属于破坏性操作，系统会要求用户确认；调用前先说明影响。
- 操作完成后用简短中文总结改了什么，不要粘贴原始 JSON。
- 与任务管理无关的普通问题可以直接回答，不必调用工具。
- 回答保持简洁，用纯文本和短列表，不要使用 **、# 等 Markdown 记号。`

const loadStoredMessages = (userId) => {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${userId || 'anon'}`)
    const parsed = raw ? JSON.parse(raw) : null
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
      .map((message) => ({
        id: message.id || createId(),
        role: message.role,
        content: typeof message.content === 'string' ? message.content : '',
        toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
        createdAt: message.createdAt || new Date().toISOString()
      }))
  } catch {
    return []
  }
}

const truncate = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…（结果已截断）`
}

export const useAgentStore = defineStore('agent', () => {
  const messages = ref([])
  const running = ref(false)
  const error = ref('')
  const pendingApproval = ref(null)
  const activeUserId = ref(null)
  const context = ref({ selectedTaskId: null })

  let abortController = null
  let approvalResolver = null

  const hasMessages = computed(() => messages.value.length > 0)

  const persist = () => {
    if (typeof localStorage === 'undefined') return
    try {
      const trimmed = messages.value.slice(-MAX_STORED_MESSAGES)
      localStorage.setItem(
        `${STORAGE_PREFIX}${activeUserId.value || 'anon'}`,
        JSON.stringify(trimmed.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          toolCalls: message.toolCalls,
          createdAt: message.createdAt
        })))
      )
    } catch {
      // 存储空间不足时放弃持久化，本次会话仍可继续
    }
  }

  // 按用户恢复各自的对话，切换账号不会串上下文
  const init = (userId) => {
    const key = userId || 'anon'
    if (activeUserId.value === key) return
    activeUserId.value = key
    messages.value = loadStoredMessages(key)
  }

  const clear = () => {
    messages.value = []
    error.value = ''
    persist()
  }

  // 界面上选中的任务作为对话上下文，用户说“这个任务”时模型能对上号
  const setContext = (patch) => {
    context.value = { ...context.value, ...patch }
  }

  const toApiMessages = () => {
    const apiMessages = [{ role: 'system', content: buildSystemPrompt(context.value) }]
    messages.value.forEach((message) => {
      if (message.role === 'user') {
        apiMessages.push({ role: 'user', content: message.content })
        return
      }
      const calls = (message.toolCalls || []).filter((call) => call.result !== undefined)
      if (calls.length) {
        apiMessages.push({
          role: 'assistant',
          content: message.content || null,
          tool_calls: calls.map((call) => ({
            id: call.id,
            type: 'function',
            function: { name: call.name, arguments: call.arguments || '{}' }
          }))
        })
        calls.forEach((call) => {
          apiMessages.push({
            role: 'tool',
            tool_call_id: call.id,
            content: truncate(call.result)
          })
        })
      } else if (message.content) {
        apiMessages.push({ role: 'assistant', content: message.content })
      }
    })
    return apiMessages
  }

  const requestApproval = (call) => new Promise((resolve) => {
    pendingApproval.value = { callId: call.id, name: call.name, args: call.args }
    approvalResolver = resolve
  })

  const resolveApproval = (approved) => {
    pendingApproval.value = null
    const resolver = approvalResolver
    approvalResolver = null
    resolver?.(Boolean(approved))
  }

  const stop = () => {
    abortController?.abort()
    if (approvalResolver) resolveApproval(false)
  }

  const runToolCall = async (runner, call) => {
    let args = {}
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {}
    } catch {
      call.status = 'error'
      call.result = { ok: false, error: '工具参数不是合法 JSON' }
      persist()
      return
    }
    call.args = args

    if (DESTRUCTIVE_TOOLS.has(call.name)) {
      const approved = await requestApproval(call)
      if (!approved) {
        call.status = 'cancelled'
        call.result = { ok: false, cancelled: true, error: '用户取消了该操作' }
        persist()
        return
      }
    }

    call.status = 'running'
    persist()

    const result = await runner.run(call.name, args)
    call.result = result
    call.status = result?.ok === false ? 'error' : 'success'
    persist()
  }

  const send = async (text) => {
    const content = String(text || '').trim()
    if (!content || running.value || pendingApproval.value) return

    const llm = useLlmStore()
    if (!llm.isConfigured) {
      error.value = '请先在设置 → 模型接入中配置模型'
      return
    }

    const authStore = useAuthStore()
    init(authStore.user?.id)

    error.value = ''
    messages.value.push({ id: createId(), role: 'user', content, toolCalls: [], createdAt: new Date().toISOString() })
    persist()

    running.value = true
    abortController = new AbortController()
    const signal = abortController.signal

    try {
      const runner = createAgentToolRunner({
        todoStore: useTodoStore(),
        scheduleStore: useScheduleStore(),
        authStore
      })

      for (let step = 0; step < MAX_STEPS; step += 1) {
        if (signal.aborted) break

        const history = toApiMessages()
        const assistant = {
          id: createId(),
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdAt: new Date().toISOString(),
          streaming: true
        }
        messages.value.push(assistant)

        const reply = await llm.chat({
          messages: history,
          tools: runner.definitions,
          signal,
          onDelta: (delta) => {
            assistant.content += delta
          }
        })

        assistant.streaming = false
        assistant.content = (reply.content || assistant.content || '').trim()
        if (!reply.tool_calls?.length) {
          if (!assistant.content) {
            messages.value.pop()
            error.value = '模型没有返回内容，请重试或换一个模型'
          }
          persist()
          break
        }

        assistant.toolCalls = reply.tool_calls.map((call) => ({
          id: call.id,
          name: call.function.name,
          arguments: call.function.arguments,
          status: 'pending',
          result: undefined
        }))
        persist()

        for (const call of assistant.toolCalls) {
          if (signal.aborted) break
          await runToolCall(runner, call)
        }

        if (step === MAX_STEPS - 1) {
          error.value = '已达到单轮工具调用上限，请继续输入以推进任务'
        }
      }
    } catch (err) {
      if (err?.name === 'AbortError') {
        const last = messages.value[messages.value.length - 1]
        if (last?.role === 'assistant') {
          last.streaming = false
          if (!last.content && !last.toolCalls?.length) messages.value.pop()
        }
      } else {
        error.value = err?.message || '模型调用失败'
        const last = messages.value[messages.value.length - 1]
        if (last?.role === 'assistant' && !last.content && !last.toolCalls?.length && last.streaming) {
          messages.value.pop()
        }
      }
    } finally {
      running.value = false
      abortController = null
      persist()
    }
  }

  return {
    messages,
    running,
    error,
    pendingApproval,
    hasMessages,
    init,
    send,
    stop,
    clear,
    setContext,
    resolveApproval
  }
})
