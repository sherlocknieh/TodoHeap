<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTodoStore } from '@/stores/todos'
import { useAgentStore } from '@/stores/agent'
import { useAuthStore } from '@/stores/auth'
import { useScheduleStore } from '@/stores/schedules'
import { parseDateKey, scheduleRangeOf, toDateKey } from '@/utils/scheduleRange'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/AppIcon.vue'
import { DEFAULT_SKILL_ICON, MAX_SKILL_NAME, MAX_SKILL_PROMPT, SKILL_ICONS } from '@/lib/agentSkills'
import { MAX_MCP_NAME, MCP_PRESETS, findPresetServer } from '@/lib/mcpServers'
import { AGENT_MODES } from '@/lib/agentModes'
import { persistedRef, SIDEBAR_FLOAT_BREAKPOINT } from '@/utils/uiState'
import { useResizablePanel, useResizableHeight } from '@/utils/resizablePanel'

const props = defineProps({
  show: { type: Boolean, default: false },
  activeView: { type: String, default: 'list' },
  selectedTaskId: { type: Number, default: null },
  // 当前活动栏入口，决定侧栏内容
  section: { type: String, default: 'list' },
  // 覆盖在内容之上，不挤压主视图（任务图使用）
  overlay: { type: Boolean, default: false },
  // 活动栏收起时贴齐左边，不留下空档
  railHidden: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-view', 'create-task'])

// 为模板提供 `show` 绑定
const show = computed(() => props.show)

// 侧栏右缘可拖拽调宽，拖过最小宽度后再拖一段即收起
const { width: sidebarWidth, resizing: sidebarResizing, collapseArmed: sidebarCollapseArmed, start: startResize } = useResizablePanel({
  key: 'sidebar-width',
  initial: 256,
  min: 200,
  side: 'left',
  onCollapse: () => emit('close')
})

// 技能区高度可拖拽调整，拖拽条位于技能分组上缘
const { height: skillsHeight, resizing: skillsResizing, start: startSkillsResize } = useResizableHeight({
  key: 'skills-height',
  initial: 240,
  min: 120
})

const todoStore = useTodoStore()
const agent = useAgentStore()
const authStore = useAuthStore()
const scheduleStore = useScheduleStore()
const route = useRoute()
const router = useRouter()

const editingSessionId = ref(null)
const editingTitle = ref('')
const renameInput = ref(null)

// 技能编辑器：新建与编辑共用一份草稿
const skillForm = ref(null)
const skillError = ref('')

// MCP 服务编辑器：名称、地址与令牌一起保存，连接后才列出工具
const mcpForm = ref(null)
const mcpFormError = ref('')

// 侧栏分组默认展开，点击标题折叠；折叠选择本地保留（参考 VSCode 侧栏）
const collapsedSections = persistedRef('sidebar-sections', { sessions: false, skills: false, mcp: false }, {
  validate: (value) => value && typeof value === 'object'
})

const toggleSection = (key) => {
  collapsedSections.value[key] = !collapsedSections.value[key]
}

const expandSection = (key) => {
  collapsedSections.value[key] = false
}

// AI 侧栏展示会话列表，进入 AI 入口时确保会话已载入
const ensureAgent = () => {
  if (props.section === 'ai') agent.init(authStore.user?.id)
}
onMounted(ensureAgent)
watch(() => props.section, ensureAgent)

// 进入日程入口时确保事件已载入，概览数字才有数据
const ensureSchedules = () => {
  if (props.section === 'schedule') scheduleStore.fetchSchedules()
}
onMounted(ensureSchedules)
watch(() => props.section, ensureSchedules)

const closeOnNarrowScreen = () => {
  if (window.innerWidth < SIDEBAR_FLOAT_BREAKPOINT) emit('close')
}

const handleNewSession = () => {
  cancelSessionRename()
  expandSection('sessions')
  agent.newSession()
  closeOnNarrowScreen()
}

const handleSwitchSession = (id) => {
  cancelSessionRename()
  agent.switchSession(id)
  closeOnNarrowScreen()
}

const startSessionRename = (session) => {
  editingSessionId.value = session.id
  editingTitle.value = session.title
  nextTick(() => {
    const input = Array.isArray(renameInput.value) ? renameInput.value[0] : renameInput.value
    input?.focus()
    input?.select()
  })
}

const commitSessionRename = () => {
  if (!editingSessionId.value) return
  agent.renameSession(editingSessionId.value, editingTitle.value)
  cancelSessionRename()
}

const cancelSessionRename = () => {
  editingSessionId.value = null
  editingTitle.value = ''
}

const deleteSession = (id) => {
  if (editingSessionId.value === id) cancelSessionRename()
  agent.deleteSession(id)
}

// 技能只绑定工作模式：留空表示沿用会话当前模式
const MODE_OPTIONS = [{ id: '', label: '跟随会话' }, ...AGENT_MODES.map((mode) => ({ id: mode.id, label: mode.label }))]

const startNewSkill = () => {
  skillError.value = ''
  expandSection('skills')
  skillForm.value = { id: null, name: '', icon: DEFAULT_SKILL_ICON, prompt: '', mode: '' }
}

const startEditSkill = (skill) => {
  skillError.value = ''
  expandSection('skills')
  skillForm.value = {
    id: skill.id,
    name: skill.name,
    icon: skill.icon,
    prompt: skill.prompt,
    mode: skill.mode || ''
  }
}

const cancelSkillForm = () => {
  skillForm.value = null
  skillError.value = ''
}

const saveSkill = () => {
  const form = skillForm.value
  if (!form) return
  if (!form.name.trim()) {
    skillError.value = '给技能起个名字'
    return
  }
  if (!form.prompt.trim()) {
    skillError.value = '写下让 Agent 执行的指令'
    return
  }
  if (form.id) agent.updateSkill(form.id, form)
  else agent.addSkill(form)
  cancelSkillForm()
}

// 删除技能后收起表单，避免停留在已不存在的条目上
const removeSkill = (id) => {
  agent.deleteSkill(id)
  cancelSkillForm()
}

const modeLabel = (id) => AGENT_MODES.find((mode) => mode.id === id)?.label || ''

const attachSkill = (skill) => {
  agent.useSkill(skill.id)
  closeOnNarrowScreen()
}

const startNewMcp = () => {
  mcpFormError.value = ''
  expandSection('mcp')
  mcpForm.value = { id: null, name: '', endpoint: '', token: '' }
}

const startEditMcp = (server) => {
  mcpFormError.value = ''
  expandSection('mcp')
  mcpForm.value = {
    id: server.id,
    name: server.name,
    endpoint: server.endpoint,
    token: server.token || ''
  }
}

const cancelMcpForm = () => {
  mcpForm.value = null
  mcpFormError.value = ''
}

// 保存后立即连接一次：拿不到工具列表就说明地址或令牌有问题
const saveMcp = async () => {
  const form = mcpForm.value
  if (!form) return
  if (!form.name.trim()) {
    mcpFormError.value = '给服务起个名字'
    return
  }
  if (!/^https?:\/\//i.test(form.endpoint.trim())) {
    mcpFormError.value = '服务地址要以 http:// 或 https:// 开头'
    return
  }

  const saved = form.id
    ? agent.updateMcpServer(form.id, form)
    : agent.addMcpServer(form)
  if (!saved) {
    mcpFormError.value = '服务名与地址不能为空'
    return
  }

  cancelMcpForm()
  await agent.connectMcpServer(saved.id)
}

// 重新启用时顺手补一次工具列表，避免提示词里只有服务名没有工具
const toggleMcpServer = async (server) => {
  const enabled = !server.enabled
  agent.updateMcpServer(server.id, { enabled })
  if (enabled && !server.tools?.length) await agent.connectMcpServer(server.id)
}

const removeMcpServer = (id) => {
  agent.deleteMcpServer(id)
  if (mcpForm.value?.id === id) cancelMcpForm()
}

const reconnectMcpServer = (server) => {
  agent.connectMcpServer(server.id)
}

const mcpToolCount = (server) => (server.tools || []).length

// 一键添加：已添加过的预设不再出现在列表里
const availablePresets = computed(() => MCP_PRESETS.filter((preset) => (
  !findPresetServer(agent.mcpServers, preset.id)
)))

const isPresetServer = (server) => Boolean(server.presetId)

// 预设服务需要重新授权时直接跳转，回来由 completePendingPreset 续上
const handlePresetAdd = async (preset) => {
  mcpFormError.value = ''
  expandSection('mcp')
  await agent.addMcpPreset(preset.id)
}

const handleReauthorize = (server) => {
  agent.reauthorizePreset(server.id)
}

// 会话列表只显示时间与消息数，按当天/更早两种格式
const formatSessionTime = (iso) => {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  const now = new Date()
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
  }
  return date.toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric' })
}

// 统计信息
// 统计只用于回收站计数，任务进度统一放在底栏
const stats = computed(() => ({
  trashed: todoStore.trashTodos.length
}))

// 可用视图：任务图是默认视图，任务表负责逐条编辑
const views = computed(() => [
  { id: 'graph', label: '任务图', icon: 'graph' },
  { id: 'list', label: '任务表', icon: 'list' },
  { id: 'trash', label: '回收站', icon: 'trash', count: stats.value.trashed }
])

// 按活动栏入口展示不同标题与内容
const sectionTitle = computed(() => {
  if (props.section === 'schedule') return '日程'
  if (props.section === 'ai') return 'AI'
  return '任务导航'
})

// 日程概览：按时间段统计日程事件，与列表筛选共用同一条判定
const scheduleStats = computed(() => {
  const counts = { today: 0, future: 0, past: 0 }
  for (const event of scheduleStore.schedules) counts[scheduleRangeOf(event)] += 1
  return { ...counts, total: scheduleStore.schedules.length }
})

// 概览高亮跟随正在浏览的日期所属时间段；未指定日期时归入全部
const activeScheduleRange = computed(() => {
  const selected = parseDateKey(route.query.date)
  if (!selected) return 'all'
  const startOfDay = new Date(selected)
  startOfDay.setHours(0, 0, 0, 0)
  const endOfDay = new Date(selected)
  endOfDay.setHours(23, 59, 59, 999)
  return scheduleRangeOf({ start_at: startOfDay, end_at: endOfDay }, new Date())
})

const scheduleRangeItems = computed(() => [
  { id: 'today', label: '今天', count: scheduleStats.value.today },
  { id: 'future', label: '以后', count: scheduleStats.value.future },
  { id: 'past', label: '已过去', count: scheduleStats.value.past },
  { id: 'all', label: '全部', count: scheduleStats.value.total }
])

// 点击概览跳到该范围内离今天最近的一天，全部则回到今天
const openScheduleRange = (id) => {
  const today = new Date()
  let target = today

  if (id === 'future' || id === 'past') {
    const matches = scheduleStore.schedules.filter((event) => scheduleRangeOf(event) === id)
    const hit = id === 'future' ? matches[0] : matches[matches.length - 1]
    if (hit) {
      target = new Date(hit.start_at)
    } else {
      target = new Date(today)
      target.setDate(target.getDate() + (id === 'future' ? 1 : -1))
    }
  }

  router.replace({ name: 'ScheduleView', query: id === 'all' ? {} : { date: toDateKey(target) } })
  closeOnNarrowScreen()
}

// 切换视图
const switchView = (view) => {
  emit('switch-view', view)
  // 小屏下切换视图后自动关闭侧栏
  if (window.innerWidth < SIDEBAR_FLOAT_BREAKPOINT) {
    emit('close')
  }
}


</script>
<template>
  <!-- 小屏浮层 / 大屏常驻左栏 -->
  <div
    v-if="show"
    data-left-sidebar
    :class="[
      'absolute top-0 bottom-0 max-w-[85vw] bg-surface dark:bg-surface-dark flex flex-col z-30 border-r border-hairline dark:border-hairline-dark',
      // 常驻左栏由布局排布，浮层时才按活动栏留出左边距
      railHidden ? 'left-0' : overlay ? 'left-12' : 'left-12 md:left-0',
      overlay ? 'shadow-lg' : 'md:relative md:z-10 md:shadow-none'
    ]"
    :style="{ width: sidebarWidth + 'px' }"
  >
    <!-- 头部 -->
    <header class="shrink-0 h-12 px-3 flex items-center justify-between border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">{{ sectionTitle }}</span>
      <button
        @click="$emit('close')"
        :class="[
          'p-1.5 -mr-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors',
          overlay || railHidden ? '' : 'md:hidden'
        ]"
        title="关闭侧栏"
      >
        <AppIcon name="close" :size="15" />
      </button>
    </header>

    <!-- 内容：按活动栏入口切换 -->
    <!-- AI 侧栏把技能钉在底部，其余分组在上方独立滚动 -->
    <div :class="section === 'ai'
      ? 'flex-1 min-h-0 flex flex-col px-2 py-3'
      : 'flex-1 min-h-0 overflow-auto px-2 py-3 space-y-6'">
      <template v-if="section === 'list'">
        <!-- 视图 -->
        <nav class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">视图</p>
          <button
            v-for="view in views"
            :key="view.id"
            @click="switchView(view.id)"
            :class="[
              'w-full text-left px-2.5 py-2 rounded-lg text-sm transition-colors flex items-center gap-2.5 border-l-2',
              activeView === view.id
                ? 'bg-accent-100/80 text-accent-900 dark:bg-accent-500/20 dark:text-accent-100 font-semibold border-accent-600 dark:border-accent-400'
                : 'border-transparent text-neutral-700 dark:text-neutral-300 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06] hover:text-accent-800 dark:hover:text-accent-200'
            ]"
          >
            <AppIcon :name="view.icon" :size="15" class="opacity-70" />
            <span class="flex-1">{{ view.label }}</span>
            <span v-if="view.count !== undefined" class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ view.count }}</span>
          </button>
        </nav>
      </template>

      <template v-else-if="section === 'schedule'">
        <!-- 日程概览：点击跳到对应范围内的日程 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">概览</p>
          <div class="px-1 space-y-0.5">
            <button v-for="item in scheduleRangeItems" :key="item.id" type="button"
              class="flex w-full items-baseline justify-between rounded px-2 py-1 text-sm transition-colors"
              :class="activeScheduleRange === item.id
                ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-200'
                : 'text-neutral-600 hover:bg-accent-50/70 dark:text-neutral-400 dark:hover:bg-accent-500/[0.06]'"
              :title="item.id === 'all' ? '回到今天' : undefined"
              @click="openScheduleRange(item.id)">
              <span>{{ item.label }}</span>
              <span class="font-mono">{{ item.count }}</span>
            </button>
          </div>
        </section>

        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">说明</p>
          <p class="px-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            导入 .ics 日历文件后，事件会按日期出现在这里；订阅链接供外部日历读取这些事件。
          </p>
        </section>
      </template>

      <template v-else>
        <div class="flex-1 min-h-0 overflow-auto space-y-6">
        <!-- 对话会话：新建、切换、重命名、删除 -->
        <section>
          <div class="flex items-center gap-1 pl-1 pr-2">
            <button class="flex-1 flex items-center gap-1 py-1 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              :aria-expanded="!collapsedSections.sessions" @click="toggleSection('sessions')">
              <AppIcon :name="collapsedSections.sessions ? 'chevronRight' : 'chevronDown'" :size="12" class="opacity-70" />
              <span class="eyebrow">对话</span>
            </button>
            <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300 transition-colors"
              title="新建对话" @click="handleNewSession">
              <AppIcon name="plus" :size="14" />
            </button>
          </div>
          <div v-show="!collapsedSections.sessions" class="space-y-0.5">
            <p v-if="!agent.sessions.length" class="px-2 text-xs text-neutral-500 dark:text-neutral-400">
              还没有会话
            </p>
            <ul v-else class="space-y-0.5">
              <li v-for="session in agent.sessions" :key="session.id"
                class="group flex items-center gap-1 rounded-lg px-1.5 py-1 transition-colors"
                :class="session.id === agent.activeSessionId
                  ? 'bg-accent-100/80 dark:bg-accent-500/20'
                  : 'hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'">
                <template v-if="editingSessionId === session.id">
                  <input ref="renameInput" v-model="editingTitle" class="field flex-1 px-1.5 py-1 text-xs"
                    @keydown.enter.prevent="commitSessionRename" @keydown.esc.prevent="cancelSessionRename"
                    @blur="commitSessionRename" />
                </template>
                <template v-else>
                  <button class="min-w-0 flex-1 text-left px-1" @click="handleSwitchSession(session.id)">
                    <span class="block truncate text-sm"
                      :class="session.id === agent.activeSessionId
                        ? 'font-semibold text-accent-900 dark:text-accent-100'
                        : 'text-neutral-700 dark:text-neutral-300'">
                      {{ session.title }}
                    </span>
                    <span class="block font-mono text-[10px] text-neutral-500 dark:text-neutral-400">
                      {{ formatSessionTime(session.updatedAt) }} · {{ session.messages.length }}
                    </span>
                  </button>
                  <button class="p-1 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    title="重命名会话" @click.stop="startSessionRename(session)">
                    <AppIcon name="edit" :size="12" />
                  </button>
                  <button class="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                    title="删除会话" @click.stop="deleteSession(session.id)">
                    <AppIcon name="trash" :size="12" />
                  </button>
                </template>
              </li>
            </ul>
          </div>
        </section>

        </div>

        <!-- MCP 服务：常驻底部分组，上方是会话列表的滚动区 -->
        <section class="shrink-0 flex flex-col min-h-0 border-t border-hairline pt-2 dark:border-hairline-dark">
          <div class="shrink-0 flex items-center gap-1 pl-1 pr-2">
            <button class="flex-1 flex items-center gap-1 py-1 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              :aria-expanded="!collapsedSections.mcp" @click="toggleSection('mcp')">
              <AppIcon :name="collapsedSections.mcp ? 'chevronRight' : 'chevronDown'" :size="12" class="opacity-70" />
              <span class="eyebrow">MCP 服务</span>
              <span v-if="agent.mcpServers.length" class="font-mono text-[10px] text-neutral-400 dark:text-neutral-500">{{ agent.mcpServers.length }}</span>
            </button>
            <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300 transition-colors"
              title="新增 MCP 服务" @click="startNewMcp">
              <AppIcon name="plus" :size="14" />
            </button>
          </div>

          <div v-show="!collapsedSections.mcp" class="max-h-60 min-h-0 overflow-auto space-y-0.5">
            <form v-if="mcpForm" class="mx-2 mb-1.5 space-y-1.5 rounded-lg border border-hairline p-2 dark:border-hairline-dark"
              @submit.prevent="saveMcp">
              <input v-model="mcpForm.name" class="field w-full px-1.5 py-1 text-xs"
                :maxlength="MAX_MCP_NAME" placeholder="服务名称，如 高德地图" />
              <input v-model="mcpForm.endpoint" class="field w-full px-1.5 py-1 font-mono text-[11px]"
                placeholder="https://example.com/mcp" autocomplete="off" spellcheck="false" />
              <input v-model="mcpForm.token" type="password" class="field w-full px-1.5 py-1 font-mono text-[11px]"
                placeholder="访问令牌，可选" autocomplete="off" />
              <p v-if="mcpFormError" class="text-[11px] text-rose-600 dark:text-rose-400">{{ mcpFormError }}</p>
              <div class="flex items-center justify-between gap-1">
                <button v-if="mcpForm.id" type="button"
                  class="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="删除服务" @click="removeMcpServer(mcpForm.id)">
                  <AppIcon name="trash" :size="12" />
                </button>
                <span v-else></span>
                <div class="flex items-center gap-1">
                  <button type="button" class="btn-ghost px-2 py-1 text-xs" @click="cancelMcpForm">取消</button>
                  <button type="submit" class="btn-primary px-2 py-1 text-xs">保存并连接</button>
                </div>
              </div>
            </form>

            <!-- 内置预设：点一次即完成地址与授权配置 -->
            <div v-if="availablePresets.length" class="mx-2 mb-1.5 space-y-1">
              <p class="text-[11px] text-neutral-400 dark:text-neutral-500">一键添加</p>
              <button v-for="preset in availablePresets" :key="preset.id" type="button"
                class="flex w-full items-center gap-2 rounded-md border border-dashed border-neutral-300 px-2 py-1.5 text-left transition-colors hover:border-accent-400 hover:bg-accent-50/70 dark:border-neutral-700 dark:hover:bg-accent-500/[0.06]"
                :title="preset.description" @click="handlePresetAdd(preset)">
                <AppIcon name="plus" :size="12" class="shrink-0 opacity-70" />
                <span class="min-w-0 flex-1">
                  <span class="block truncate text-xs text-neutral-700 dark:text-neutral-300">{{ preset.name }}</span>
                  <span class="block truncate text-[10px] text-neutral-400 dark:text-neutral-500">{{ preset.description }}</span>
                </span>
              </button>
            </div>

            <p v-if="!agent.mcpServers.length" class="px-2 text-xs text-neutral-500 dark:text-neutral-400">
              还没有 MCP 服务
            </p>
            <ul v-else class="space-y-0.5">
              <li v-for="server in agent.mcpServers" :key="server.id"
                class="group flex items-start gap-0.5 rounded-lg px-1.5 py-1 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]">
                <button class="min-w-0 flex-1 px-1 text-left" title="编辑服务" @click="startEditMcp(server)">
                  <span class="flex items-center gap-1.5">
                    <AppIcon name="link" :size="13" class="shrink-0 opacity-70" />
                    <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{{ server.name }}</span>
                  </span>
                  <span class="mt-0.5 block truncate font-mono text-[10px]"
                    :class="server.error ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-400 dark:text-neutral-500'">
                    {{ server.error || (server.enabled ? `${mcpToolCount(server)} 个工具` : '已停用') }}
                  </span>
                </button>
                <button class="p-1 rounded transition-colors"
                  :class="server.enabled ? 'text-accent-600 dark:text-accent-400' : 'text-neutral-400'"
                  :title="server.enabled ? '停用该服务' : '启用该服务'" @click.stop="toggleMcpServer(server)">
                  <AppIcon :name="server.enabled ? 'check' : 'eyeOff'" :size="12" />
                </button>
                <button v-if="isPresetServer(server)"
                  class="p-1 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
                  title="重新授权" @click.stop="handleReauthorize(server)">
                  <AppIcon name="key" :size="12" />
                </button>
                <button class="p-1 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors"
                  :disabled="agent.mcpBusyId === server.id" title="重新连接" @click.stop="reconnectMcpServer(server)">
                  <AppIcon :name="agent.mcpBusyId === server.id ? 'loader' : 'refresh'" :size="12" />
                </button>
              </li>
            </ul>
          </div>
        </section>

        <!-- 技能：常驻底部分组，上缘可拖拽调高，折叠后只保留标题行 -->
        <div v-show="!collapsedSections.skills" class="shrink-0 -mt-1 h-2 flex items-center justify-center cursor-row-resize touch-none transition-colors"
          :class="skillsResizing ? 'text-accent-600 dark:text-accent-400' : 'text-transparent hover:text-accent-400 dark:hover:text-accent-500'"
          role="separator" aria-orientation="horizontal" title="拖拽调整技能区高度"
          @pointerdown="startSkillsResize">
          <div class="h-0.5 w-8 rounded-full bg-current"></div>
        </div>
        <section class="shrink-0 flex flex-col min-h-0 border-t border-hairline pt-2 dark:border-hairline-dark"
          :style="collapsedSections.skills ? null : { height: skillsHeight + 'px' }">
          <div class="shrink-0 flex items-center gap-1 pl-1 pr-2">
            <button class="flex-1 flex items-center gap-1 py-1 rounded text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors"
              :aria-expanded="!collapsedSections.skills" @click="toggleSection('skills')">
              <AppIcon :name="collapsedSections.skills ? 'chevronRight' : 'chevronDown'" :size="12" class="opacity-70" />
              <span class="eyebrow">技能</span>
            </button>
            <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300 transition-colors"
              title="新建技能" @click="startNewSkill">
              <AppIcon name="plus" :size="14" />
            </button>
          </div>

          <div v-show="!collapsedSections.skills" class="flex-1 min-h-0 overflow-auto space-y-0.5">
            <form v-if="skillForm" class="mx-2 mb-1.5 space-y-1.5 rounded-lg border border-hairline p-2 dark:border-hairline-dark"
              @submit.prevent="saveSkill">
              <input v-model="skillForm.name" class="field w-full px-1.5 py-1 text-xs"
                :maxlength="MAX_SKILL_NAME" placeholder="技能名称" />
              <div class="flex flex-wrap gap-1">
                <button v-for="icon in SKILL_ICONS" :key="icon" type="button"
                  class="p-1 rounded border transition-colors"
                  :class="skillForm.icon === icon
                    ? 'border-accent-500 bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300'
                    : 'border-transparent text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300'"
                  :title="icon" @click="skillForm.icon = icon">
                  <AppIcon :name="icon" :size="13" />
                </button>
              </div>
              <textarea v-model="skillForm.prompt" rows="4"
                class="field w-full resize-none px-1.5 py-1 text-xs leading-5"
                :maxlength="MAX_SKILL_PROMPT" placeholder="写给 Agent 的指令，例如：把本周任务按优先级重新排序"></textarea>
              <div>
                <p class="mb-1 text-[11px] text-neutral-500 dark:text-neutral-400">运行模式，决定这个技能能用哪些工具</p>
                <div class="flex flex-wrap gap-1">
                  <button v-for="mode in MODE_OPTIONS" :key="mode.id" type="button"
                    class="chip transition-colors"
                    :class="skillForm.mode === mode.id
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-500 dark:bg-accent-500/10 dark:text-accent-300'
                      : 'border-neutral-300 hover:border-accent-400 dark:border-neutral-600'"
                    @click="skillForm.mode = mode.id">
                    {{ mode.label }}
                  </button>
                </div>
              </div>
              <p v-if="skillError" class="text-[11px] text-rose-600 dark:text-rose-400">{{ skillError }}</p>
              <div class="flex items-center gap-1.5">
                <button v-if="skillForm.id" type="button"
                  class="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                  title="删除技能" @click="removeSkill(skillForm.id)">
                  <AppIcon name="trash" :size="13" />
                </button>
                <div class="flex-1"></div>
                <button type="button" class="btn-ghost text-xs" @click="cancelSkillForm">取消</button>
                <button type="submit" class="btn-primary text-xs">保存</button>
              </div>
            </form>

            <p v-if="!agent.skills.length" class="px-2 text-xs text-neutral-500 dark:text-neutral-400">
              还没有技能
            </p>
            <ul v-else class="space-y-0.5">
              <li v-for="skill in agent.skills" :key="skill.id"
                class="group flex items-center gap-0.5 rounded-lg px-1.5 py-1 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]">
                <button class="min-w-0 flex-1 flex items-center gap-2 px-1 text-left"
                  title="编辑技能" @click="startEditSkill(skill)">
                  <AppIcon :name="skill.icon" :size="13" class="opacity-70" />
                  <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{{ skill.name }}</span>
                  <span v-if="skill.mode" class="shrink-0 text-[10px] text-neutral-400 dark:text-neutral-500">{{ modeLabel(skill.mode) }}</span>
                </button>
                <button class="p-1 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  :title="skill.mode ? `挂载技能并切到${modeLabel(skill.mode)}模式` : '挂载技能'"
                  @click.stop="attachSkill(skill)">
                  <AppIcon name="plus" :size="12" />
                </button>
              </li>
            </ul>
            <p v-if="agent.skillsError" class="px-2 pt-1 text-[11px] leading-4 text-rose-600 dark:text-rose-400">
              {{ agent.skillsError }}
            </p>
          </div>
        </section>
      </template>
    </div>

    <!-- 右缘拖拽条：拖过最小宽度后继续拖一段才收起侧栏；进入收起待命时加深提示 -->
    <div
      class="absolute inset-y-0 -right-1 z-40 w-2 cursor-col-resize touch-none transition-colors"
      :class="sidebarCollapseArmed ? 'bg-accent-700/60' : sidebarResizing ? 'bg-accent-500/50' : 'hover:bg-accent-500/30'"
      role="separator"
      aria-orientation="vertical"
      title="拖拽调整宽度，继续拖动即收起"
      @pointerdown="startResize"
    ></div>
  </div>
</template>
