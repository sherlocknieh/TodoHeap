<script setup>
import { computed, nextTick, onMounted, ref, watch } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAgentStore } from '@/stores/agent'
import { useAuthStore } from '@/stores/auth'
import { storeToRefs } from 'pinia'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  show: { type: Boolean, default: false },
  activeView: { type: String, default: 'list' },
  selectedTaskId: { type: Number, default: null },
  // 当前活动栏入口，决定侧栏内容
  section: { type: String, default: 'list' },
  // 覆盖在内容之上，不挤压主视图（树视图使用）
  overlay: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'switch-view', 'create-task'])

// 为模板提供 `show` 绑定
const show = computed(() => props.show)

const todoStore = useTodoStore()
const agent = useAgentStore()
const authStore = useAuthStore()

const editingSessionId = ref(null)
const editingTitle = ref('')
const renameInput = ref(null)

// AI 侧栏展示会话列表，进入 AI 入口时确保会话已载入
const ensureAgent = () => {
  if (props.section === 'ai') agent.init(authStore.user?.id)
}
onMounted(ensureAgent)
watch(() => props.section, ensureAgent)

const closeOnNarrowScreen = () => {
  if (window.innerWidth < 1024) emit('close')
}

const handleNewSession = () => {
  cancelSessionRename()
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

// 日程侧栏的概览：只统计未完成任务
const scheduleStats = computed(() => {
  const now = new Date()
  const startOfToday = new Date(now)
  startOfToday.setHours(0, 0, 0, 0)
  const endOfToday = new Date(now)
  endOfToday.setHours(23, 59, 59, 999)

  let overdue = 0
  let today = 0
  let upcoming = 0
  let undated = 0

  for (const todo of todoStore.todos) {
    if (todo.completed_at) continue
    if (!todo.deadline) {
      undated += 1
      continue
    }
    const deadline = new Date(todo.deadline)
    if (deadline < startOfToday) overdue += 1
    else if (deadline <= endOfToday) today += 1
    else upcoming += 1
  }

  return { overdue, today, upcoming, undated }
})

// 切换视图
const switchView = (view) => {
  emit('switch-view', view)
  // 小屏下切换视图后自动关闭侧栏
  if (window.innerWidth < 1024) {
    emit('close')
  }
}


</script>
<template>
  <!-- 小屏浮层 / 大屏常驻左栏 -->
  <div
    v-if="show"
    :class="[
      'absolute top-0 bottom-0 left-12 w-64 max-w-[85vw] bg-surface dark:bg-surface-dark flex flex-col z-30 border-r border-hairline dark:border-hairline-dark',
      overlay ? 'shadow-lg' : 'lg:static lg:z-10 lg:shadow-none'
    ]"
  >
    <!-- 头部 -->
    <header class="shrink-0 h-11 px-3 flex items-center justify-between border-b border-hairline dark:border-hairline-dark">
      <span class="eyebrow">{{ sectionTitle }}</span>
      <button
        @click="$emit('close')"
        :class="[
          'p-1.5 -mr-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors',
          overlay ? '' : 'lg:hidden'
        ]"
        title="关闭侧栏"
      >
        <AppIcon name="close" :size="15" />
      </button>
    </header>

    <!-- 内容：按活动栏入口切换 -->
    <div class="flex-1 min-h-0 overflow-auto px-2 py-3 space-y-6">
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
        <!-- 日程概览 -->
        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">概览</p>
          <div class="px-2 space-y-1.5">
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">逾期</span>
              <span class="font-mono" :class="scheduleStats.overdue ? 'text-rose-600 dark:text-rose-400' : 'text-neutral-900 dark:text-neutral-100'">{{ scheduleStats.overdue }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">今天</span>
              <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ scheduleStats.today }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">以后</span>
              <span class="font-mono text-neutral-900 dark:text-neutral-100">{{ scheduleStats.upcoming }}</span>
            </div>
            <div class="flex items-baseline justify-between text-sm">
              <span class="text-neutral-600 dark:text-neutral-400">未设置时间</span>
              <span class="font-mono text-neutral-900 dark:text-neutral-100">{{ scheduleStats.undated }}</span>
            </div>
          </div>
        </section>

        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">说明</p>
          <p class="px-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            在任务详情里设置截止时间后，会按日期出现在日程中；勾选完成即从日程移除。
          </p>
        </section>
      </template>

      <template v-else>
        <!-- 对话会话：新建、切换、重命名、删除 -->
        <section class="space-y-0.5">
          <div class="px-2 pb-1.5 flex items-center justify-between">
            <p class="eyebrow">对话</p>
            <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-700 dark:hover:bg-accent-500/10 dark:hover:text-accent-300 transition-colors"
              title="新建对话" @click="handleNewSession">
              <AppIcon name="plus" :size="14" />
            </button>
          </div>
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
        </section>

        <section class="space-y-0.5">
          <p class="eyebrow px-2 pb-1.5">说明</p>
          <p class="px-2 text-xs leading-5 text-neutral-500 dark:text-neutral-400">
            直接告诉 Agent 要做什么，它会读写任务与日程；会话按话题分开保存，模型可在「设置 → 模型接入」中切换。
          </p>
        </section>
      </template>
    </div>
  </div>
</template>
