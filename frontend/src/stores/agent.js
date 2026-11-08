// 对话 Agent：多会话管理、系统提示、模型调用、工具执行与破坏性操作确认
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'
import { useTodoStore } from './todos'
import { useScheduleStore } from './schedules'
import { useLlmStore } from './llm'
import { createAgentToolRunner, DESTRUCTIVE_TOOLS } from '@/lib/agentTools'

const STORAGE_PREFIX = 'todoheap.agent.v2.'
const LEGACY_STORAGE_PREFIX = 'todoheap.agent.v1.'
const MAX_SESSIONS = 20
const MAX_STEPS = 12
const MAX_STORED_MESSAGES = 80
const MAX_TOOL_RESULT_CHARS = 6000
const MAX_TITLE_LENGTH = 28
const DEFAULT_TITLE = '新对话'

const nowIso = () => new Date().toISOString()

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

const normalizeMessage = (message) => ({
  id: message.id || createId(),
  role: message.role,
  content: typeof message.content === 'string' ? message.content : '',
  toolCalls: Array.isArray(message.toolCalls) ? message.toolCalls : [],
  createdAt: message.createdAt || nowIso(),
  streaming: false
})

const normalizeMessages = (list) => (Array.isArray(list) ? list : [])
  .filter((message) => message && (message.role === 'user' || message.role === 'assistant'))
  .map(normalizeMessage)

// 标题取第一条用户消息，避免会话列表全是“新对话”
const titleFromMessages = (messages) => {
  const firstUser = messages.find((message) => message.role === 'user')
  const title = String(firstUser?.content || '').replace(/\s+/g, ' ').trim()
  return title ? title.slice(0, MAX_TITLE_LENGTH) : DEFAULT_TITLE
}

const createSession = (title = DEFAULT_TITLE, messages = []) => ({
  id: createId(),
  title,
  createdAt: nowIso(),
  updatedAt: nowIso(),
  messages
})

// 只保留最近若干条，并从用户消息处切分，避免留下孤立的 tool 结果
const trimMessages = (list) => {
  const items = Array.isArray(list) ? list : []
  if (items.length <= MAX_STORED_MESSAGES) return items

  const target = items.length - MAX_STORED_MESSAGES
  const cut = items.findIndex((message, index) => index >= target && message.role === 'user')
  return items.slice(cut === -1 ? target : cut)
}

// 优先读 v2；旧版单会话记录迁移成一个带标题的会话
const loadStoredState = (userId) => {
  if (typeof localStorage === 'undefined') return null
  const key = userId || 'anon'

  try {
    const raw = localStorage.getItem(`${STORAGE_PREFIX}${key}`)
    if (raw) {
      const parsed = JSON.parse(raw)
      const sessions = (Array.isArray(parsed?.sessions) ? parsed.sessions : [])
        .filter((session) => session && session.id)
        .map((session) => ({
          id: session.id,
          title: typeof session.title === 'string' && session.title.trim()
            ? session.title.trim()
            : DEFAULT_TITLE,
          createdAt: session.createdAt || nowIso(),
          updatedAt: session.updatedAt || session.createdAt || nowIso(),
          messages: normalizeMessages(session.messages)
        }))
      if (sessions.length) return { sessions, activeId: parsed.activeId }
    }

    const legacyRaw = localStorage.getItem(`${LEGACY_STORAGE_PREFIX}${key}`)
    if (legacyRaw) {
      const legacyMessages = normalizeMessages(JSON.parse(legacyRaw))
      if (legacyMessages.length) {
        return {
          sessions: [{
            id: createId(),
            title: titleFromMessages(legacyMessages),
            createdAt: nowIso(),
            updatedAt: nowIso(),
            messages: legacyMessages
          }]
        }
      }
    }
  } catch {
    return null
  }

  return null
}

// 内置技能：全局优化不是独立能力，只是给 Agent 的一段固定指令
const OPTIMIZE_PROMPT = `请对当前用户的所有任务做一次全局优化。
步骤：
1. 先用 list_todos 读取全部未完成任务，理解任务树、截止时间与难度。
2. 调整不合理的截止时间，让先后顺序合理；缺少时间的任务按需要补上。
3. 把过于笼统的任务拆成 3-6 个可执行子任务。
4. 合并重复或过碎的任务。
5. 最后创建一条「下一步执行建议」任务。
只调整确实需要改的内容，不要为了改动而改动；不要删除任务或清空回收站。完成后用简短中文说明本次改了什么。`

const truncate = (value) => {  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…（结果已截断）`
}

export const useAgentStore = defineStore('agent', () => {
  const messages = ref([])
  const sessions = ref([])
  const activeSessionId = ref(null)
  const running = ref(false)
  const error = ref('')
  const pendingApproval = ref(null)
  const activeUserId = ref(null)
  const context = ref({ selectedTaskId: null })

  let abortController = null
  let approvalResolver = null

  const activeSession = computed(() => (
    sessions.value.find((session) => session.id === activeSessionId.value) || null
  ))
  const hasMessages = computed(() => messages.value.length > 0)

  // 所有会话一起落盘；当前会话的实时消息与 session.messages 保持同一引用
  const persist = () => {
    if (typeof localStorage === 'undefined') return
    try {
      const active = activeSession.value
      if (active) {
        active.messages = trimMessages(messages.value)
        messages.value = active.messages
      }

      sessions.value.forEach((session) => {
        session.messages = trimMessages(session.messages)
      })
      sessions.value = [...sessions.value]
        .sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))

      localStorage.setItem(`${STORAGE_PREFIX}${activeUserId.value || 'anon'}`, JSON.stringify({
        version: 2,
        activeId: activeSessionId.value,
        sessions: sessions.value
      }))
      localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${activeUserId.value || 'anon'}`)
    } catch {
      // 存储空间不足时放弃持久化，本次会话仍可继续
    }
  }

  // 按用户恢复各自的会话，切换账号不会串上下文
  const init = (userId) => {
    const key = userId || 'anon'
    if (activeUserId.value === key) return
    activeUserId.value = key

    const stored = loadStoredState(key)
    if (stored?.sessions?.length) {
      sessions.value = stored.sessions
      const active = stored.sessions.find((session) => session.id === stored.activeId)
        || stored.sessions[0]
      activeSessionId.value = active.id
      messages.value = active.messages
    } else {
      const session = createSession()
      sessions.value = [session]
      activeSessionId.value = session.id
      messages.value = session.messages
    }

    error.value = ''
    persist()
  }

  const newSession = () => {
    if (running.value) stop()
    persist()

    // 超出上限时淘汰最久未使用的非当前会话
    if (sessions.value.length >= MAX_SESSIONS) {
      const victim = [...sessions.value]
        .filter((session) => session.id !== activeSessionId.value)
        .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))[0]
      if (victim) sessions.value = sessions.value.filter((session) => session.id !== victim.id)
    }

    const session = createSession()
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    messages.value = session.messages
    error.value = ''
    persist()
    return session.id
  }

  const switchSession = (id) => {
    if (!id || id === activeSessionId.value) return
    const target = sessions.value.find((session) => session.id === id)
    if (!target) return

    if (running.value) stop()
    persist()
    activeSessionId.value = id
    messages.value = target.messages
    error.value = ''
    persist()
  }

  const renameSession = (id, title) => {
    const session = sessions.value.find((item) => item.id === id)
    if (!session) return
    const next = String(title || '').trim().slice(0, 40)
    session.title = next || '未命名对话'
    persist()
  }

  const deleteSession = (id) => {
    const index = sessions.value.findIndex((session) => session.id === id)
    if (index === -1) return

    if (running.value) stop()
    const wasActive = activeSessionId.value === id
    sessions.value.splice(index, 1)

    if (sessions.value.length === 0) {
      const session = createSession()
      sessions.value = [session]
      activeSessionId.value = session.id
      messages.value = session.messages
    } else if (wasActive) {
      const next = sessions.value[0]
      activeSessionId.value = next.id
      messages.value = next.messages
    }

    error.value = ''
    persist()
  }

  const clear = () => {
    messages.value.splice(0)
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

  const send = async (text) => {    const content = String(text || '').trim()
    if (!content || running.value || pendingApproval.value) return

    const llm = useLlmStore()
    if (!llm.isConfigured) {
      error.value = '请先在设置 → 模型接入中配置模型'
      return
    }

    const authStore = useAuthStore()
    init(authStore.user?.id)

    // 生成期间切换会话时，只把收尾逻辑作用在原会话上
    const sessionId = activeSessionId.value
    const sessionOfTurn = () => sessions.value.find((session) => session.id === sessionId)
    const isCurrentSession = () => activeSessionId.value === sessionId

    error.value = ''
    messages.value.push({ id: createId(), role: 'user', content, toolCalls: [], createdAt: nowIso() })

    const session = activeSession.value
    if (session) {
      if (!session.title || session.title === DEFAULT_TITLE) {
        session.title = content.replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH)
      }
      session.updatedAt = nowIso()
    }
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
        if (signal.aborted || !isCurrentSession()) break

        const history = toApiMessages()
        const assistant = {
          id: createId(),
          role: 'assistant',
          content: '',
          toolCalls: [],
          createdAt: nowIso(),
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

        if (!isCurrentSession()) break

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
          if (signal.aborted || !isCurrentSession()) break
          await runToolCall(runner, call)
        }

        if (step === MAX_STEPS - 1) {
          error.value = '已达到单轮工具调用上限，请继续输入以推进任务'
        }
      }
    } catch (err) {
      // 会话被切走时只收尾原会话，不影响新会话的消息
      const target = isCurrentSession() ? messages.value : (sessionOfTurn()?.messages || [])
      const last = target[target.length - 1]

      if (err?.name === 'AbortError') {
        if (last?.role === 'assistant') {
          last.streaming = false
          if (!last.content && !last.toolCalls?.length) target.pop()
        }
      } else {
        if (isCurrentSession()) error.value = err?.message || '模型调用失败'
        if (last?.role === 'assistant' && last.streaming) {
          last.streaming = false
          if (!last.content && !last.toolCalls?.length) target.pop()
        }
      }
    } finally {
      running.value = false
      abortController = null
      persist()
    }
  }

  // 内置技能：复用空会话或新建会话，让 Agent 按固定指令执行全局优化
  const optimizeTasks = async () => {
    if (running.value || pendingApproval.value) return false

    const llm = useLlmStore()
    if (!llm.isConfigured) {
      error.value = '请先在设置 → 模型接入中配置模型'
      return false
    }

    init(useAuthStore().user?.id)
    if (!activeSession.value || messages.value.length > 0) newSession()

    const session = activeSession.value
    if (session) {
      session.title = '全局任务优化'
      session.updatedAt = nowIso()
    }
    persist()
    await send(OPTIMIZE_PROMPT)
    return true
  }

  return {
    messages,
    sessions,
    activeSessionId,
    activeSession,
    running,
    error,
    pendingApproval,
    hasMessages,
    init,
    send,
    stop,
    clear,
    setContext,
    resolveApproval,
    newSession,
    switchSession,
    renameSession,
    deleteSession,
    optimizeTasks
  }
})
