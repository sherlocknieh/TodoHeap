<template>
	<!-- Todo 树视图 -->
	<div class="p-6 bg-gray-50 rounded-xl w-full h-full min-h-[600px] overflow-hidden flex flex-col gap-4">
		<div class="flex flex-wrap items-center gap-3">
			<h2 class="text-2xl font-extrabold text-gray-900 m-0">{{ props.title }}</h2>
			<p class="text-sm text-gray-500 m-0">{{ (todos || []).length }} 个任务 · 逻辑结构图</p>
		</div>

		<div v-if="(todos || []).length === 0" class="empty-state">
			<div class="empty-icon">🌳</div>
			<p>暂无任务</p>
		</div>

		<MindMapWrapper v-else
		  :todos="todos"
		  :title="props.title"
		  :selectedTaskId="props.selectedTaskId"
		  :mindData="mindData"
		  @task-selected="id => emit('task-selected', id)"
		  @node-content-change="onNodeContentChange"
		  @node-insert="onNodeInsert"
		/>
	</div>
</template>


<script setup>
import { onMounted, computed } from 'vue'
import { useTodoStore } from '../../stores/todos'
import MindMapWrapper from '../../components/MindMapWrapper.vue'

const props = defineProps({
	title: { type: String, default: 'Todo 思维导图' },
	selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected'])

const todoStore = useTodoStore()
const todos = computed(() => todoStore.todos || [])

onMounted(async () => {
	if (!todoStore.isFetched) {
		await todoStore.fetchTodos()
	}
})

const onNodeContentChange = async ({ id, text }) => {
	if (!id) return
	try {
		await todoStore.updateTodo(id, { title: text })
	} catch (err) {
		console.error('Update todo failed:', err)
	}
}

const onNodeInsert = async ({ text, parentId }) => {
	if (!text || !parentId) return
	try {
		await todoStore.addTodo(text, { parent_id: parentId, status: 'todo' })
	} catch (err) {
		console.error('Add todo from mindmap failed:', err)
	}
}

// 父组件构建并传递给子组件的 mindData（simple-mind-map 格式）
const mindData = computed(() => {
	const todosArray = todos.value || []
	if (todosArray.length === 0) {
		return { data: { text: props.title }, children: [] }
	}

	const buildNode = (todo) => ({
		data: {
			text: todo.title || '未命名任务',
			status: todo.status || 'todo',
			id: todo.id
		},
		children: []
	})

	const nodes = todosArray.map(buildNode)
	const map = new Map()
	todosArray.forEach((todo, idx) => map.set(todo.id, nodes[idx]))

	const roots = []
	todosArray.forEach((todo, idx) => {
		const node = nodes[idx]
		if (todo.parent_id && map.has(todo.parent_id)) {
			map.get(todo.parent_id).children.push(node)
		} else {
			roots.push(node)
		}
	})

	return { data: { text: props.title }, children: roots }
})
</script>
