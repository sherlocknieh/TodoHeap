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
import { AGENT_TOOL_LABELS } from '@/lib/agentTools'
import { persistedRef, SIDEBAR_FLOAT_BREAKPOINT } from '@/utils/uiState'
import { useResizablePanel, useResizableHeight } from '@/utils/resizablePanel'

const props = defineProps({
  show: { type: Boolean, default: false },
  activeView: { type: String, default: 'list' },
  selectedTaskId: { type: Number, default: null },
  // 当前活动栏入口，决定侧栏内容
  section: { type: String, default: 'list' },
  // 覆盖在内容之上，不挤压主视图（树视图使用）
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

// 侧栏分组默认展开，点击标题折叠；折叠选择本地保留（参考 VSCode 侧栏）
const collapsedSections = persistedRef('sidebar-sections', { sessions: false, skills: false }, {
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

// 技能可限定的工具清单，顺序与工具定义一致
const TOOL_OPTIONS = Object.entries(AGENT_TOOL_LABELS).map(([name, label]) => ({ name, label }))

const startNewSkill = () => {
  skillError.value = ''
  expandSection('skills')
  skillForm.value = { id: null, name: '', icon: DEFAULT_SKILL_ICON, prompt: '', tools: [] }
}

const startEditSkill = (skill) => {
  skillError.value = ''
  skillForm.value = {
    id: skill.id,
    name: skill.name,
    icon: skill.icon,
    prompt: skill.prompt,
    tools: [...(skill.tools || [])]
  }
}

// 空列表表示不限制，选中的工具会作为该技能的工具白名单
const toggleSkillTool = (name) => {
  const form = skillForm.value
  if (!form) return
  const tools = form.tools || []
  form.tools = tools.includes(name) ? tools.filter((item) => item !== name) : [...tools, name]
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

const insertSkill = (skill) => {
  agent.useSkill(skill.id)
  closeOnNarrowScreen()
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
const stats = computed(() => ({
  total: todoStore.todos.length,
  completed: todoStore.todos.filter(todo => todo.completed_at).length,
  pending: todoStore.todos.filter(todo => !todo.completed_at).length,
  trashed: todoStore.trashTodos.length
}))

// 完成率用于底部进度条
const completionRate = computed(() =>
  stats.value.total ? Math.round((stats.value.completed / stats.value.total) * 100) : 0
)

// 可用视图，回收站与列表、树同属视图层级
const views = computed(() => [
  { id: 'list', label: '列表', icon: 'list' },
  { id: 'tree', label: '树视图', icon: 'tree' },
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

        <!-- 统计 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">统计</p>
          <div class="px-2 space-y-1.5">
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">总任务</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ stats.total }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">已完成</span>
              <span class="font-mono text-accent-700 dark:text-accent-400">{{ stats.completed }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">进行中</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ stats.pending }}</span>
            </div>
          </div>
          <!-- 完成进度 -->
          <div class="px-2 pt-2">
            <div class="h-1.5 rounded-full bg-accent-100 dark:bg-accent-500/15 overflow-hidden">
              <div class="h-full rounded-full bg-accent-500 dark:bg-accent-400 transition-[width] duration-300"
                :style="{ width: completionRate + '%' }"></div>
            </div>
          </div>
        </section>
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
                <p class="mb-1 text-[11px] text-neutral-500 dark:text-neutral-400">只允许使用的工具，不选表示全部</p>
                <div class="flex max-h-24 flex-wrap gap-1 overflow-auto">
                  <button v-for="tool in TOOL_OPTIONS" :key="tool.name" type="button"
                    class="chip transition-colors"
                    :class="skillForm.tools?.includes(tool.name)
                      ? 'border-accent-500 bg-accent-50 text-accent-700 dark:border-accent-500 dark:bg-accent-500/10 dark:text-accent-300'
                      : 'border-neutral-300 hover:border-accent-400 dark:border-neutral-600'"
                    @click="toggleSkillTool(tool.name)">
                    {{ tool.label }}
                  </button>
                </div>
              </div>
              <p v-if="skillError" class="text-[11px] text-rose-600 dark:text-rose-400">{{ skillError }}</p>
              <div class="flex justify-end gap-1.5">
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
                  :title="skill.tools?.length ? `填入输入框（仅限 ${skill.tools.length} 个工具）` : '填入输入框'"
                  @click="insertSkill(skill)">
                  <AppIcon :name="skill.icon" :size="13" class="opacity-70" />
                  <span class="truncate text-sm text-neutral-700 dark:text-neutral-300">{{ skill.name }}</span>
                </button>
                <button class="p-1 rounded text-neutral-400 hover:text-accent-700 dark:hover:text-accent-300 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  title="编辑技能" @click.stop="startEditSkill(skill)">
                  <AppIcon name="edit" :size="12" />
                </button>
                <button class="p-1 rounded text-neutral-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors opacity-100 lg:opacity-0 lg:group-hover:opacity-100 lg:focus-visible:opacity-100"
                  title="删除技能" @click.stop="agent.deleteSkill(skill.id)">
                  <AppIcon name="trash" :size="12" />
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
