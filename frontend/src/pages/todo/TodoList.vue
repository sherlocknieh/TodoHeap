<template>
  <div class="text-neutral-900 dark:text-neutral-100">
    <!-- 页面操作：统计、排序与多选入口放进主区域顶栏 -->
    <Teleport defer to="#main-topbar-actions">
      <p class="min-w-0 truncate whitespace-nowrap text-xs text-neutral-500 dark:text-neutral-400">
        <span class="font-mono">{{ visibleCount }}</span> 项待办
        <template v-if="completedCount">
          <span class="px-1.5 text-neutral-300 dark:text-neutral-700">·</span>
          <span class="font-mono">{{ completedCount }}</span> 项已完成
        </template>
      </p>

      <div class="flex shrink-0 items-center gap-1.5">
        <label
          class="relative flex h-8 items-center rounded-md border border-hairline text-xs text-neutral-600 transition-colors hover:border-accent-500/60 dark:border-hairline-dark dark:text-neutral-300"
          title="排序方式">
          <AppIcon name="sliders" :size="13" class="pointer-events-none ml-2 opacity-70" />
          <select v-model="sortMode" class="h-full cursor-pointer appearance-none bg-transparent pr-6 pl-1.5 outline-none">
            <option v-for="option in LIST_SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
          <AppIcon name="chevronDown" :size="12" class="pointer-events-none absolute right-1.5 opacity-60" />
        </label>

        <button type="button" class="flex h-8 items-center gap-1.5 rounded-md border px-2 text-xs font-medium transition-colors"
          :class="selectionMode
            ? 'border-accent-600 bg-accent-600 text-white dark:border-accent-400 dark:bg-accent-400 dark:text-accent-950'
            : 'border-hairline text-neutral-600 hover:border-accent-500/60 hover:text-accent-800 dark:border-hairline-dark dark:text-neutral-300 dark:hover:text-accent-200'"
          :title="selectionMode ? '退出多选' : '多选任务'" @click="toggleSelectionMode">
          <AppIcon name="check" :size="13" />
          <span>{{ selectionMode ? '完成选择' : '选择' }}</span>
        </button>
      </div>
    </Teleport>

    <!-- 快速添加：外观对齐任务行，左侧虚线圈表示这是一条待填写的任务，回车即存 -->
    <div
      class="mt-4 ml-1 flex items-center gap-2.5 rounded-lg border border-hairline bg-surface py-1.5 pl-2 pr-1.5 shadow-[0_1px_2px_rgb(6_80_48/0.05)] transition-[border-color,box-shadow] focus-within:border-accent-500 focus-within:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:focus-within:border-accent-500/60">
      <span aria-hidden="true"
        class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-dashed border-neutral-300 text-neutral-400 dark:border-neutral-600 dark:text-neutral-500">
        <AppIcon name="plus" :size="9" />
      </span>
      <input v-model.trim="newTaskTitle" @keyup.enter="addTodo" placeholder="添加任务，回车保存"
        class="h-5 min-w-0 flex-1 bg-transparent text-sm leading-5 text-neutral-800 outline-none placeholder:text-neutral-400 dark:text-neutral-200 dark:placeholder:text-neutral-500" />
      <!-- 折叠开关与任务行同位置同尺寸；这里作用范围是整张列表 -->
      <button v-if="foldableTasks.length" type="button"
        class="grid h-4 w-4 shrink-0 place-items-center rounded-full border border-neutral-300 text-neutral-500 transition-colors hover:border-accent-500 hover:text-accent-700 dark:border-neutral-600 dark:text-neutral-400 dark:hover:border-accent-400 dark:hover:text-accent-200"
        :title="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
        :aria-label="allCollapsed ? '展开全部子任务' : '折叠全部子任务'"
        :aria-expanded="!allCollapsed" @click="toggleAllCollapsed">
        <AppIcon :name="allCollapsed ? 'plus' : 'minus'" :size="8" />
      </button>
      <!-- 截止时间：未设置时是日历按钮，设置后变成任务行同款标签，随任务一起创建 -->
      <div class="relative" data-add-deadline>
        <button v-if="!newTaskDeadline" type="button"
          class="grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-500 dark:hover:bg-accent-500/10 dark:hover:text-accent-200"
          title="设置截止时间" aria-label="设置截止时间" @click="toggleAddDeadlineMenu">
          <AppIcon name="calendar" :size="14" />
        </button>
        <button v-else type="button" class="chip gap-1 font-medium transition-colors"
          :class="deadlineChipClass(newTaskDeadline)"
          :title="`修改截止时间（${formatDeadlineLabel(newTaskDeadline)}）`" @click="toggleAddDeadlineMenu">
          <AppIcon name="clock" :size="10" />{{ formatDeadlineLabel(newTaskDeadline) }}
        </button>
        <div v-if="showAddDeadline" class="absolute right-0 top-full z-30 mt-1 w-48 panel py-1 shadow-lg">
          <button v-for="preset in DEADLINE_PRESETS" :key="preset.value" type="button"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-neutral-700 transition-colors hover:bg-accent-50 dark:text-neutral-300 dark:hover:bg-accent-500/10"
            @click="applyAddDeadline(preset.value)">
            <AppIcon :name="preset.icon" :size="13" />
            <span>{{ preset.label }}</span>
          </button>
          <label class="block px-2.5 py-1.5 text-xs text-neutral-500">
            自定义时间
            <input v-model="addCustomDeadline" type="datetime-local" class="field mt-1 text-xs"
              @change="applyAddDeadline('custom')" />
          </label>
          <button v-if="newTaskDeadline" type="button"
            class="flex w-full items-center gap-2 px-2.5 py-1.5 text-sm text-rose-600 transition-colors hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40"
            @click="applyAddDeadline('clear')">
            <AppIcon name="close" :size="13" />
            <span>清除截止时间</span>
          </button>
        </div>
      </div>
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
    <div v-else-if="!loading" class="mt-1.5 space-y-1.5">
      <TodoListItem
        v-for="node in sortedTree"
        :key="node.id"
        :node="node"
        :parent-id="todoStore.rootTaskId"
        :selected-task-id="props.selectedTaskId"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        @toggle-done="toggleDone"
        @delete-todo="deleteTodo"
        @add-subtask="addSubtask"
        @edit-subtask="editSubtask"
        @task-selected="handleTaskSelected"
        @toggle-select="toggleSelect"
        @set-deadline="setDeadline"
        @move-todo="moveTodo"
        @unlink-task="unlinkTask"
      />
      <p v-if="visibleCount === 0" class="py-10 text-center text-xs text-neutral-400 dark:text-neutral-500">
        没有进行中的任务，已完成的收在下方
      </p>
    </div>

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
        <button type="button"
          class="ml-auto grid h-7 w-7 place-items-center rounded-md text-neutral-400 transition-colors hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
          title="清除已完成任务" @click="clearCompletedTodos">
          <AppIcon name="trash" :size="13" />
        </button>
      </div>
      <ul v-if="showCompletedPanel" class="mt-1 space-y-1.5 pb-2">
        <li v-for="t in completedTodos" :key="t.id" @click="handleTaskSelected(t.id)" :class="[
          'group flex cursor-pointer items-center gap-2.5 rounded-lg text-sm transition-[border-color,box-shadow]',
          props.selectedTaskId === t.id
            ? 'border-l-2 border-l-accent-600 bg-accent-100/80 py-[9px] pl-[9px] pr-[11px] shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-l-accent-400 dark:bg-accent-500/20 dark:shadow-none'
            : 'border border-hairline bg-surface px-2.5 py-2 shadow-[0_1px_2px_rgb(6_80_48/0.05)] hover:border-accent-200 hover:shadow-[0_3px_10px_rgb(6_80_48/0.09)] dark:border-hairline-dark dark:bg-surface-dark dark:shadow-none dark:hover:border-accent-500/40'
        ]">
          <button type="button"
            class="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-[1.5px] border-accent-600 bg-accent-600 text-white transition-colors hover:bg-accent-700 hover:border-accent-700 dark:border-accent-400 dark:bg-accent-400 dark:text-accent-950"
            title="标记为未完成" aria-label="标记为未完成" @click.stop="toggleCompletedTodo(t)">
            <AppIcon name="check" :size="11" />
          </button>
          <MiddleEllipsis :text="t.title || '未命名任务'"
            class="min-w-0 flex-1 text-neutral-400 line-through dark:text-neutral-500" />
        </li>
      </ul>
    </section>

    <!-- 多选操作条 -->
    <Transition name="fade">
      <div v-if="selectionMode"
        class="fixed bottom-24 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1.5 panel px-3 py-2 shadow-lg">
        <span class="mr-1 text-xs text-neutral-600 dark:text-neutral-400">
          已选 <span class="font-mono font-semibold text-neutral-900 dark:text-neutral-100">{{ selectedIds.length }}</span>
        </span>
        <button class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!selectedIds.length" title="标为完成" @click="batchSetCompleted(true)">
          <AppIcon name="check" :size="15" />
        </button>
        <button class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!selectedIds.length" title="取消完成" @click="batchSetCompleted(false)">
          <AppIcon name="undo" :size="15" />
        </button>
        <div class="relative">
          <button class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="!selectedIds.length" title="设置截止时间" @click="showBatchDeadline = !showBatchDeadline">
            <AppIcon name="calendar" :size="15" />
          </button>
          <div v-if="showBatchDeadline"
            class="absolute bottom-full right-0 mb-2 w-40 panel shadow-lg z-50 py-1">
            <button v-for="preset in DEADLINE_PRESETS" :key="preset.value" type="button"
              class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-neutral-700 dark:text-neutral-300 hover:bg-accent-50 dark:hover:bg-accent-500/10 transition-colors"
              @click="batchSetDeadline(preset.value)">
              <AppIcon :name="preset.icon" :size="13" />
              <span>{{ preset.label }}</span>
            </button>
            <button type="button"
              class="w-full px-2.5 py-1.5 flex items-center gap-2 text-sm text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
              @click="batchSetDeadline('clear')">
              <AppIcon name="close" :size="13" />
              <span>清除截止时间</span>
            </button>
          </div>
        </div>
        <button class="p-1.5 rounded text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="!selectedIds.length" title="删除选中任务" @click="batchDelete">
          <AppIcon name="trash" :size="15" />
        </button>
        <button class="p-1.5 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
          title="退出选择" @click="toggleSelectionMode">
          <AppIcon name="close" :size="15" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAuthStore } from '@/stores/auth'
import { collectDescendantIds } from '@/utils/taskGraph'
import { DEADLINE_PRESETS, resolveDeadlinePreset, toDateTimeLocalValue, deadlineChipClass, formatDeadlineLabel } from '@/utils/deadline'
import { LIST_SORT_OPTIONS, sortTodoTree } from '@/utils/todoSort'
import { listTreeOf } from '@/utils/rootTask'
import { persistedRef } from '@/utils/uiState'
import { pruneTaskCollapseTree, isTaskCollapsed, setTasksCollapsed } from '@/utils/taskCollapse'
import TodoListItem from '@/components/TodoListItem.vue'
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
const showAddDeadline = ref(false)
const addCustomDeadline = ref('')
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && !todoStore.isFetched) {
    await todoStore.fetchTodos()
  }
  document.addEventListener('pointerdown', closeAddDeadlineOnOutside)
})

onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', closeAddDeadlineOnOutside)
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

// 已完成区域默认展开，与列表同属一页；展开状态本地保留
const showCompletedPanel = persistedRef('list-show-completed', true)

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

// 多选模式：选中集合按真实任务 ID 记录
const selectionMode = ref(false)
const selectedIds = ref([])
const showBatchDeadline = ref(false)

const toggleSelectionMode = () => {
  selectionMode.value = !selectionMode.value
  selectedIds.value = []
  showBatchDeadline.value = false
}

const toggleSelect = (id) => {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter(item => item !== id)
    : [...selectedIds.value, id]
}

// 父子同时选中时只处理父任务，避免重复级联
const selectedRootIds = computed(() => {
  const ids = [...selectedIds.value]
  const covered = new Set()
  ids.forEach(id => collectDescendantIds(todoStore.todos, id).forEach(childId => covered.add(childId)))
  return ids.filter(id => !covered.has(id))
})

// 批量操作结束后退出选择模式，并给出可撤销的提示
const finishBatch = (message, undo) => {
  toggleSelectionMode()
  emit('notify', { message, undo })
}

const batchSetCompleted = async (completed) => {
  const snapshots = selectedRootIds.value
    .map(id => ({ todo: todoStore.findTodoById(id), id }))
    .filter(({ todo }) => todo && Boolean(todo.completed_at) !== completed)
    .map(({ todo, id }) => ({ id, completed_at: todo.completed_at ?? null }))
  if (!snapshots.length) return

  for (const item of snapshots) {
    await todoStore.updateTodo(item.id, { completed_at: completed ? new Date().toISOString() : null })
  }

  finishBatch(
    completed ? `已完成 ${snapshots.length} 项` : `已恢复 ${snapshots.length} 项`,
    () => Promise.all(snapshots.map(item => todoStore.updateTodo(item.id, { completed_at: item.completed_at })))
  )
}

const batchSetDeadline = async (preset) => {
  const deadline = resolveDeadlinePreset(preset)
  const snapshots = selectedRootIds.value.map(id => ({
    id,
    deadline: todoStore.findTodoById(id)?.deadline ?? null
  }))
  if (!snapshots.length) return

  for (const item of snapshots) {
    await todoStore.updateTodo(item.id, { deadline })
  }

  finishBatch('已更新截止时间', () =>
    Promise.all(snapshots.map(item => todoStore.updateTodo(item.id, { deadline: item.deadline }))))
}

const batchDelete = async () => {
  const ids = selectedRootIds.value
  if (!ids.length) return
  if (!window.confirm(`将选中的 ${ids.length} 个任务及其子任务移入回收站？`)) return

  const removedIds = []
  for (const id of ids) {
    const result = await todoStore.deleteTodo(id)
    if (result.success) removedIds.push(result.data?.id ?? id)
  }

  finishBatch(`已移入回收站 ${removedIds.length} 项`, () =>
    Promise.all(removedIds.map(id => todoStore.restoreTodo(id))))
}

const addTodo = async () => {
  const title = newTaskTitle.value.trim()
  if (!title) return

  await todoStore.addTodo(title, { deadline: newTaskDeadline.value || null })

  newTaskTitle.value = ''
  newTaskDeadline.value = ''
}

const toggleAddDeadlineMenu = () => {
  if (!showAddDeadline.value) {
    addCustomDeadline.value = newTaskDeadline.value ? toDateTimeLocalValue(newTaskDeadline.value) : ''
  }
  showAddDeadline.value = !showAddDeadline.value
}

const applyAddDeadline = (preset) => {
  if (preset === 'custom') {
    if (!addCustomDeadline.value) return
    newTaskDeadline.value = new Date(addCustomDeadline.value).toISOString()
  } else {
    newTaskDeadline.value = resolveDeadlinePreset(preset) || ''
  }
  showAddDeadline.value = false
}

// 点菜单外收起，与任务行的截止菜单行为一致
const closeAddDeadlineOnOutside = (event) => {
  if (!showAddDeadline.value) return
  if (event.target.closest?.('[data-add-deadline]')) return
  showAddDeadline.value = false
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
