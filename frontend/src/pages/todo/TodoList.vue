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
      <p class="text-sm text-neutral-500 dark:text-neutral-400">还没有任务</p>
      <p class="mt-1 text-xs text-neutral-400 dark:text-neutral-600">在上方写下第一件事，回车即可添加</p>
    </section>

    <!-- 任务列表 -->
    <div v-else class="mt-2">
      <TodoListItem
        v-for="node in filteredTree"
        :key="node.id"
        :node="node"
        :selected-task-id="props.selectedTaskId"
        :is-breaking-down="props.isBreakingDown"
        @toggle-done="toggleDone"
        @delete-todo="deleteTodo"
        @add-subtask="addSubtask"
        @edit-subtask="editSubtask"
        @task-selected="handleTaskSelected"
        @breakdown-task="$emit('breakdown-task', $event)"
      />
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useTodoStore } from '@/stores/todos'
import { useAuthStore } from '@/stores/auth'
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
const emit = defineEmits(['task-selected', 'breakdown-task'])

const newTaskTitle = ref('')
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && todoStore.todos.length === 0) {
    await todoStore.fetchTodos()
  }
})

const filteredTree = computed(() => todoStore.treeNodes)
const countNodes = (list) => list.reduce((acc, n) => acc + (n._isRef ? 0 : 1) + countNodes(n.children || []), 0)
const visibleCount = computed(() => countNodes(filteredTree.value))

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
  await todoStore.deleteTodo(id)
}

const toggleDone = async (todo) => {
  await todoStore.toggleDone(todo.id)
}

const handleTaskSelected = (taskId) => {
  emit('task-selected', taskId)
}
</script>
