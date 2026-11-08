<template>
  <div class="panel p-4 text-neutral-900 dark:text-neutral-100">
    <!-- 快速添加 -->
    <section class="flex items-center gap-2 pb-1">
      <AppIcon name="plus" :size="15" class="text-neutral-400 dark:text-neutral-600" />
      <input
        v-model.trim="newTaskTitle"
        @keyup.enter="addTodo"
        placeholder="写下任务，回车添加"
        class="field flex-1"
      />
      <span class="hidden sm:inline font-mono text-[11px] text-neutral-400 dark:text-neutral-600">Enter</span>
      <button
        class="p-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors disabled:opacity-40"
        :disabled="!newTaskTitle.trim()"
        title="添加任务"
        @click="addTodo"
      >
        <AppIcon name="chevronRight" :size="15" />
      </button>
    </section>

    <!-- 工具栏：排序与多选 -->
    <section v-if="visibleCount > 0 || completedCount > 0" class="mt-2 flex items-center justify-between gap-2 border-b border-hairline pb-2 dark:border-hairline-dark">
      <span class="font-mono text-[11px] text-neutral-500 dark:text-neutral-400">{{ visibleCount }} 项</span>
      <div class="flex items-center gap-2">
        <label class="flex items-center gap-1.5 text-neutral-500 dark:text-neutral-400" title="排序方式">
          <AppIcon name="sliders" :size="13" />
          <select v-model="sortMode" class="cursor-pointer bg-transparent text-xs text-neutral-700 outline-none dark:text-neutral-300">
            <option v-for="option in LIST_SORT_OPTIONS" :key="option.value" :value="option.value">{{ option.label }}</option>
          </select>
        </label>
        <button
          class="rounded px-2 py-1 text-xs font-medium transition-colors"
          :class="selectionMode
            ? 'bg-accent-600 text-white dark:bg-accent-400 dark:text-accent-950'
            : 'text-neutral-600 hover:bg-accent-50 hover:text-accent-800 dark:text-neutral-400 dark:hover:bg-accent-500/10 dark:hover:text-accent-200'"
          :title="selectionMode ? '退出多选' : '多选任务'" @click="toggleSelectionMode">
          {{ selectionMode ? '退出选择' : '选择' }}
        </button>
      </div>
    </section>

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
    <section v-else-if="!loading && visibleCount === 0" class="py-16 text-center">
      <p class="text-sm text-neutral-500 dark:text-neutral-400">{{ completedCount ? '没有进行中的任务' : '还没有任务' }}</p>
      <p v-if="!completedCount" class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">在上方写下第一件事，回车即可添加</p>
      <p v-else class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">已完成的任务收在下方「已完成」区域</p>
    </section>

    <!-- 任务列表 -->
    <div v-else class="mt-2">
      <TodoListItem
        v-for="node in sortedTree"
        :key="node.id"
        :node="node"
        :selected-task-id="props.selectedTaskId"
        :is-breaking-down="props.isBreakingDown"
        :selection-mode="selectionMode"
        :selected-ids="selectedIds"
        @toggle-done="toggleDone"
        @delete-todo="deleteTodo"
        @add-subtask="addSubtask"
        @edit-subtask="editSubtask"
        @task-selected="handleTaskSelected"
        @breakdown-task="$emit('breakdown-task', $event)"
        @toggle-select="toggleSelect"
        @set-deadline="setDeadline"
        @move-todo="moveTodo"
      />
    </div>

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
import { ref, onMounted, computed, watch } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAuthStore } from '@/stores/auth'
import { collectDescendantIds } from '@/utils/taskGraph'
import { DEADLINE_PRESETS, resolveDeadlinePreset } from '@/utils/deadline'
import { LIST_SORT_OPTIONS, sortTodoTree } from '@/utils/todoSort'
import TodoListItem from '@/components/TodoListItem.vue'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  },
  isBreakingDown: {
    type: Boolean,
    default: false
  }
})

const todoStore = useTodoStore()
const authStore = useAuthStore()
const emit = defineEmits(['task-selected', 'breakdown-task', 'notify'])

const newTaskTitle = ref('')
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && todoStore.todos.length === 0) {
    await todoStore.fetchTodos()
  }
})

// 排序只影响显示，偏好存在本地，不写数据库
const SORT_STORAGE_KEY = 'todoheap:list-sort'
const storedSortMode = localStorage.getItem(SORT_STORAGE_KEY)
const sortMode = ref(LIST_SORT_OPTIONS.some(option => option.value === storedSortMode) ? storedSortMode : 'manual')
watch(sortMode, (value) => localStorage.setItem(SORT_STORAGE_KEY, value))

const sortedTree = computed(() => sortTodoTree(todoStore.treeNodes, sortMode.value))

const countNodes = (list) => list.reduce((acc, n) => acc + (n._isRef || n.completed_at ? 0 : 1) + countNodes(n.children || []), 0)
const visibleCount = computed(() => countNodes(todoStore.treeNodes))
const completedCount = computed(() => todoStore.todos.filter(todo => todo.completed_at).length)

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

  await todoStore.addTodo(title, { deadline: null })

  newTaskTitle.value = ''
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

const moveTodo = async ({ id, targetId, position }) => {
  const result = await todoStore.moveTodo(id, { targetId, position })
  if (!result.success && result.error) {
    emit('notify', { message: result.error })
  }
}

const handleTaskSelected = (taskId) => {
  emit('task-selected', taskId)
}
</script>
