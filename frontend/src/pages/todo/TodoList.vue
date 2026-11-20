<template>
  <div class="text-neutral-900 dark:text-neutral-100" @click.capture="handleRowClickCapture">
    <!-- 页面操作：统计放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <p class="min-w-0 truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-mono">{{ visibleCount }}</span> 项待办
        <template v-if="completedCount">
          <span class="px-1.5 text-neutral-300 dark:text-neutral-700">·</span>
          <span class="font-mono">{{ completedCount }}</span> 项已完成
        </template>
      </p>
    </Teleport>

    <!-- 快速添加：外观对齐任务行，左侧虚线圈表示这是一条待填写的任务，回车即存 -->
    <div
      class="mt-4 ml-[22px] flex items-center gap-2.5 rounded-lg border border-hairline bg-surface py-1.5 pl-2 pr-1.5 shadow-[0_1px_2px_rgb(6_80_48/0.05)] transition-[border-color,box-shadow] focus-within:border-accent-500 focus-within:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:focus-within:border-accent-500/60">
      <span aria-hidden="true"
        class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">
        <AppIcon name="plus" :size="9" />
      </span>
      <input v-model.trim="newTaskTitle" @keyup.enter="addTodo" placeholder="添加任务，回车保存"
        class="h-5 min-w-0 flex-1 bg-transparent text-sm leading-5 text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-500" />
      <!-- 截止时间：未设置时是日历按钮，设置后变成任务行同款标签，随任务一起创建 -->
      <DateTimePicker :model-value="newTaskDeadline ? toDateTimeLocalValue(newTaskDeadline) : ''" quick-dates trigger-clear
        @confirm="applyAddDeadline">
        <template #trigger="{ open, toggle }">
          <button v-if="!newTaskDeadline" type="button"
            class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
            title="设置截止时间" aria-label="设置截止时间" :aria-expanded="open" @click="toggle">
            <AppIcon name="calendar" :size="14" />
          </button>
          <button v-else type="button" class="chip gap-1 font-medium transition-all duration-150 group-hover:pr-6"
            :class="deadlineChipClass(newTaskDeadline)"
            :title="`修改截止时间（${formatDeadlineLabel(newTaskDeadline)}）`" :aria-expanded="open" @click="toggle">
            <AppIcon name="clock" :size="10" />{{ formatDeadlineLabel(newTaskDeadline) }}
          </button>
        </template>
      </DateTimePicker>
      <button type="button"
        class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 disabled:opacity-30 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
        :disabled="!newTaskTitle.trim()" title="添加任务" aria-label="添加任务" @click="addTodo">
        <AppIcon name="chevronRight" :size="15" />
      </button>
    </div>

    <!-- 错误提示 -->
    <section v-if="errorText" class="mt-3 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400">
      <AppIcon name="alert" :size="14" />
      <span>{{ errorText }}</span>
    </section>

    <!-- 加载中 -->
    <section v-if="loading && !isFetched" class="mt-6 flex items-center gap-2 text-sm text-neutral-500">
      <AppIcon name="loader" :size="14" class="animate-spin" />
      加载中…
    </section>

    <!-- 空状态 -->
    <section v-if="!loading && visibleCount === 0 && !completedCount" class="mt-12 mb-8 text-center">
      <div
        class="mx-auto grid h-10 w-10 place-items-center rounded-full bg-accent-50 text-accent-700 dark:bg-accent-500/10 dark:text-accent-300">
        <AppIcon name="check" :size="18" />
      </div>
      <p class="mt-3 text-sm font-medium text-neutral-700 dark:text-neutral-300">还没有任务</p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-500">在上方写下第一件事，回车即可添加</p>
    </section>

    <!-- 任务列表 -->
    <template v-else-if="!loading">
      <!-- 待办标题：与已完成同款分组标题，收起后只留标题 -->
      <section v-if="visibleCount" class="mt-5 border-t border-hairline dark:border-hairline-dark">
        <div class="flex items-center gap-1 pt-2 pb-1">
          <button type="button"
            class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            @click="showActivePanel = !showActivePanel">
            <AppIcon :name="showActivePanel ? 'chevronDown' : 'chevronRight'" :size="13" />
            <span>待办</span>
            <span
              class="rounded-full bg-neutral-100 px-1.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{{ visibleCount }}</span>
          </button>
          <!-- 「待办/已完成标题栏的多选操作」：有选中时换成该区的选中操作，否则显示排序方式 + 全部展开/折叠 -->
          <div class="ml-auto flex items-center gap-1.5">
            <template v-if="activeSelectionCount">
              <span class="text-[11px] text-neutral-500 dark:text-neutral-400"
                title="Ctrl/⌘ 继续选择，Shift 连选">已选
                <span class="font-mono font-medium text-accent-700 dark:text-accent-300">{{ activeSelectionCount }}</span> 项</span>
              <button type="button"
                class="grid h-7 w-7 place-items-center rounded-md text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
                title="删除选中任务" aria-label="删除选中任务" @click="deleteSelectedTodos(activeSelectionKeys)">
                <AppIcon name="trash" :size="13" />
              </button>
              <button type="button"
                class="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
                title="取消选择" aria-label="取消选择" @click="removeSelection(activeSelectionKeys)">
                <AppIcon name="close" :size="13" />
              </button>
            </template>
            <template v-else>
              <label
                class="relative flex h-7 items-center rounded-md border border-hairline text-xs text-neutral-600 transition-colors hover:border-accent-500/60 dark:border-hairline-dark dark:text-neutral-300"
                title="排序方式">
                <AppIcon name="sliders" :size="13" class="pointer-events-none ml-2 opacity-70" />
                <select v-model="sortMode"
                  class="h-full cursor-pointer appearance-none bg-transparent pr-6 pl-1.5 outline-none">
                  <option v-for="option in LIST_SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
                </select>
                <AppIcon name="chevronDown" :size="12" class="pointer-events-none absolute right-1.5 opacity-60" />
              </label>
              <button v-if="foldableTasks.length" type="button"
                class="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-neutral-300 text-neutral-500 transition-colors hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-accent-400 dark:hover:text-accent-200"
                :title="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
                :aria-label="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
                :aria-expanded="!allCollapsed" @click="toggleAllCollapsed">
                <AppIcon :name="allCollapsed ? 'plus' : 'minus'" :size="8" />
              </button>
            </template>
          </div>
        </div>
      </section>

      <div v-if="showActivePanel" class="mt-1.5 space-y-1.5" data-task-section="active">
        <TodoListItem
          v-for="node in sortedTree"
          :key="node.id"
          :node="node"
          :parent-id="todoStore.rootTaskId"
          :selected-task-id="props.selectedTaskId"
          :selected-keys="selectionKeys"
          @toggle-done="toggleDone"
          @delete-todo="deleteTodo"
          @add-subtask="addSubtask"
          @edit-subtask="editSubtask"
          @task-selected="handleTaskSelected"
          @set-deadline="setDeadline"
          @move-todo="moveTodo"
          @unlink-task="unlinkTask"
        />
        <p v-if="visibleCount === 0" class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500">
          没有进行中的任务，已完成的收在下方
        </p>
      </div>
    </template>

    <!-- 已完成：无内容时不占位 -->
    <section v-if="completedCount" class="mt-6 border-t border-hairline dark:border-hairline-dark">
      <div class="flex items-center gap-1 pt-2 pb-1">
        <button type="button"
          class="flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
          @click="showCompletedPanel = !showCompletedPanel">
          <AppIcon :name="showCompletedPanel ? 'chevronDown' : 'chevronRight'" :size="13" />
          <span>已完成</span>
          <span
            class="rounded-full bg-neutral-100 px-1.5 font-mono text-[10px] leading-4 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400">{{ completedCount }}</span>
        </button>
        <!-- 已完成的多选操作就放在本区标题栏：有选择时显示删除/取消，否则保留整区清除 -->
        <div v-if="completedSelectionCount" class="ml-auto flex items-center gap-1.5">
          <span class="text-[11px] text-neutral-500 dark:text-neutral-400"
            title="Ctrl/⌘ 继续选择，Shift 连选">已选
            <span class="font-mono font-medium text-accent-700 dark:text-accent-300">{{ completedSelectionCount }}</span> 项</span>
          <button type="button"
            class="grid h-7 w-7 place-items-center rounded-md text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            title="删除选中任务" aria-label="删除选中任务" @click="deleteSelectedTodos(completedSelectionKeys)">
            <AppIcon name="trash" :size="13" />
          </button>
          <button type="button"
            class="grid h-7 w-7 place-items-center rounded-md text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-neutral-200"
            title="取消选择" aria-label="取消选择" @click="removeSelection(completedSelectionKeys)">
            <AppIcon name="close" :size="13" />
          </button>
        </div>
        <button v-else type="button"
          class="ml-auto grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          title="清除已完成任务" @click="clearCompletedTodos">
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
      <!-- 卡片左缘与待办行对齐：待办行用 22px 左内距给折叠开关留位，已完成行没有开关但保留同一缩进 -->
      <div v-if="showCompletedPanel" class="mt-1 pb-2 pl-[22px]" data-task-section="completed">
        <!-- [已完成按天分隔]：「日期 + 该天数量 + 分隔线」，最新完成的一天在最上面 -->
        <section v-for="(group, index) in completedGroups" :key="group.key" :class="index ? 'mt-3' : ''">
          <!-- 「日期分隔可点」：整行日期与分隔线都是折叠开关，只收起当天任务，标题与数量保留 -->
          <button type="button"
            class="mb-1.5 flex w-full cursor-pointer items-center gap-1.5 rounded-md pr-0.5 text-left transition-colors hover:text-neutral-700 dark:hover:text-neutral-200"
            :title="isCompletedDayCollapsed(group.key) ? `展开「${group.label}」的已完成任务` : `收起「${group.label}」的已完成任务`"
            :aria-expanded="!isCompletedDayCollapsed(group.key)" @click="toggleCompletedDay(group.key)">
            <AppIcon :name="isCompletedDayCollapsed(group.key) ? 'chevronRight' : 'chevronDown'" :size="11"
              class="shrink-0 text-neutral-400 dark:text-neutral-500" />
            <span class="text-[11px] font-medium text-neutral-400 dark:text-neutral-500">{{ group.label }}</span>
            <span class="font-mono text-[10px] text-neutral-300 dark:text-neutral-600">{{ group.count }}</span>
            <span aria-hidden="true" class="h-px flex-1 bg-neutral-200/80 dark:bg-neutral-800"></span>
          </button>
          <ul v-if="!isCompletedDayCollapsed(group.key)" class="space-y-1.5">
            <li v-for="t in group.todos" :key="t.id" data-task-item :data-task-id="t.id" @click="handleTaskSelected(t.id)" :class="[
              'group flex cursor-pointer items-center gap-2.5 rounded-lg text-sm transition-[border-color,box-shadow]',
              isCompletedRowSelected(t.id)
                ? 'border border-accent-500 bg-surface px-2.5 py-2 shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-accent-500/60 dark:bg-surface-dark dark:shadow-none'
                : 'border border-hairline bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-500/40 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40'
            ]">
              <button type="button"
                class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-accent-600 bg-accent-600 text-white transition-colors hover:bg-accent-700 hover:border-accent-700 dark:border-accent-400 dark:bg-accent-400 dark:text-accent-950"
                title="标记为未完成" aria-label="标记为未完成" @click.stop="toggleCompletedTodo(t)">
                <AppIcon name="check" :size="11" />
              </button>
              <MiddleEllipsis :text="t.title || '未命名任务'"
                class="min-w-0 flex-1 text-neutral-400 line-through dark:text-neutral-500" />
              <!-- 「已完成行删除」：单条删除走软删除，提示里可撤销，与整区「清除已完成」互不影响 -->
              <button type="button"
                class="grid h-7 w-7 shrink-0 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
                title="删除任务" aria-label="删除任务" @click.stop="deleteTodo(t.id)">
                <AppIcon name="trash" :size="13" />
              </button>
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAuthStore } from '@/stores/auth'
import { toDateTimeLocalValue, deadlineChipClass, formatDeadlineLabel } from '@/utils/deadline'
import { LIST_SORT_OPTIONS, sortTodoTree } from '@/utils/todoSort'
import { groupCompletedByDay } from '@/utils/completedGroups'
import { pruneSelection, selectRange, toggleSelection } from '@/utils/taskSelection'
import { listTreeOf } from '@/utils/rootTask'
import { persistedRef } from '@/utils/uiState'
import { pruneTaskCollapseTree, isTaskCollapsed, setTasksCollapsed } from '@/utils/taskCollapse'
import TodoListItem from '@/components/TodoListItem.vue'
import DateTimePicker from '@/components/DateTimePicker.vue'
import MiddleEllipsis from '@/components/MiddleEllipsis.vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  }
})

const todoStore = useTodoStore()
const authStore = useAuthStore()
const emit = defineEmits(['task-selected', 'notify'])

const newTaskTitle = ref('')
// 添加栏可以先选截止时间，创建任务时一并写入
const newTaskDeadline = ref('')
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && !todoStore.isFetched) {
    await todoStore.fetchTodos()
  }
})

// 排序只影响显示，偏好存在本地，不写数据库
const SORT_STORAGE_KEY = 'todoheap:list-sort'
const storedSortMode = localStorage.getItem(SORT_STORAGE_KEY)
// 旧的「按难度」选项已改名「按耗时」，沿用用户已存的偏好
const legacySortMode = storedSortMode === 'difficulty' ? 'duration' : storedSortMode
const sortMode = ref(LIST_SORT_OPTIONS.some(option => option.value === legacySortMode) ? legacySortMode : 'manual')
watch(sortMode, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

// 根任务是挂载点，不渲染成列表行：列表展示它的子级
const sortedTree = computed(() => listTreeOf(sortTodoTree(todoStore.treeNodes, sortMode.value)))

// 任务删除或移入回收站后，清掉共享折叠状态里已经不存在的任务 ID
watch(() => todoStore.treeNodes, (nodes) => {
  pruneTaskCollapseTree(nodes)
}, { immediate: true })

const countNodes = (list) => list.reduce((acc, n) => acc + (n._isRef || n.completed_at ? 0 : 1) + countNodes(n.children || []), 0)
const visibleCount = computed(() => countNodes(sortedTree.value))

// 带子任务的可见行：快速添加栏的折叠开关按整张列表生效
const foldableTasks = computed(() => {
  const list = []
  const walk = (nodes, level) => nodes.forEach((node) => {
    if (node._isRef) return
    if (node.children && node.children.length) list.push({ id: node.id, level })
    walk(node.children || [], level + 1)
  })
  walk(sortedTree.value, 0)
  return list
})

// 全部收起时按钮显示 +，点它展开全部；否则显示 −，点它折叠全部
const allCollapsed = computed(() => foldableTasks.value.length > 0
  && foldableTasks.value.every(({ id, level }) => isTaskCollapsed(id, level > 1)))

const toggleAllCollapsed = () => {
  setTasksCollapsed(foldableTasks.value.map(({ id }) => id), !allCollapsed.value)
}
const completedTodos = computed(() => todoStore.tasks.filter(todo => todo.completed_at))
const completedCount = computed(() => completedTodos.value.length)
// 已完成按完成日分组：分组与组内顺序见 utils/completedGroups.js
const completedGroups = computed(() => groupCompletedByDay(completedTodos.value))
// 日期分隔可点：按天收起当天已完成任务，收起集合只存在于当前会话
const collapsedCompletedDays = ref(new Set())
const isCompletedDayCollapsed = (key) => collapsedCompletedDays.value.has(key)
const toggleCompletedDay = (key) => {
  const next = new Set(collapsedCompletedDays.value)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  collapsedCompletedDays.value = next
}

// 多选：保存字符串任务 ID，锚点只用于 Shift 连选，普通点击即清空
const selection = ref(new Set())
const selectionAnchor = ref(null)
const selectionKeys = computed(() => [...selection.value])
// 操作条按分区显示：已完成键来自已完成列表，其余算待办
const completedKeySet = computed(() => new Set(completedTodos.value.map(todo => String(todo.id))))
const completedSelectionKeys = computed(() => selectionKeys.value.filter(key => completedKeySet.value.has(key)))
const activeSelectionKeys = computed(() => selectionKeys.value.filter(key => !completedKeySet.value.has(key)))
const completedSelectionCount = computed(() => completedSelectionKeys.value.length)
const activeSelectionCount = computed(() => activeSelectionKeys.value.length)
const isCompletedRowSelected = (id) => props.selectedTaskId === id || selection.value.has(String(id))
const clearSelection = () => {
  selection.value = new Set()
  selectionAnchor.value = null
}
// 只移除指定键：另一分区的选择保持不变
const removeSelection = (keys) => {
  if (!keys.length) return
  const next = new Set(selection.value)
  keys.forEach(key => next.delete(key))
  selection.value = next
  if (selectionAnchor.value && keys.includes(selectionAnchor.value)) selectionAnchor.value = null
}

// Ctrl/⌘ 切换、Shift 按当前可见行连选；普通点击清空选择后照常打开详情
const handleRowClickCapture = (event) => {
  const row = event.target.closest?.('[data-task-item]')
  if (!row || row.dataset.taskSelectable === 'false') return
  const key = row.dataset.taskId ? String(row.dataset.taskId) : ''
  if (!key) return
  // 行内的按钮、输入等交互优先，不让多选拦截
  if (event.target.closest('button, input, select, textarea, a, label')) return

  if (event.metaKey || event.ctrlKey) {
    event.preventDefault()
    event.stopPropagation()
    selection.value = toggleSelection(selection.value, key)
    selectionAnchor.value = key
    return
  }

  if (event.shiftKey && selectionAnchor.value) {
    const section = row.closest('[data-task-section]')
    const keys = section
      ? [...section.querySelectorAll('[data-task-item]')].map(el => String(el.dataset.taskId))
      : []
    // 锚点已收起或不在同一分区时，按普通点击处理
    if (keys.includes(selectionAnchor.value)) {
      event.preventDefault()
      event.stopPropagation()
      selection.value = selectRange(selection.value, keys, selectionAnchor.value, key)
      return
    }
  }

  clearSelection()
}

// 任务被删除或移入回收站后，清掉选择里已经不存在或不可选的任务
watch(() => todoStore.tasks, (tasks) => {
  const available = new Set(tasks.map(todo => String(todo.id)))
  selection.value = pruneSelection(selection.value, available)
  if (selectionAnchor.value && !available.has(selectionAnchor.value)) selectionAnchor.value = null
})

// 批量删除：只处理传入分区的键；祖先被删后其后代已不在列表里，直接跳过；撤销按回收站 ID 整批恢复
const deleteSelectedTodos = async (keys) => {
  const targets = [...keys]
  removeSelection(targets)

  const trashedIds = []
  for (const key of targets) {
    const todo = todoStore.tasks.find(item => String(item.id) === key)
    if (!todo) continue
    const result = await todoStore.deleteTodo(todo.id)
    if (result.success && result.data?.id != null) trashedIds.push(result.data.id)
  }

  if (!targets.length) return
  emit('notify', {
    message: `已删除 ${targets.length} 项任务`,
    undo: trashedIds.length
      ? () => Promise.all(trashedIds.map(id => todoStore.restoreTodo(id)))
      : null
  })
}

// 已完成区域默认展开，与列表同属一页；展开状态本地保留
const showCompletedPanel = persistedRef('list-show-completed', true)
// 待办区域的收起状态同样本地保留
const showActivePanel = persistedRef('list-show-active', true)

// 分区收起后操作条不可见，清掉该区选择，避免看不见的选中被误删
watch(showActivePanel, (open) => {
  if (!open) removeSelection(activeSelectionKeys.value)
})
watch(showCompletedPanel, (open) => {
  if (!open) removeSelection(completedSelectionKeys.value)
})

const toggleCompletedTodo = async (todo) => {
  if (!todo?.id) return
  const previousCompletedAt = todo.completed_at ?? null
  const result = await todoStore.toggleDone(todo.id)
  if (!result.success) return

  emit('notify', {
    message: `已恢复「${todo.title || '任务'}」`,
    undo: () => todoStore.updateTodo(todo.id, { completed_at: previousCompletedAt })
  })
}

// 清除已完成：整棵已完成子树移入回收站，提示里可整体撤销
const clearCompletedTodos = async () => {
  if (!completedCount.value) return
  if (!window.confirm(`将 ${completedCount.value} 个已完成任务及其子任务移入回收站？`)) return

  const selectedWasCompleted = completedTodos.value.some(todo => todo.id === props.selectedTaskId)
  const result = await todoStore.deleteCompletedTodos()
  if (!result.success) return

  // 选中的任务随清除消失时收起详情面板
  if (selectedWasCompleted) {
    emit('task-selected', null)
  }

  const restoredIds = result.data?.ids || []
  emit('notify', {
    message: `已清除 ${result.count} 个已完成任务`,
    undo: restoredIds.length
      ? () => Promise.all(restoredIds.map(id => todoStore.restoreTodo(id)))
      : null
  })
}

const addTodo = async () => {
  const title = newTaskTitle.value.trim()
  if (!title) return

  await todoStore.addTodo(title, { deadline: newTaskDeadline.value || null })

  newTaskTitle.value = ''
  newTaskDeadline.value = ''
}

// 选择器确认后写入本地时间，随任务一起创建；清空时回到未设置
const applyAddDeadline = (value) => {
  newTaskDeadline.value = value ? new Date(value).toISOString() : ''
}

const addSubtask = async (parentId, startEditCb) => {
  const result = await todoStore.addTodo('(新任务)', {
    parent_id: parentId
  })
  if (result.success && result.data) {
    startEditCb(result.data.id, result.data.title)
  }
}

const editSubtask = async (id, newTitle) => {
  await todoStore.updateTodo(id, { title: newTitle })
}

const deleteTodo = async (id) => {
  const title = todoStore.findTodoById(id)?.title || '任务'
  const result = await todoStore.deleteTodo(id)
  if (!result.success) return

  // 回收站记录的是真实 ID，撤销时按它恢复
  const trashId = result.data?.id ?? id
  emit('notify', {
    message: `已删除「${title}」`,
    undo: () => todoStore.restoreTodo(trashId)
  })
}

const toggleDone = async (todo) => {
  const previousCompletedAt = todo.completed_at ?? null
  const result = await todoStore.toggleDone(todo.id)
  if (!result.success) return

  const title = todo.title || '任务'
  emit('notify', {
    message: previousCompletedAt ? `已恢复「${title}」` : `已完成「${title}」`,
    undo: () => todoStore.updateTodo(todo.id, { completed_at: previousCompletedAt })
  })
}

const setDeadline = async ({ id, deadline }) => {
  const previousDeadline = todoStore.findTodoById(id)?.deadline ?? null
  const result = await todoStore.updateTodo(id, { deadline })
  if (!result.success) return

  emit('notify', {
    message: deadline ? '已设置截止时间' : '已清除截止时间',
    undo: () => todoStore.updateTodo(id, { deadline: previousDeadline })
  })
}

const moveTodo = async ({ id, targetId, position, sourceParentId, targetParentId }) => {
  const result = await todoStore.moveTodo(id, { targetId, position, sourceParentId, targetParentId })
  if (!result.success && result.error) {
    emit('notify', { message: result.error })
  }
}

// 取消链接：只摘掉这条父链接；最后一个父级被摘掉时任务回到顶层
const unlinkTask = async ({ parentId, childId }) => {
  if (childId == null) return
  const result = await todoStore.unlinkTodo(parentId, childId)
  if (!result.success || result.data?.unchanged) return

  emit('notify', {
    message: '已取消链接',
    undo: () => {
      const actions = [todoStore.updateTodo(parentId, { child_ids: result.data.previousChildIds })]
      if (result.data.rootChildIds != null) {
        actions.push(todoStore.updateTodo(todoStore.rootTaskId, { child_ids: result.data.rootChildIds }))
      }
      return Promise.all(actions)
    }
  })
}

const handleTaskSelected = (taskId) => {
  emit('task-selected', taskId)
}
</script>
