<template>
  <div class="max-w-4xl mx-auto text-slate-900" ref="shellRef">
    <!-- 快速添加任务 -->
    <section class="flex gap-2 items-center bg-white rounded-lg">
      <input
        v-model.trim="newTaskTitle"
        @keyup.enter="addTodo"
        placeholder="快速添加：输入任务，回车添加"
        class="flex-1 border border-slate-200 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:outline-none"
      />
      <input
        v-model="newTaskDate"
        type="date"
        class="border border-slate-200 rounded-md px-3 py-2 text-sm w-32 bg-white text-left hover:bg-slate-50 transition"
      />
      <button
        class="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-md px-4 py-2 text-sm transition"
        @click="addTodo"
      >
        添加任务
      </button>
    </section>

    <section v-if="errorText" class="mt-4 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 font-semibold">
      <span>⚠</span>
      <span>{{ errorText }}</span>
    </section>

    <section v-if="loading && !isFetched" class="mt-4 bg-slate-100 border border-slate-200 text-slate-500 rounded-lg px-4 py-3">加载中，请稍候...</section>

    <section v-if="!loading && visibleCount === 0" class="mt-8 text-center border border-dashed border-slate-200 rounded-lg bg-slate-50 py-12 text-slate-500">
      <div class="text-4xl mb-3 opacity-60">📋</div>
      <p class="text-lg font-semibold text-slate-700 mb-1">暂无任务</p>
      <p class="text-sm">点击上方输入框快速添加任务</p>
    </section>

    <div v-else class="mt-6 bg-white rounded-lg border border-slate-200 overflow-hidden">
      <ul class="divide-y divide-slate-100">
      <TodoListItem
        v-for="node in filteredTree"
        :key="node.id"
        :node="node"
        :selected-task-id="props.selectedTaskId"
        @toggle-done="toggleDone"
        @delete-todo="deleteTodo"
        @add-subtask="addSubtask"
        @edit-subtask="editSubtask"
        @task-selected="handleTaskSelected"
      />
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted, computed, nextTick, watch } from 'vue'
import { useTodoStore } from '../../stores/todos'
import { useAuthStore } from '../../stores/auth'
import TodoListItem from '../../components/TodoListItem.vue'

const props = defineProps({
  selectedTaskId: {
    type: Number,
    default: null
  }
})

const todoStore = useTodoStore()
const authStore = useAuthStore()
const emit = defineEmits(['task-selected'])

const newTaskTitle = ref('')
const newTaskDate = ref('')
const newTaskPriority = ref(1)
const shellRef = ref(null)
const dateInputRef = ref(null)

const onDateChange = (e) => {
  newTaskDate.value = e.target.value
}


const todos = computed(() => todoStore.todos)
const loading = computed(() => todoStore.loading)
const isFetched = computed(() => todoStore.isFetched)
const errorText = computed(() => todoStore.error)

onMounted(async () => {
  if (authStore.isAuthenticated && todos.value.length === 0) {
    await todoStore.fetchTodos()
  }
})


// 以滴答清单的分组方式进行树构建与过滤
const taskTree = computed(() => {
  const nodes = todos.value.map((item) => ({
    id: item.id,
    title: item.title,
    status: item.status || 'todo',
    priority: item.priority ?? 0,
    deadline: item.deadline || null,
    parent_id: item.parent_id,
    children: []
  }))

  const map = new Map()
  nodes.forEach((n) => map.set(n.id, n))

  const roots = []
  nodes.forEach((n) => {
    if (n.parent_id && map.has(n.parent_id)) {
      map.get(n.parent_id).children.push(n)
    } else {
      roots.push(n)
    }
  })

  const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
  const sortTree = (arr) => {
    arr.sort(sortFn)
    arr.forEach((child) => sortTree(child.children))
  }
  sortTree(roots)
  return roots
})

const isToday = (deadline) => {
  if (!deadline) return false
  const d = new Date(deadline)
  const now = new Date()
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate()
}

const isUpcoming = (deadline) => {
  if (!deadline) return false
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const target = new Date(deadline)
  target.setHours(0, 0, 0, 0)
  return target > today
}

const matchesFilters = (node) => {
  // 过滤功能已移除：默认展示所有节点
  return true
}

const filterTree = (list) => {
  return list
    .map((n) => {
      const children = filterTree(n.children || [])
      const match = matchesFilters(n)
      if (match || children.length) {
        return { ...n, children }
      }
      return null
    })
    .filter(Boolean)
}

const filteredTree = computed(() => filterTree(taskTree.value))
const countNodes = (list) => list.reduce((acc, n) => acc + 1 + countNodes(n.children || []), 0)
const visibleCount = computed(() => countNodes(filteredTree.value))

// filters 已移除

const addTodo = async () => {
  const title = newTaskTitle.value.trim()
  if (!title) return

  const deadline = newTaskDate.value ? new Date(newTaskDate.value).toISOString() : null
  const result = await todoStore.addTodo(title, {
    priority: Number(newTaskPriority.value),
    deadline
  })
  
  // 乐观更新：无论成功与否都立即清空输入框
  newTaskTitle.value = ''
  newTaskDate.value = ''
  newTaskPriority.value = 1
}

const addSubtask = async (parentId, startEditCb) => {
  const result = await todoStore.addTodo('新子任务', { parent_id: parentId, priority: 0 })
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

