<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAgentStore } from '@/stores/agent'
import { useLlmStore } from '@/stores/llm'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useScheduleStore } from '@/stores/schedules'
import AppIcon from '@/components/AppIcon.vue'
import ComposerPicker from '@/components/ComposerPicker.vue'
import { AGENT_TOOL_LABELS } from '@/lib/agentTools'
import { isMcpToolName, mcpToolLabel } from '@/lib/mcpServers'
import { AGENT_MODES } from '@/lib/agentModes'
import { REASONING_EFFORTS } from '@/lib/llmProvider'
import { MAX_IMAGES_PER_MESSAGE, createImageAttachment } from '@/lib/agentImages'
import { onDidaAuthChange } from '@/lib/didaMcp'

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
  set: (value) => agent.setDraft(value)
})
const inputRef = ref(null)
const scrollRef = ref(null)
const composerRef = ref(null)
const isComposing = ref(false)
const expandedCalls = ref(new Set())
const expandedRequests = ref(new Set())
// 输入区浮层：模型与技能都从输入框就地选择，不打断对话
const openMenu = ref('')
const atBottom = ref(true)
const editingId = ref(null)
const editingText = ref('')
const copiedId = ref(null)
// 待发送图片：粘贴、拖入或选择文件后先在这里预览，发送时随消息一起提交
const pendingImages = ref([])
const imageError = ref('')
const imageInputRef = ref(null)
const dragging = ref(false)
// 图片预览：点开大图查看，点背景或按 Esc 关闭
const previewImage = ref(null)
// 输入区选择器：/ 命令与 @ 上下文共用，记录触发位置以便替换整段 token
const picker = ref({ kind: '', query: '', start: 0 })
const pickerIndex = ref(0)
// 已引用的上下文，发送时随消息一起交给模型
const mentions = ref([])

const SUGGESTIONS = [
  { icon: 'list', text: '今天有哪些任务最该先做？' },
  { icon: 'sparkles', text: '把「准备季度汇报」拆成 5 个子任务，下周五前完成' },
  { icon: 'clock', text: '这周有哪些任务快逾期了？' },
  { icon: 'calendar', text: '帮我建一条明天 15:00-16:00 的评审会日程' },
  { icon: 'target', text: '帮我做一次全局任务优化', skillId: 'global-optimize' }
]

// 外部工具名带服务前缀，展示时还原成「服务 / 工具」
const toolLabel = (name) => (isMcpToolName(name) ? mcpToolLabel(name) : AGENT_TOOL_LABELS[name] || name)

const parseArguments = (call) => {
  if (call.args) return call.args
  try {
    return call.arguments ? JSON.parse(call.arguments) : {}
  } catch {
    return {}
  }
}

// 外部工具参数结构由对方定义，取前两个标量值做概览
const mcpCallSummary = (args) => Object.values(args)
  .filter((value) => typeof value === 'string' || typeof value === 'number')
  .slice(0, 2)
  .map((value) => String(value).slice(0, 40))
  .join(' · ')

// 用最关键的参数概括一次工具调用，避免把完整 JSON 塞进气泡
const callSummary = (call) => {
  const args = parseArguments(call)
  if (isMcpToolName(call.name)) return mcpCallSummary(args)
  const parts = []
  if (args.title) parts.push(args.title)
  if (args.query) parts.push(`“${args.query}”`)
  if (args.id != null) parts.push(`#${args.id}`)
  if (args.new_parent_id !== undefined) parts.push(`→ ${args.new_parent_id ?? '根层级'}`)
  if (args.start_at) parts.push(String(args.start_at).slice(0, 16).replace('T', ' '))
  if (args.mode) parts.push(`→ ${args.mode}`)
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
  const body = request.body || {}
  const lines = [
    `model: ${body.model || request.model || '未记录'}`,
    `temperature: ${body.temperature ?? request.temperature ?? '默认'}`,
    `stream: ${body.stream === undefined ? '未记录' : String(Boolean(body.stream))}`,
    `tool_choice: ${body.tool_choice || '（未发送）'}`,
    `tools: ${request.tools?.length ? request.tools.join(', ') : '（无）'}`,
    ''
  ]
  ;(request.messages || []).forEach((message, index) => {
    lines.push(`#${index + 1} ${message.role}`)
    if (typeof message.content === 'string') {
      if (message.content) lines.push(message.content)
    } else if (Array.isArray(message.content)) {
      // 多模态消息：文本原样展开，图片只标注数量与尺寸
      message.content.forEach((part) => {
        if (part.type === 'text' && part.text) lines.push(part.text)
        if (part.type === 'image_url') lines.push('[图片]')
      })
    }
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

const canSend = computed(() => (
  (Boolean(draft.value.trim()) || pendingImages.value.length > 0 || agent.attachedSkills.length > 0) && !agent.running
))

const lastMessage = computed(() => agent.messages[agent.messages.length - 1])

// 输入区模型选择：内置模式取网关列表，自带密钥取预设型号
const modelOptions = computed(() => {
  if (llm.isBuiltin) return llm.builtinModels
  return llm.presets.find((preset) => preset.id === llm.config?.presetId)?.models || []
})

const switchModel = (model) => {
  if (!model || model === llm.activeModel) return
  llm.update(llm.isBuiltin ? { builtinModel: model } : { model })
  openMenu.value = ''
}

// 思考等级：关闭时让 DeepSeek 走非思考模式，其余值原样下发给模型
const reasoningEffort = computed(() => llm.config?.reasoningEffort || 'off')

const reasoningLabel = computed(() => (
  REASONING_EFFORTS.find((item) => item.id === reasoningEffort.value)?.label || '关闭'
))

const switchReasoningEffort = (id) => {
  llm.update({ reasoningEffort: id })
  openMenu.value = ''
}

// 工作模式：Build 可读写，Plan 只读，切换后下一轮请求即按新模式发送
const activeModeLabel = computed(() => (
  AGENT_MODES.find((mode) => mode.id === agent.activeMode)?.label || 'Build'
))

const modeLabel = (id) => AGENT_MODES.find((mode) => mode.id === id)?.label || ''

const switchMode = (mode) => {
  agent.setMode(mode.id)
  openMenu.value = ''
}

const toggleMenu = (name) => {
  openMenu.value = openMenu.value === name ? '' : name
  // 菜单与 / @ 选择器互斥，避免两层浮层叠在一起
  if (openMenu.value) closePicker()
}

// 点空白处收起浮层，避免菜单挡住对话
const onDocumentPointerDown = (event) => {
  if (!openMenu.value) return
  if (composerRef.value?.contains(event.target)) return
  openMenu.value = ''
}

const applySkill = (skill) => {
  agent.useSkill(skill.id)
  openMenu.value = ''
  nextTick(() => inputRef.value?.focus())
}

const sendDraft = () => {
  if (!canSend.value) return
  const content = draft.value
  const images = pendingImages.value
  const context = mentions.value
  const skills = agent.attachedSkills
  draft.value = ''
  pendingImages.value = []
  mentions.value = []
  imageError.value = ''
  closePicker()
  nextTick(() => autoResize())
  agent.send(content, images, context, skills)
}

// 图片统一走这里入库：超出数量上限或格式不支持时给出提示，不打断已选中的图片
const addImages = async (files) => {
  const list = Array.from(files || []).filter(Boolean)
  if (!list.length) return
  imageError.value = ''

  const room = MAX_IMAGES_PER_MESSAGE - pendingImages.value.length
  if (room <= 0) {
    imageError.value = `每条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片`
    return
  }

  const accepted = []
  for (const file of list.slice(0, room)) {
    try {
      accepted.push(await createImageAttachment(file))
    } catch (err) {
      imageError.value = err?.message || '图片处理失败'
    }
  }
  if (list.length > room) imageError.value = `每条消息最多 ${MAX_IMAGES_PER_MESSAGE} 张图片`
  pendingImages.value = [...pendingImages.value, ...accepted]
}

const removeImage = (id) => {
  pendingImages.value = pendingImages.value.filter((image) => image.id !== id)
  imageError.value = ''
}

const openPreview = (image) => {
  if (!image?.dataUrl) return
  previewImage.value = image
}

const closePreview = () => {
  previewImage.value = null
}

// 预览打开时用 Esc 关闭，避免与输入框的 Esc 停止生成冲突
const onDocumentKeydown = (event) => {
  if (event.key === 'Escape' && previewImage.value) {
    event.stopPropagation()
    closePreview()
  }
}

const pickImages = () => imageInputRef.value?.click()

// + 菜单：输入框工具条的鼠标入口，附件挂载与技能都在这里
const PLUS_MENU = [
  { key: 'image', label: '图片和文件', hint: 'Ctrl+U', icon: 'image', action: 'image' },
  { key: 'skill', label: '挂载技能', icon: 'target', action: 'skill' },
  { key: 'context', label: '引用任务或日程', hint: '@', icon: 'link', action: 'context' }
]

const runPlusEntry = (entry) => {
  openMenu.value = ''
  if (entry.action === 'image') {
    pickImages()
    return
  }
  if (entry.action === 'skill') {
    openMenu.value = 'skill'
    return
  }
  if (entry.action === 'context') {
    picker.value = { kind: 'context', query: '', start: draft.value.length }
    pickerIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  }
}

const onImagePicked = async (event) => {
  await addImages(event.target.files)
  event.target.value = ''
}

// 粘贴截图：只在剪贴板里确实有图片时接管，普通文本粘贴不受影响
const onPaste = (event) => {
  const files = Array.from(event.clipboardData?.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter(Boolean)
  if (!files.length) return
  event.preventDefault()
  addImages(files)
}

const onDragOver = (event) => {
  if (!event.dataTransfer?.types?.includes('Files')) return
  event.preventDefault()
  dragging.value = true
}

const onDragLeave = (event) => {
  if (composerRef.value?.contains(event.relatedTarget)) return
  dragging.value = false
}

const onDrop = (event) => {
  dragging.value = false
  const files = Array.from(event.dataTransfer?.files || []).filter((file) => file.type.startsWith('image/'))
  if (!files.length) return
  event.preventDefault()
  addImages(files)
}

const sendSuggestion = (item) => {
  if (agent.running) return
  // 指向技能时挂上该技能再发送，普通示例直接发送
  if (item.skillId) {
    const skill = agent.skills.find((entry) => entry.id === item.skillId)
    if (skill && agent.useSkill(skill.id)) {
      agent.send(item.text, [], [], agent.attachedSkills)
      return
    }
  }
  agent.send(item.text)
}

// 斜杠命令：都是「执行一个动作」，与 @ 的「引用一个对象」区分开
const COMMANDS = [
  { key: 'cmd:image', label: '添加图片和文件', hint: 'Ctrl+U', icon: 'image', action: 'image' },
  { key: 'cmd:skill', label: '挂载技能', icon: 'target', action: 'skill' },
  { key: 'cmd:context', label: '引用任务或日程', hint: '@', icon: 'link', action: 'context' },
  { key: 'cmd:new', label: '新建会话', icon: 'plus', action: 'new' },
  { key: 'cmd:clear', label: '清空当前对话', icon: 'trash', action: 'clear' },
  { key: 'cmd:model', label: '切换模型', icon: 'sparkles', action: 'model' },
  { key: 'cmd:settings', label: '模型接入设置', icon: 'sliders', action: 'settings' }
]

// @ 上下文候选：只引用任务与日程这类数据对象，技能走独立入口
const contextItems = computed(() => {
  const items = []
  todoStore.todos.forEach((todo) => {
    items.push({
      key: `todo:${todo.id}`,
      type: 'todo',
      id: todo.id,
      label: todo.title || '未命名任务',
      hint: `#${todo.id}`,
      icon: 'list',
      group: '任务'
    })
  })
  scheduleStore.schedules.forEach((event) => {
    items.push({
      key: `schedule:${event.id}`,
      type: 'schedule',
      id: event.id,
      label: event.title || '未命名日程',
      hint: String(event.start_at || '').slice(5, 16).replace('T', ' '),
      icon: 'calendar',
      group: '日程'
    })
  })
  return items
})

const matchesQuery = (text, query) => !query || String(text).toLowerCase().includes(query.toLowerCase())

const pickerItems = computed(() => {
  const query = picker.value.query
  if (picker.value.kind === 'command') {
    return COMMANDS.filter((command) => matchesQuery(command.label, query))
  }
  if (picker.value.kind === 'context') {
    return contextItems.value
      .filter((item) => matchesQuery(item.label, query) || matchesQuery(item.hint, query))
      .slice(0, 40)
  }
  return []
})

const pickerTitle = computed(() => {
  if (picker.value.kind === 'command') return '命令'
  if (picker.value.kind === 'context') return '引用任务或日程'
  return ''
})

const closePicker = () => {
  picker.value = { kind: '', query: '', start: 0 }
  pickerIndex.value = 0
}

// 光标前的 token 决定弹出哪个选择器：行首或空白后的 / 与 @ 才触发
const syncPicker = () => {
  const el = inputRef.value
  if (!el) return
  const caret = el.selectionStart ?? 0
  const before = draft.value.slice(0, caret)
  const match = before.match(/(^|\s)([/@])([^\s/@]*)$/)
  if (!match) {
    closePicker()
    return
  }
  const kind = match[2] === '/' ? 'command' : 'context'
  const query = match[3]
  const start = caret - query.length - 1
  // 选择器打开时收起 + 菜单，两层浮层不叠加
  openMenu.value = ''
  if (picker.value.kind !== kind || picker.value.start !== start) pickerIndex.value = 0
  picker.value = { kind, query, start }
}

// 用选中项替换掉触发用的 token，光标落在插入内容之后
const replaceToken = (text) => {
  const el = inputRef.value
  const caret = el?.selectionStart ?? draft.value.length
  const before = draft.value.slice(0, picker.value.start)
  const after = draft.value.slice(caret)
  draft.value = `${before}${text}${after}`
  closePicker()
  nextTick(() => {
    const position = before.length + text.length
    el?.focus()
    el?.setSelectionRange(position, position)
    autoResize()
  })
}

const addMention = (item) => {
  if (!mentions.value.some((entry) => entry.key === item.key)) {
    mentions.value = [...mentions.value, item]
  }
  replaceToken('')
}

const removeMention = (key) => {
  mentions.value = mentions.value.filter((entry) => entry.key !== key)
}

const runCommand = (command) => {
  replaceToken('')
  if (command.action === 'image') pickImages()
  else if (command.action === 'skill') openMenu.value = 'skill'
  else if (command.action === 'context') {
    picker.value = { kind: 'context', query: '', start: draft.value.length }
    pickerIndex.value = 0
    nextTick(() => inputRef.value?.focus())
  } else if (command.action === 'new') agent.newSession()
  else if (command.action === 'clear') agent.clear()
  else if (command.action === 'model') openMenu.value = 'model'
  else if (command.action === 'settings') openProviderSettings()
}

const selectPickerItem = (item) => {
  if (picker.value.kind === 'command') runCommand(item)
  else addMention(item)
}

const movePicker = (delta) => {
  const total = pickerItems.value.length
  if (!total) return
  pickerIndex.value = (pickerIndex.value + delta + total) % total
}

const onComposerInput = () => {
  autoResize()
  syncPicker()
}

const onComposerClick = () => {
  // 点回输入框时收起 + 菜单，避免浮层挡住正文
  openMenu.value = ''
  syncPicker()
}

const onEnter = (event) => {
  if (isComposing.value) return
  event.preventDefault()
  sendDraft()
}

// 输入框内快捷键：选择器打开时上下键与回车交给它，Esc 逐层收起
const onComposerKeydown = (event) => {
  if (picker.value.kind) {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      movePicker(event.key === 'ArrowDown' ? 1 : -1)
      return
    }
    if (event.key === 'Enter' || event.key === 'Tab') {
      const item = pickerItems.value[pickerIndex.value]
      event.preventDefault()
      if (item) selectPickerItem(item)
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      closePicker()
      return
    }
  }
  if (event.key === 'Escape') {
    if (openMenu.value) {
      openMenu.value = ''
      return
    }
    if (agent.running) agent.stop()
    return
  }
  if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
    event.preventDefault()
    sendDraft()
    return
  }
  if (event.key === 'Enter' && !event.shiftKey) {
    onEnter(event)
  }
}

const autoResize = () => {
  const el = inputRef.value
  if (!el) return
  el.style.height = 'auto'
  el.style.height = `${Math.min(el.scrollHeight, 200)}px`
}

const scrollToBottom = () => {
  const el = scrollRef.value
  if (el) el.scrollTop = el.scrollHeight
}

// 用户向上翻阅历史时不再强制跟随流式输出
const onScroll = () => {
  const el = scrollRef.value
  if (!el) return
  atBottom.value = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

const copyMessage = async (message) => {
  try {
    await navigator.clipboard.writeText(message.content || '')
    copiedId.value = message.id
    setTimeout(() => { if (copiedId.value === message.id) copiedId.value = null }, 1500)
  } catch {
    // 剪贴板不可用时保持静默，用户仍可手动选中复制
  }
}

const startEdit = (message) => {
  if (agent.running) return
  editingId.value = message.id
  editingText.value = message.content
}

const cancelEdit = () => {
  editingId.value = null
  editingText.value = ''
}

const submitEdit = async () => {
  const id = editingId.value
  const text = editingText.value.trim()
  if (!id || !text) return
  cancelEdit()
  await agent.editAndResend(id, text)
}

const canRegenerate = computed(() => (
  !agent.running && agent.messages.some((message) => message.role === 'user')
))

const regenerate = () => {
  if (!canRegenerate.value) return
  agent.regenerate()
}

// 步数上限只是本轮被截断，接着跑而不是丢弃已完成的回复
const continueTurn = () => {
  if (!canRegenerate.value) return
  agent.continueTurn()
}

const openProviderSettings = () => {
  router.push({ name: 'settings', query: { tab: 'provider' } })
}

const approvalDescription = computed(() => {
  const pending = agent.pendingApproval
  if (!pending) return ''
  return `${toolLabel(pending.name)} ${callSummary(pending)}`.trim()
})

// 切换模式不是破坏性操作，确认文案要说清影响范围
const isModeSwitch = computed(() => agent.pendingApproval?.name === 'switch_mode')
// 外部 MCP 工具未声明只读时也要确认，文案与外置服务相关
const isMcpCall = computed(() => isMcpToolName(agent.pendingApproval?.name))

const modeSwitchTarget = computed(() => {
  const args = agent.pendingApproval?.args || {}
  return AGENT_MODES.find((mode) => mode.id === args.mode)?.label || 'Build'
})

// 确认文案按目标模式的工具范围说明影响
const modeSwitchHint = computed(() => {
  const mode = AGENT_MODES.find((item) => item.id === agent.pendingApproval?.args?.mode)
  if (!mode) return '确认后按新模式发送工具。'
  return mode.tools ? `确认后只能使用：${mode.description}。` : '确认后可以读写任务、日程与设置。'
})

watch(
  () => `${agent.messages.length}:${lastMessage.value?.content?.length || 0}:${lastMessage.value?.toolCalls?.length || 0}`,
  () => {
    // 用户正在回看历史时不打断阅读，只在自己贴底时跟随
    if (atBottom.value) nextTick(scrollToBottom)
  }
)

watch(draft, () => nextTick(autoResize))
// 账号就绪后再补齐 MCP 服务：授权回跳时用户信息可能晚于组件挂载
const bootstrapMcp = () => {
  agent.completePendingPreset().finally(() => agent.refreshMcpServers())
}

// 授权在新标签页完成，原页面收到通知后补上待添加的服务，不必刷新
let stopDidaAuthWatch = () => {}
const watchDidaAuth = () => {
  stopDidaAuthWatch()
  stopDidaAuthWatch = onDidaAuthChange((detail) => {
    if (detail?.status === 'connected') bootstrapMcp()
  })
}

watch(() => authStore.user?.id, (id) => {
  agent.init(id)
  bootstrapMcp()
})
watch(() => agent.activeSessionId, () => {
  cancelEdit()
  openMenu.value = ''
  closePreview()
  nextTick(() => {
    autoResize()
    scrollToBottom()
  })
})
watch(() => props.selectedTaskId, (id) => agent.setContext({ selectedTaskId: id }), { immediate: true })

onMounted(() => {
  watchDidaAuth()
  agent.init(authStore.user?.id)
  // 授权回跳后先补上待添加的内置服务，再补齐其余服务的外部工具
  bootstrapMcp()
  // 内置模式下先校准模型列表，避免继续使用已下线的旧型号
  if (llm.isBuiltin) llm.loadBuiltinModels()
  // 预取数据，工具调用时可直接命中本地缓存
  todoStore.fetchTodos()
  scheduleStore.fetchSchedules()
  document.addEventListener('pointerdown', onDocumentPointerDown)
  document.addEventListener('keydown', onDocumentKeydown, true)
  nextTick(() => {
    autoResize()
    scrollToBottom()
  })
})

onUnmounted(() => {
  stopDidaAuthWatch()
  document.removeEventListener('pointerdown', onDocumentPointerDown)
  document.removeEventListener('keydown', onDocumentKeydown, true)
})
</script>

<template>
  <div class="relative h-full flex flex-col min-h-0 w-full">
    <!-- 会话操作交给主区域顶栏承载，聊天区不再单独设置 header -->
    <Teleport defer to="#main-topbar-actions">
      <button class="chip max-w-[12rem] min-w-0 hover:border-accent-400 hover:text-accent-700 dark:hover:text-accent-300"
        title="在侧栏管理会话" @click="emit('open-sidebar')">
        <AppIcon name="layers" :size="12" />
        <span class="truncate">{{ agent.activeSession?.title || '新对话' }}</span>
      </button>
      <button v-if="agent.hasMessages && !agent.running" class="p-1.5 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300"
        title="清空当前对话" @click="agent.clear()">
        <AppIcon name="trash" :size="14" />
      </button>
    </Teleport>

    <div ref="scrollRef" class="flex-1 min-h-0 overflow-y-auto pt-3 pr-1 space-y-4" @scroll.passive="onScroll">
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
        <!-- 用户消息：可编辑重发，也可展开查看这一轮实际发给模型的全部提示词 -->
        <div v-if="message.role === 'user'" class="group space-y-1.5">
          <div v-if="editingId === message.id" class="panel p-2 space-y-2">
            <textarea v-model="editingText" rows="3"
              class="w-full resize-none bg-transparent px-1 py-1 text-sm leading-6 text-neutral-900 outline-none dark:text-neutral-100"
              @keydown.enter.exact.prevent="submitEdit" @keydown.esc="cancelEdit"></textarea>
            <div class="flex justify-end gap-1.5">
              <button class="btn-ghost text-xs" @click="cancelEdit">取消</button>
              <button class="btn-primary text-xs" :disabled="!editingText.trim()" @click="submitEdit">重新发送</button>
            </div>
          </div>
          <template v-else>
            <div class="flex justify-end">
              <div class="max-w-[85%] space-y-1.5">
                <!-- 已发送消息的附件：技能、引用与图片同排展示 -->
                <div v-if="message.skills?.length || message.mentions?.length"
                  class="flex flex-wrap items-center justify-end gap-1">
                  <span v-for="skill in message.skills" :key="`skill:${skill.id}`"
                    class="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-accent-300 px-1.5 py-0.5 text-[11px] text-accent-800 dark:border-accent-500/40 dark:text-accent-200">
                    <AppIcon :name="skill.icon || 'sparkles'" :size="10" class="opacity-70" />
                    <span class="truncate">{{ skill.name }}</span>
                  </span>
                  <span v-for="item in message.mentions" :key="`mention:${item.key}`"
                    class="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-hairline px-1.5 py-0.5 text-[11px] text-neutral-600 dark:border-hairline-dark dark:text-neutral-300">
                    <AppIcon :name="item.type === 'schedule' ? 'calendar' : 'list'" :size="10" class="opacity-70" />
                    <span class="truncate">{{ item.label }}</span>
                  </span>
                </div>
                <div v-if="message.images?.length" class="flex flex-wrap justify-end gap-1.5">
                  <button v-for="image in message.images" :key="image.id" type="button"
                    class="overflow-hidden rounded-lg border border-hairline transition-opacity hover:opacity-90 dark:border-hairline-dark"
                    :title="image.dataUrl ? '查看大图' : '图片已不在本机'" @click="openPreview(image)">
                    <img v-if="image.dataUrl" :src="image.dataUrl" :alt="image.name"
                      class="max-h-40 max-w-[12rem] object-cover" />
                    <span v-else class="flex h-16 w-16 items-center justify-center text-neutral-400 dark:text-neutral-500">
                      <AppIcon name="image" :size="16" />
                    </span>
                  </button>
                </div>
                <div v-if="message.content"
                  class="rounded-lg bg-accent-700 px-3 py-2 text-sm leading-6 text-white whitespace-pre-wrap break-words dark:bg-accent-500 dark:text-accent-950">
                  {{ message.content }}
                </div>
              </div>
            </div>
            <div class="flex items-center justify-end gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button class="rounded p-1 text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300"
                :title="copiedId === message.id ? '已复制' : '复制'" @click="copyMessage(message)">
                <AppIcon :name="copiedId === message.id ? 'check' : 'copy'" :size="12" />
              </button>
              <button v-if="!agent.running" class="rounded p-1 text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300"
                title="编辑并重新发送" @click="startEdit(message)">
                <AppIcon name="edit" :size="12" />
              </button>
              <button v-if="message.requests?.length"
                class="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[11px] text-neutral-500 transition-colors hover:text-accent-700 dark:text-neutral-400 dark:hover:text-accent-300"
                :aria-expanded="isRequestExpanded(message.id)" @click="toggleRequest(message.id)">
                <AppIcon name="eye" :size="12" />
                {{ isRequestExpanded(message.id) ? '收起请求' : `请求 · ${message.requests.length}` }}
              </button>
            </div>
          </template>
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
        <div v-else class="group flex items-start gap-2">
          <div class="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center dark:bg-accent-500/15 dark:text-accent-300">
            <AppIcon name="sparkles" :size="13" />
          </div>
          <div class="flex-1 min-w-0 space-y-1.5">
            <!-- 思考过程：默认折叠，正文优先 -->
            <details v-if="message.reasoning" class="group rounded-lg border border-hairline dark:border-hairline-dark">
              <summary class="flex cursor-pointer items-center gap-1.5 px-2.5 py-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
                <AppIcon name="bulb" :size="12" class="opacity-70" />
                <span class="font-medium">思考过程</span>
                <span class="min-w-0 flex-1 truncate">{{ message.reasoning.replace(/\s+/g, ' ').slice(0, 60) }}</span>
                <AppIcon name="chevronDown" :size="12" class="shrink-0 transition-transform group-open:rotate-180" />
              </summary>
              <p class="max-h-56 overflow-auto whitespace-pre-wrap break-words border-t border-hairline px-2.5 py-2 text-[11px] leading-5 text-neutral-600 dark:border-hairline-dark dark:text-neutral-400">{{ message.reasoning }}</p>
            </details>

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

            <p v-if="message.streaming && !message.content && !message.reasoning && !message.toolCalls?.length"
              class="text-xs text-neutral-500 dark:text-neutral-400 flex items-center gap-1.5">
              <AppIcon name="loader" :size="12" class="animate-spin" />
              正在思考…
            </p>

            <!-- 回复级操作：复制、重新生成、删除 -->
            <div v-if="!message.streaming && (message.content || message.toolCalls?.length)"
              class="flex items-center gap-1 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
              <button class="rounded p-1 text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300"
                :title="copiedId === message.id ? '已复制' : '复制'" @click="copyMessage(message)">
                <AppIcon :name="copiedId === message.id ? 'check' : 'copy'" :size="12" />
              </button>
              <button v-if="message.id === lastMessage?.id && canRegenerate"
                class="rounded p-1 text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300"
                title="重新生成" @click="regenerate">
                <AppIcon name="refresh" :size="12" />
              </button>
              <button v-if="!agent.running" class="rounded p-1 text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400"
                title="删除这条回复" @click="agent.deleteMessage(message.id)">
                <AppIcon name="trash" :size="12" />
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- 回到底部：用户上翻历史时出现 -->
    <button v-if="!atBottom" type="button"
      class="absolute bottom-32 left-1/2 z-10 -translate-x-1/2 rounded-full border border-hairline bg-surface p-1.5 text-neutral-500 shadow-sm transition-colors hover:text-accent-700 dark:border-hairline-dark dark:bg-surface-dark dark:text-neutral-400 dark:hover:text-accent-300"
      title="回到底部" @click="scrollToBottom">
      <AppIcon name="chevronDown" :size="14" />
    </button>

    <!-- 错误提示：步数上限时接着跑，其余错误可一键重试，不必重新输入 -->
    <div v-if="agent.error" class="shrink-0 pt-2 flex items-start gap-1.5 text-xs text-rose-600 dark:text-rose-400">
      <AppIcon name="alert" :size="13" class="mt-0.5" />
      <span class="flex-1">{{ agent.error }}</span>
      <button v-if="canRegenerate && agent.stepLimited" class="shrink-0 rounded px-1 py-0.5 font-medium transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10"
        @click="continueTurn">继续</button>
      <button v-else-if="canRegenerate" class="shrink-0 rounded px-1 py-0.5 font-medium transition-colors hover:bg-rose-50 dark:hover:bg-rose-500/10"
        @click="regenerate">重试</button>
    </div>

    <!-- 选择面板：模型需要用户拍板时弹出，点一下即作为答复返回 -->
    <section v-if="agent.pendingChoice" class="shrink-0 mt-2 panel border-accent-300 dark:border-accent-500/40 p-3 space-y-2">
      <div class="flex items-start gap-2">
        <AppIcon name="bulb" :size="15" class="mt-0.5 text-accent-700 dark:text-accent-300" />
        <p class="min-w-0 text-sm font-medium text-neutral-900 dark:text-neutral-100">
          {{ agent.pendingChoice.question || '请选择' }}
        </p>
      </div>
      <div class="flex flex-wrap gap-1.5">
        <button v-for="option in agent.pendingChoice.options" :key="option" type="button"
          class="chip border-accent-300 text-left transition-colors hover:border-accent-500 hover:bg-accent-50 dark:border-accent-500/40 dark:hover:bg-accent-500/10"
          @click="agent.resolveChoice(option)">
          {{ option }}
        </button>
      </div>
      <div class="flex justify-end">
        <button class="btn-ghost text-xs" @click="agent.resolveChoice(null)">跳过</button>
      </div>
    </section>

    <!-- 操作确认：切换模式与破坏性操作共用同一处，文案按类型区分 -->
    <section v-if="agent.pendingApproval" class="shrink-0 mt-2 panel border-amber-300 dark:border-amber-500/40 p-3 space-y-2">
      <div class="flex items-start gap-2">
        <AppIcon name="alert" :size="15" class="mt-0.5 text-amber-600 dark:text-amber-400" />
        <div class="min-w-0">
          <template v-if="isModeSwitch">
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">切换到 {{ modeSwitchTarget }} 模式？</p>
            <p class="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              {{ agent.pendingApproval.args?.reason || 'Agent 请求切换工作模式。' }}
              {{ modeSwitchHint }}
            </p>
          </template>
          <template v-else-if="isMcpCall">
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">调用外部工具{{ approvalDescription }}？</p>
            <p class="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              该 MCP 工具没有声明只读，确认后会把参数发送到你配置的外部服务。
            </p>
          </template>
          <template v-else>
            <p class="text-sm font-medium text-neutral-900 dark:text-neutral-100">确认{{ approvalDescription }}？</p>
            <p class="mt-0.5 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
              这是破坏性操作，确认后才会执行。可先让 Agent 说明影响再决定。
            </p>
          </template>
        </div>
      </div>
      <div class="flex justify-end gap-2">
        <button class="btn-ghost" @click="agent.resolveApproval(false)">取消</button>
        <button class="btn-primary" @click="agent.resolveApproval(true)">
          {{ isModeSwitch ? `切换到 ${modeSwitchTarget}` : '确认执行' }}
        </button>
      </div>
    </section>

    <!-- 输入区：上方浮层选模型、技能与命令，下方工具条常驻 -->
    <div ref="composerRef" class="relative shrink-0 pt-2">
      <!-- 命令与上下文选择器：/ 与 @ 触发，上下键选择 -->
      <ComposerPicker v-if="picker.kind" :title="pickerTitle" :items="pickerItems" :active-index="pickerIndex"
        :empty-text="picker.kind === 'command' ? '没有匹配的命令' : '没有匹配的任务或日程'"
        @select="selectPickerItem" @hover="pickerIndex = $event" />

      <!-- + 菜单：图片和文件、命令、上下文、Shell 命令 -->
      <div v-if="openMenu === 'plus'"
        class="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark">
        <button v-for="entry in PLUS_MENU" :key="entry.key" type="button"
          class="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-neutral-700 transition-colors hover:bg-accent-50 dark:text-neutral-300 dark:hover:bg-accent-500/10"
          @click="runPlusEntry(entry)">
          <AppIcon :name="entry.icon" :size="12" class="opacity-70" />
          <span class="flex-1">{{ entry.label }}</span>
          <span class="text-[11px] text-neutral-400 dark:text-neutral-500">{{ entry.hint }}</span>
        </button>
      </div>

      <!-- 模式浮层：Build 可读写，Plan 只读 -->
      <div v-if="openMenu === 'mode'"
        class="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark">
        <button v-for="mode in AGENT_MODES" :key="mode.id" type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-50 dark:hover:bg-accent-500/10"
          @click="switchMode(mode)">
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium"
              :class="mode.id === agent.activeMode ? 'text-accent-700 dark:text-accent-300' : 'text-neutral-800 dark:text-neutral-200'">
              {{ mode.label }}
            </span>
            <span class="mt-0.5 block text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">{{ mode.description }}</span>
          </span>
          <AppIcon v-if="mode.id === agent.activeMode" name="check" :size="12" class="mt-0.5 text-accent-700 dark:text-accent-300" />
        </button>
      </div>

      <!-- 模型浮层 -->
      <div v-if="openMenu === 'model'"
        class="absolute bottom-full left-0 z-20 mb-1.5 w-64 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark">
        <p class="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">
          {{ llm.isBuiltin ? '内置模型' : '当前服务商型号' }}
        </p>
        <div class="max-h-64 overflow-y-auto pb-1">
          <button v-for="model in modelOptions" :key="model"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs transition-colors hover:bg-accent-50 dark:hover:bg-accent-500/10"
            :class="model === llm.activeModel ? 'text-accent-700 dark:text-accent-300' : 'text-neutral-700 dark:text-neutral-300'"
            @click="switchModel(model)">
            <AppIcon :name="model === llm.activeModel ? 'check' : 'sparkles'" :size="12" class="opacity-70" />
            <span class="truncate">{{ model }}</span>
          </button>
          <p v-if="!modelOptions.length" class="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
            没有可选型号，去设置里填写
          </p>
        </div>
        <button class="flex w-full items-center gap-2 border-t border-hairline px-3 py-2 text-left text-xs text-neutral-600 transition-colors hover:bg-accent-50 dark:border-hairline-dark dark:text-neutral-400 dark:hover:bg-accent-500/10"
          @click="openMenu = ''; openProviderSettings()">
          <AppIcon name="sliders" :size="12" class="opacity-70" />
          模型接入设置
        </button>
      </div>

      <!-- 思考等级浮层：关闭时让 DeepSeek 走非思考模式 -->
      <div v-if="openMenu === 'reasoning'"
        class="absolute bottom-full left-0 z-20 mb-1.5 w-56 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark">
        <p class="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">思考等级</p>
        <button v-for="option in REASONING_EFFORTS" :key="option.id" type="button"
          class="flex w-full items-start gap-2 px-3 py-2 text-left transition-colors hover:bg-accent-50 dark:hover:bg-accent-500/10"
          @click="switchReasoningEffort(option.id)">
          <span class="min-w-0 flex-1">
            <span class="block text-xs font-medium"
              :class="option.id === reasoningEffort ? 'text-accent-700 dark:text-accent-300' : 'text-neutral-800 dark:text-neutral-200'">
              {{ option.label }}
            </span>
            <span class="mt-0.5 block text-[11px] leading-4 text-neutral-500 dark:text-neutral-400">{{ option.description }}</span>
          </span>
          <AppIcon v-if="option.id === reasoningEffort" name="check" :size="12" class="mt-0.5 text-accent-700 dark:text-accent-300" />
        </button>
      </div>

      <!-- 技能浮层 -->
      <div v-if="openMenu === 'skill'"
        class="absolute bottom-full left-0 z-20 mb-1.5 w-64 overflow-hidden rounded-lg border border-hairline bg-surface shadow-lg dark:border-hairline-dark dark:bg-surface-dark">
        <p class="px-3 pt-2 pb-1 text-[11px] font-medium text-neutral-500 dark:text-neutral-400">技能</p>
        <div class="max-h-64 overflow-y-auto pb-1">
          <button v-for="skill in agent.skills" :key="skill.id"
            class="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-neutral-700 transition-colors hover:bg-accent-50 dark:text-neutral-300 dark:hover:bg-accent-500/10"
            :title="skill.mode ? `挂载技能并切到${modeLabel(skill.mode)}模式` : '挂载技能，沿用当前模式'"
            @click="applySkill(skill)">
            <AppIcon :name="skill.icon" :size="12" class="opacity-70" />
            <span class="truncate">{{ skill.name }}</span>
            <span v-if="skill.mode" class="ml-auto shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">{{ modeLabel(skill.mode) }}</span>
          </button>
          <p v-if="!agent.skills.length" class="px-3 py-2 text-xs text-neutral-500 dark:text-neutral-400">
            还没有技能，可在侧栏新建
          </p>
        </div>
      </div>

      <div class="panel p-2 transition-colors focus-within:border-accent-400 dark:focus-within:border-accent-500/50"
        :class="dragging ? 'border-accent-400 dark:border-accent-500/60' : ''"
        @dragover="onDragOver" @dragleave="onDragLeave" @drop="onDrop">
        <!-- 本轮附件：技能、引用与图片排成一行，发送前可逐个移除 -->
        <div v-if="agent.attachedSkills.length || mentions.length || pendingImages.length"
          class="mb-1.5 flex flex-wrap items-center gap-1 px-1">
          <span v-for="skill in agent.attachedSkills" :key="`skill:${skill.id}`"
            class="inline-flex max-w-[14rem] items-center gap-1 rounded-md border border-accent-300 px-1.5 py-0.5 text-[11px] text-accent-800 dark:border-accent-500/40 dark:text-accent-200">
            <AppIcon :name="skill.icon || 'sparkles'" :size="11" class="opacity-70" />
            <span class="truncate">{{ skill.name }}</span>
            <button type="button" class="shrink-0 opacity-60 transition-opacity hover:opacity-100" title="移除技能"
              @click="agent.detachSkill(skill.id)">
              <AppIcon name="close" :size="10" />
            </button>
          </span>
          <span v-for="item in mentions" :key="`mention:${item.key}`"
            class="inline-flex max-w-[14rem] items-center gap-1 rounded-md bg-accent-50 px-1.5 py-0.5 text-[11px] text-accent-800 dark:bg-accent-500/10 dark:text-accent-200">
            <AppIcon :name="item.icon || 'link'" :size="11" class="opacity-70" />
            <span class="truncate">{{ item.label }}</span>
            <button type="button" class="shrink-0 opacity-60 transition-opacity hover:opacity-100" title="移除引用"
              @click="removeMention(item.key)">
              <AppIcon name="close" :size="10" />
            </button>
          </span>
          <span v-for="image in pendingImages" :key="`image:${image.id}`"
            class="inline-flex max-w-[7rem] items-center gap-1 rounded-md border border-hairline px-1 py-0.5 text-[11px] text-neutral-700 dark:border-hairline-dark dark:text-neutral-300">
            <button type="button" class="flex min-w-0 items-center gap-1" title="查看大图" @click="openPreview(image)">
              <img :src="image.dataUrl" alt="" class="h-4 w-4 shrink-0 rounded object-cover" />
              <span class="truncate">{{ image.name }}</span>
            </button>
            <button type="button" class="shrink-0 opacity-60 transition-opacity hover:opacity-100" title="移除图片"
              @click="removeImage(image.id)">
              <AppIcon name="close" :size="10" />
            </button>
          </span>
        </div>

        <textarea ref="inputRef" v-model="draft" rows="1"
          class="w-full resize-none bg-transparent px-2 py-1.5 text-sm leading-6 text-neutral-900 outline-none placeholder:text-neutral-500 dark:text-neutral-100 dark:placeholder:text-neutral-400"
          placeholder="随便问点什么，/ 查看命令，@ 引用任务或日程…"
          :disabled="!llm.isConfigured"
          @input="onComposerInput"
          @click="onComposerClick"
          @paste="onPaste"
          @keydown="onComposerKeydown"
          @compositionstart="isComposing = true"
          @compositionend="isComposing = false"></textarea>

        <p v-if="imageError" class="px-2 pb-1 text-[11px] text-rose-600 dark:text-rose-400">{{ imageError }}</p>

        <!-- 工具条：+ 菜单、模式、模型、思考等级、发送 -->
        <div class="mt-1 flex items-center gap-1">
          <button type="button"
            class="inline-flex items-center justify-center rounded-md p-1 text-neutral-600 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            :class="openMenu === 'plus' ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200' : ''"
            title="添加图片和文件、挂载技能、引用任务或日程" @click="toggleMenu('plus')">
            <AppIcon name="plus" :size="14" />
          </button>
          <button type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-neutral-600 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            :class="openMenu === 'mode' ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200' : ''"
            title="切换工作模式" @click="toggleMenu('mode')">
            <span>{{ activeModeLabel }}</span>
            <AppIcon name="chevronUp" :size="10" class="opacity-50" />
          </button>
          <button type="button"
            class="inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-1 text-[11px] text-neutral-600 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            :title="llm.isConfigured ? '切换模型' : '尚未接入模型'" @click="toggleMenu('model')">
            <AppIcon name="sparkles" :size="12" class="opacity-70" />
            <span class="max-w-[10rem] truncate">{{ llm.activeModel || '未接入模型' }}</span>
            <AppIcon name="chevronUp" :size="10" class="opacity-50" />
          </button>
          <button type="button"
            class="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[11px] transition-colors hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            :class="reasoningEffort === 'off'
              ? 'text-neutral-600 dark:text-neutral-400'
              : 'text-accent-700 dark:text-accent-300'"
            :title="`思考等级：${reasoningLabel}`" @click="toggleMenu('reasoning')">
            <AppIcon name="bulb" :size="12" class="opacity-70" />
            <span>{{ reasoningLabel }}</span>
            <AppIcon name="chevronUp" :size="10" class="opacity-50" />
          </button>
          <input ref="imageInputRef" type="file" accept="image/png,image/jpeg,image/webp,image/gif" multiple class="hidden"
            @change="onImagePicked" />

          <div class="ml-auto flex shrink-0 items-center gap-1.5">
            <span class="hidden text-[11px] text-neutral-400 sm:inline dark:text-neutral-500">
              {{ agent.running ? 'Esc 停止' : 'Enter 发送 · Shift+Enter 换行' }}
            </span>
            <button v-if="agent.running" class="btn-outline px-2 py-1 text-xs" title="停止生成" @click="agent.stop()">
              <AppIcon name="stop" :size="13" />
              <span>停止</span>
            </button>
            <button v-else
              class="flex h-7 w-7 items-center justify-center rounded-full bg-accent-700 text-white transition-colors hover:bg-accent-800 disabled:opacity-40 dark:bg-accent-500 dark:text-accent-950 dark:hover:bg-accent-400"
              :disabled="!canSend" title="发送" @click="sendDraft">
              <AppIcon name="send" :size="13" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 图片预览：铺满视口，点背景或按 Esc 关闭 -->
    <Teleport to="body">
      <div v-if="previewImage"
        class="fixed inset-0 z-[90] flex flex-col items-center justify-center gap-3 bg-neutral-950/80 p-6 backdrop-blur-sm"
        @click.self="closePreview">
        <img :src="previewImage.dataUrl" :alt="previewImage.name"
          class="max-h-[85vh] max-w-full rounded-lg object-contain shadow-xl" />
        <div class="flex items-center gap-3 text-xs text-neutral-300">
          <span class="max-w-[60vw] truncate">{{ previewImage.name }}</span>
          <span v-if="previewImage.width && previewImage.height" class="tabular-nums text-neutral-400">
            {{ previewImage.width }} × {{ previewImage.height }}
          </span>
          <button type="button"
            class="rounded p-1 text-neutral-300 transition-colors hover:bg-white/10 hover:text-white"
            title="关闭预览" @click="closePreview">
            <AppIcon name="close" :size="14" />
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
