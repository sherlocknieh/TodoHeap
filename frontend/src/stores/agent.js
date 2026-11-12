// 对话 Agent：多会话管理、系统提示、模型调用、工具执行与破坏性操作确认
import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { useAuthStore } from './auth'
import { useTodoStore } from './todos'
import { useScheduleStore } from './schedules'
import { useLlmStore } from './llm'
import { createAgentToolRunner, CHOICE_TOOLS, CONFIRM_TOOLS, DESTRUCTIVE_TOOLS } from '@/lib/agentTools'
import {
  cloneDefaultSkills,
  createSkill,
  normalizeSkill,
  normalizeSkills
} from '@/lib/agentSkills'
import { fetchUserSettings, saveUserSettings } from '@/lib/userSettings'
import { buildChatRequestBody } from '@/lib/llmProvider'
import { hydrateImages, removeStoredImages } from '@/lib/agentImages'
import { DEFAULT_AGENT_MODE, findAgentMode, resolveAllowedTools } from '@/lib/agentModes'

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

// 用户用 @ 引用的任务与日程：作为本轮上下文写进系统提示，模型不必再猜
const formatMentions = (mentions) => {
  const list = Array.isArray(mentions) ? mentions.filter((item) => item?.type && item.id != null) : []
  if (!list.length) return ''
  const lines = list.map((item) => {
    if (item.type === 'todo') return `- 任务 id ${item.id}：${item.label}`
    if (item.type === 'schedule') return `- 日程 id ${item.id}：${item.label}${item.hint ? `（${item.hint}）` : ''}`
    return `- ${item.label}`
  })
  return `\n用户本轮通过 @ 引用了以下对象，优先围绕它们回答；涉及写操作前仍先用工具确认：\n${lines.join('\n')}\n`
}

// 本轮挂上的技能：指令写进系统提示，输入框只保留用户自己的文字
const formatSkills = (skills) => {
  const list = Array.isArray(skills) ? skills.filter((skill) => skill?.prompt) : []
  if (!list.length) return ''
  const blocks = list.map((skill) => `【${skill.name}】\n${skill.prompt}`)
  return `\n用户本轮挂载了以下技能，按其中的指令执行：\n${blocks.join('\n\n')}\n`
}

const buildSystemPrompt = ({ selectedTaskId = null, mentions = [], skills = [], mode = DEFAULT_AGENT_MODE } = {}) => `你是 TodoHeap 的任务管理 Agent，可以直接读写当前登录用户的全部数据：任务（树形结构与回收站）、日程事件，以及应用设置。

当前本地时间：${formatNow()}
${selectedTaskId != null ? `用户当前在界面上选中了任务 id ${selectedTaskId}；用户说“这个任务”时优先指它，但执行写操作前先用 get_todo 确认。` : ''}${formatMentions(mentions)}${formatSkills(skills)}${findAgentMode(mode).prompt ? `\n${findAgentMode(mode).prompt}\n` : ''}
工具使用规则：
- 涉及数据的问题先调用工具获取真实数据，不要凭空编造任务 id 或内容。
- id 必须来自工具返回结果；不确定 id 时先用 list_todos 或 list_trash 查找。
- 刚创建的任务 id 可能从本地临时值变为服务器 id；若后续更新失败，先用 list_todos 重新确认。
- 时间一律使用带时区的 ISO 8601，例如 2026-11-10T18:00:00+08:00；"明天下午三点"要换算成具体日期。
- 拆解任务时优先使用 create_todo 的 subtasks 一次创建子树，保持层级清晰。
- 删除、清理已完成、永久删除、清空回收站、重置或关闭日历订阅、删除技能属于破坏性操作，系统会要求用户确认；调用前先说明影响。
- 当前模式缺少所需工具时，在同一条回复里调用 switch_mode 申请切换，不要只让用户自己切换或等用户再发一条消息。
- 需要用户拍板（确认方案、选时间、选对象、二选一）时调用 ask_user 给出 2-6 个可直接执行的选项，界面会弹出面板让用户点选；不要只在正文里提问然后停下等回复。
- 操作完成后用简短中文总结改了什么，不要粘贴原始 JSON。
- 与任务管理无关的普通问题可以直接回答，不必调用工具。
- 回答保持简洁，用纯文本和短列表，不要使用 **、# 等 Markdown 记号。

应用设置规则：
- 改设置前先调用 list_app_settings 确认键名与当前值，不要猜键名。
- 可改：界面偏好（任务图方向、侧栏与详情面板开关、列表是否显示已完成）、模型参数（temperature）、技能（增删改）、日历订阅（重置或关闭）。
- 不可改：模型服务商、Base URL、API Key、账户密码与账号本身。用户要求这些时说明需要本人到设置页操作。
- 用户说"把界面调成…""以后都用…"这类偏好时，直接改对应设置并说明改了什么。`

// 图片只保留元数据，本体在 IndexedDB，避免会话记录撑爆 localStorage
const normalizeImages = (list) => (Array.isArray(list) ? list : [])
  .filter((image) => image && image.id)
  .map((image) => ({
    id: image.id,
    name: typeof image.name === 'string' ? image.name : '图片',
    mime: image.mime || 'image/png',
    width: Number(image.width) || 0,
    height: Number(image.height) || 0,
    size: Number(image.size) || 0,
    dataUrl: typeof image.dataUrl === 'string' ? image.dataUrl : ''
  }))

const normalizeMentions = (list) => (Array.isArray(list) ? list : [])
  .filter((item) => item && item.type && item.id != null)
  .map((item) => ({
    key: item.key || `${item.type}:${item.id}`,
    type: item.type,
    id: item.id,
    label: typeof item.label === 'string' ? item.label : '',
    hint: typeof item.hint === 'string' ? item.hint : ''
  }))

// 挂载的技能只保留发送所需字段，指令随消息一起留存
const normalizeAttachedSkills = (list) => (Array.isArray(list) ? list : [])
  .filter((skill) => skill && skill.id && skill.prompt)
  .map((skill) => ({
    id: skill.id,
    name: typeof skill.name === 'string' ? skill.name : '',
    icon: typeof skill.icon === 'string' ? skill.icon : '',
    prompt: String(skill.prompt),
    mode: typeof skill.mode === 'string' ? skill.mode : ''
  }))

const normalizeMessage = (message) => ({
  id: message.id || createId(),
  role: message.role,
  content: typeof message.content === 'string' ? message.content : '',
  images: normalizeImages(message.images),
  mentions: normalizeMentions(message.mentions),
  skills: normalizeAttachedSkills(message.skills),
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
  if (title) return title.slice(0, MAX_TITLE_LENGTH)
  return firstUser?.images?.length ? '图片对话' : DEFAULT_TITLE
}

// 带图消息按 OpenAI 多模态格式发送：文本在前，图片按顺序附后
const toUserContent = (message) => {
  const images = (message.images || []).filter((image) => image.dataUrl)
  if (!images.length) return message.content
  const parts = []
  if (message.content) parts.push({ type: 'text', text: message.content })
  images.forEach((image) => {
    parts.push({ type: 'image_url', image_url: { url: image.dataUrl } })
  })
  return parts
}

const createSession = (title = DEFAULT_TITLE, messages = [], mode = DEFAULT_AGENT_MODE) => ({
  id: createId(),
  title,
  mode,
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
          mode: findAgentMode(session.mode).id,
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
            mode: DEFAULT_AGENT_MODE,
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

const truncate = (value) => {
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  if (text.length <= MAX_TOOL_RESULT_CHARS) return text
  return `${text.slice(0, MAX_TOOL_RESULT_CHARS)}…（结果已截断）`
}

export const useAgentStore = defineStore('agent', () => {
  const messages = ref([])
  const sessions = ref([])
  const activeSessionId = ref(null)
  const running = ref(false)
  const error = ref('')
  // 输入草稿由聊天框维护，技能不再写入这里
  const draft = ref('')
  // 每个会话各自保留未发送的草稿，切换会话不会互相覆盖
  const drafts = ref({})
  // 本轮挂载的技能：随消息发送，输入框只保留用户自己的文字
  const attachedSkills = ref([])
  const pendingApproval = ref(null)
  // 选择面板：模型需要用户拍板时弹出，点选结果直接作为工具结果返回
  const pendingChoice = ref(null)
  const activeUserId = ref(null)
  const context = ref({ selectedTaskId: null })
  const skills = ref(cloneDefaultSkills())
  const skillsLoading = ref(false)
  const skillsError = ref('')

  let abortController = null
  let approvalResolver = null
  let choiceResolver = null
  let skillsLoadedFor = null
  let skillsRevision = 0
  let skillSaveChain = Promise.resolve()

  const activeSession = computed(() => (
    sessions.value.find((session) => session.id === activeSessionId.value) || null
  ))
  // 模式跟随会话：同一会话里切换后，后续请求都按新模式发送
  const activeMode = computed(() => findAgentMode(activeSession.value?.mode).id)
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

      // 请求快照只用于当前页面查看，落盘会随对话轮次成倍膨胀；图片本体存 IndexedDB
      localStorage.setItem(`${STORAGE_PREFIX}${activeUserId.value || 'anon'}`, JSON.stringify({
        version: 2,
        activeId: activeSessionId.value,
        sessions: sessions.value
      }, (key, value) => (key === 'requests' || key === 'dataUrl' ? undefined : value)))
      localStorage.removeItem(`${LEGACY_STORAGE_PREFIX}${activeUserId.value || 'anon'}`)
    } catch {
      // 存储空间不足时放弃持久化，本次会话仍可继续
    }
  }

  // 技能存 user_settings，与日历令牌共用一个 JSON；写前读最新值，避免覆盖其他字段
  const persistSkills = (next) => {
    skills.value = next
    skillsRevision += 1
    const userId = activeUserId.value
    if (!userId) return skillSaveChain

    skillSaveChain = skillSaveChain
      .then(async () => {
        const latest = await fetchUserSettings(userId)
        if (!latest.success) throw latest.error || new Error('读取用户设置失败')
        const saved = await saveUserSettings(userId, { ...latest.data, skills: next })
        if (!saved.success) throw saved.error || new Error('保存用户设置失败')
        skillsError.value = ''
      })
      .catch(() => {
        skillsError.value = '技能保存失败，请检查网络后重试'
      })
    return skillSaveChain
  }

  // 已保存过技能就恢复用户列表；从未保存则保留内置默认技能
  const loadSkills = async (userId) => {
    const key = userId || 'anon'
    if (skillsLoadedFor === key) return
    skillsLoadedFor = key
    skills.value = cloneDefaultSkills()
    if (!userId) return

    const revision = skillsRevision
    skillsLoading.value = true
    let result
    try {
      result = await fetchUserSettings(userId)
    } catch {
      result = { success: false }
    }
    skillsLoading.value = false
    // 加载期间切换了账号或本地已改动，丢弃这次结果
    if (activeUserId.value !== key || revision !== skillsRevision) return

    if (!result.success) {
      // 读取失败时保留默认技能，下次进入 AI 视图再重试
      skillsLoadedFor = null
      skillsError.value = '技能加载失败，请检查网络后重试'
      return
    }

    skillsError.value = ''
    skills.value = Array.isArray(result.data?.skills)
      ? normalizeSkills(result.data.skills)
      : cloneDefaultSkills()
  }

  const addSkill = (draft) => {
    const skill = createSkill(draft)
    if (!skill.name || !skill.prompt) return null
    persistSkills([...skills.value, skill])
    return skill
  }

  const updateSkill = (id, patch) => {
    const current = skills.value.find((skill) => skill.id === id)
    if (!current) return null
    const skill = normalizeSkill({ ...current, ...patch }, id)
    if (!skill) return null
    persistSkills(skills.value.map((item) => (item.id === id ? skill : item)))
    return skill
  }

  const detachSkill = (id) => {
    attachedSkills.value = attachedSkills.value.filter((item) => item.id !== id)
  }

  const deleteSkill = (id) => {
    if (!skills.value.some((skill) => skill.id === id)) return false
    persistSkills(skills.value.filter((skill) => skill.id !== id))
    detachSkill(id)
    return true
  }

  // 挂载技能：指令随本轮消息发送，并切到它绑定的模式
  const useSkill = (id) => {
    const skill = skills.value.find((item) => item.id === id)
    if (!skill) return false
    if (!attachedSkills.value.some((item) => item.id === skill.id)) {
      attachedSkills.value = [...attachedSkills.value, { ...skill }]
    }
    if (skill.mode) setMode(skill.mode)
    return true
  }

  // 按用户恢复各自的会话，切换账号不会串上下文
  const init = (userId) => {
    const key = userId || 'anon'
    if (activeUserId.value === key) {
      // 上次技能加载失败时，这里会再次尝试
      loadSkills(userId)
      return
    }
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
    draft.value = drafts.value[activeSessionId.value] || ''
    persist()
    hydrateImages(messages.value.flatMap((message) => message.images || []))
    loadSkills(userId)
  }

  const newSession = () => {
    if (running.value) stop()
    persist()

    // 超出上限时淘汰最久未使用的非当前会话
    if (sessions.value.length >= MAX_SESSIONS) {
      const victim = [...sessions.value]
        .filter((session) => session.id !== activeSessionId.value)
        .sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt)))[0]
      if (victim) {
        sessions.value = sessions.value.filter((session) => session.id !== victim.id)
        removeStoredImages(victim.messages.flatMap((message) => message.images || []))
      }
    }

    const session = createSession()
    sessions.value.unshift(session)
    activeSessionId.value = session.id
    messages.value = session.messages
    draft.value = ''
    attachedSkills.value = []
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
    draft.value = drafts.value[id] || ''
    attachedSkills.value = []
    error.value = ''
    persist()
    hydrateImages(messages.value.flatMap((message) => message.images || []))
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
    const [removed] = sessions.value.splice(index, 1)
    removeStoredImages(removed?.messages?.flatMap((message) => message.images || []))

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
    removeStoredImages(messages.value.flatMap((message) => message.images || []))
    messages.value.splice(0)
    error.value = ''
    setDraft('')
    attachedSkills.value = []
    persist()
  }

  // 界面上选中的任务作为对话上下文，用户说“这个任务”时模型能对上号
  const setContext = (patch) => {
    context.value = { ...context.value, ...patch }
  }

  const toApiMessages = (mentions = [], mode = DEFAULT_AGENT_MODE, tools = [], skills = []) => {
    // 工具范围只通过请求的 tools 字段下发，不再重复写进消息
    const apiMessages = [{ role: 'system', content: buildSystemPrompt({ ...context.value, mentions, skills, mode }) }]
    messages.value.forEach((message) => {
      if (message.role === 'user') {
        apiMessages.push({ role: 'user', content: toUserContent(message) })
        return
      }
      const calls = (message.toolCalls || []).filter((call) => call.result !== undefined)
      // 思考内容要原样回传：DeepSeek 等要求多轮里带上上一轮的 reasoning_content
      const reasoning = typeof message.reasoning === 'string' ? message.reasoning : ''
      if (calls.length) {
        apiMessages.push({
          role: 'assistant',
          content: message.content || null,
          ...(reasoning ? { reasoning_content: reasoning } : {}),
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
      } else if (message.content || reasoning) {
        apiMessages.push({
          role: 'assistant',
          content: message.content || '',
          ...(reasoning ? { reasoning_content: reasoning } : {})
        })
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

  const requestChoice = (call) => new Promise((resolve) => {
    const options = (Array.isArray(call.args?.options) ? call.args.options : [])
      .map((option) => String(option ?? '').trim())
      .filter(Boolean)
      .slice(0, 6)
    pendingChoice.value = { callId: call.id, question: String(call.args?.question || ''), options }
    choiceResolver = resolve
  })

  // 用户点选或取消：取消时返回空答案，让模型自行决定下一步
  const resolveChoice = (answer) => {
    pendingChoice.value = null
    const resolver = choiceResolver
    choiceResolver = null
    resolver?.(answer == null ? null : String(answer))
  }

  const stop = () => {
    abortController?.abort()
    if (approvalResolver) resolveApproval(false)
    if (choiceResolver) resolveChoice(null)
  }

  // 返回 true 表示本轮到此为止，不再请求模型
  const runToolCall = async (runner, call) => {
    let args = {}
    try {
      args = call.arguments ? JSON.parse(call.arguments) : {}
    } catch {
      call.status = 'error'
      call.result = { ok: false, error: '工具参数不是合法 JSON' }
      persist()
      return false
    }
    call.args = args

    // 选择类工具先弹面板，用户点选后把答案当作工具结果
    if (CHOICE_TOOLS.has(call.name)) {
      const answer = await requestChoice(call)
      call.status = answer == null ? 'cancelled' : 'success'
      call.result = answer == null
        ? { ok: false, cancelled: true, error: '用户没有选择' }
        : { ok: true, question: call.args?.question || '', answer }
      persist()
      // 用户取消提问即结束本轮，不再让模型接着说话
      return answer == null
    }

    if (DESTRUCTIVE_TOOLS.has(call.name) || CONFIRM_TOOLS.has(call.name)) {
      const approved = await requestApproval(call)
      if (!approved) {
        call.status = 'cancelled'
        call.result = { ok: false, cancelled: true, error: '用户取消了该操作' }
        persist()
        return false
      }
    }

    call.status = 'running'
    persist()

    const result = await runner.run(call.name, args)
    call.result = result
    call.status = result?.ok === false ? 'error' : 'success'
    persist()
    return false
  }

  // 一轮对话：从给定的用户消息出发，循环调用模型直到不再请求工具
  const startTurn = async ({ userMessage }) => {
    const llm = useLlmStore()
    const authStore = useAuthStore()

    // 生成期间切换会话时，只把收尾逻辑作用在原会话上
    const sessionId = activeSessionId.value
    const sessionOfTurn = () => sessions.value.find((session) => session.id === sessionId)
    const isCurrentSession = () => activeSessionId.value === sessionId

    error.value = ''
    running.value = true
    abortController = new AbortController()
    const signal = abortController.signal

    try {
      const runner = createAgentToolRunner({
        todoStore: useTodoStore(),
        scheduleStore: useScheduleStore(),
        authStore,
        llmStore: llm,
        agentStore: {
          skills,
          addSkill,
          updateSkill,
          deleteSkill,
          setMode,
          // 切换后要读到新模式，用 getter 而不是快照
          get activeMode() { return activeMode.value }
        }
      })
      // 工具集只由模式决定；模式可能被 switch_mode 改掉，每步重新解析
      const resolveTools = (modeId) => {
        const allowed = resolveAllowedTools(modeId)
        return allowed
          ? runner.definitions.filter((definition) => allowed.has(definition.function.name))
          : runner.definitions
      }

      for (let step = 0; step < MAX_STEPS; step += 1) {
        if (signal.aborted || !isCurrentSession()) break

        // 每步都按当前模式取工具与提示词：确认切换后本轮立即生效
        const stepMode = activeMode.value
        const tools = resolveTools(stepMode)
        const history = toApiMessages(userMessage.mentions, stepMode, tools, userMessage.skills)
        // 每次请求都留存快照：包含系统提示、完整历史与本次可用工具
        const requestRecord = {
          model: llm.activeModel,
          temperature: llm.config?.temperature,
          tools: tools.map((definition) => definition.function.name),
          messages: history,
          // 实际发出的请求体，与 llmProvider 共用同一份构造，界面据此展示参数
          body: buildChatRequestBody({
            model: llm.activeModel,
            messages: history,
            temperature: llm.config?.temperature,
            tools,
            reasoningEffort: llm.config?.reasoningEffort
          }),
          createdAt: nowIso(),
          usage: null
        }
        userMessage.requests.push(requestRecord)
        const assistant = {
          id: createId(),
          role: 'assistant',
          content: '',
          reasoning: '',
          toolCalls: [],
          createdAt: nowIso(),
          streaming: true
        }
        messages.value.push(assistant)

        // 流式内容单独累积：失败重试时要判断是否已经输出过文本
        let streamed = ''
        const onDelta = (delta) => {
          streamed += delta
          assistant.content = streamed
        }
        // 思考内容单独累积，正文与思考互不覆盖
        let reasoned = ''
        const onReasoning = (delta) => {
          reasoned += delta
          assistant.reasoning = reasoned
        }

        let reply
        try {
          reply = await llm.chat({ messages: history, tools, signal, onDelta, onReasoning })
        } catch (err) {
          // 只有尚未产生任何输出时才重试，避免把已流出的内容再发一遍
          if (err?.name === 'AbortError' || signal.aborted || streamed || reasoned) throw err
          reply = await llm.chat({ messages: history, tools, signal, onDelta, onReasoning })
        }
        // 服务商返回用量时补进快照，供上下文面板展示真实输入输出
        requestRecord.usage = reply.usage || null

        assistant.streaming = false
        assistant.content = (reply.content || assistant.content || '').trim()
        assistant.reasoning = (reply.reasoning || assistant.reasoning || '').trim()

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

        let stopTurn = false
        for (const call of assistant.toolCalls) {
          if (signal.aborted || !isCurrentSession()) break
          if (await runToolCall(runner, call)) stopTurn = true
        }
        // 用户取消提问或确认后直接收尾，保持空闲等下一句
        if (stopTurn) {
          persist()
          break
        }

        if (step === MAX_STEPS - 1) {
          error.value = `本轮已达到 ${MAX_STEPS} 步工具调用上限，已完成的操作均已保存；回复“继续”即可接着处理`
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

  // 发送一条新消息：挂载的技能只作用于这一轮
  const send = async (text, images = [], mentions = [], skills = attachedSkills.value) => {
    const content = String(text || '').trim()
    const attachments = normalizeImages(images)
    const references = (Array.isArray(mentions) ? mentions : [])
      .filter((item) => item?.type && item.id != null)
      .map((item) => ({ key: item.key || `${item.type}:${item.id}`, type: item.type, id: item.id, label: item.label || '', hint: item.hint || '' }))
    const attached = normalizeAttachedSkills(skills)
    if ((!content && !attachments.length && !attached.length) || running.value || pendingApproval.value || pendingChoice.value) return

    const llm = useLlmStore()
    if (!llm.isConfigured) {
      error.value = '请先在设置 → 模型接入中配置模型'
      return
    }

    init(useAuthStore().user?.id)

    // requests 保存这一轮实际发给模型的完整提示词，仅在内存中供界面展开
    const userMessage = { id: createId(), role: 'user', content, images: attachments, mentions: references, skills: attached, toolCalls: [], requests: [], createdAt: nowIso() }
    messages.value.push(userMessage)
    attachedSkills.value = []

    const session = activeSession.value
    if (session) {
      if (!session.title || session.title === DEFAULT_TITLE) {
        const title = content.replace(/\s+/g, ' ').slice(0, MAX_TITLE_LENGTH)
        session.title = title || (attachments.length ? '图片对话' : attached[0]?.name || DEFAULT_TITLE)
      }
      session.updatedAt = nowIso()
    }
    persist()

    await startTurn({ userMessage })
  }

  // 重新生成：丢弃最后一条回复，从最后一条用户消息重新请求
  const regenerate = async () => {
    if (running.value || pendingApproval.value || pendingChoice.value) return
    const lastUserIndex = messages.value.map((message) => message.role).lastIndexOf('user')
    if (lastUserIndex === -1) return

    const userMessage = messages.value[lastUserIndex]
    messages.value.splice(lastUserIndex + 1)
    userMessage.requests = []
    persist()
    await startTurn({ userMessage })
  }

  // 编辑后重发：截断该消息之后的内容，用新文本替换并重新请求
  const editAndResend = async (messageId, text) => {
    const content = String(text || '').trim()
    if (!content || running.value || pendingApproval.value || pendingChoice.value) return
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index === -1) return

    const images = normalizeImages(messages.value[index].images)
    const mentions = normalizeMentions(messages.value[index].mentions)
    const skills = normalizeAttachedSkills(messages.value[index].skills)
    messages.value.splice(index)
    const userMessage = { id: createId(), role: 'user', content, images, mentions, skills, toolCalls: [], requests: [], createdAt: nowIso() }
    messages.value.push(userMessage)
    persist()
    await startTurn({ userMessage })
  }

  // 删除单条消息，用于清理答非所问的回复
  const deleteMessage = (messageId) => {
    if (running.value) return
    const index = messages.value.findIndex((message) => message.id === messageId)
    if (index === -1) return
    const [removed] = messages.value.splice(index, 1)
    removeStoredImages(removed?.images)
    persist()
  }

  // 草稿按会话保存，切换会话时各自恢复
  const setDraft = (value) => {
    draft.value = value
    if (activeSessionId.value) drafts.value[activeSessionId.value] = value
  }

  // 切换工作模式：只影响当前会话，后续请求按新模式发送工具与提示词
  const setMode = (modeId) => {
    const session = activeSession.value
    if (!session) return
    const next = findAgentMode(modeId).id
    if (session.mode === next) return
    session.mode = next
    session.updatedAt = nowIso()
    persist()
  }

  return {
    messages,
    sessions,
    activeSessionId,
    activeSession,
    running,
    error,
    draft,
    drafts,
    attachedSkills,
    pendingApproval,
    pendingChoice,
    hasMessages,
    skills,
    skillsLoading,
    skillsError,
    init,
    send,
    stop,
    clear,
    setContext,
    resolveApproval,
    resolveChoice,
    newSession,
    switchSession,
    renameSession,
    deleteSession,
    addSkill,
    updateSkill,
    deleteSkill,
    useSkill,
    detachSkill,
    regenerate,
    editAndResend,
    deleteMessage,
    setDraft,
    setMode,
    activeMode
  }
})
