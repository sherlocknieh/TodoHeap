<template>
	<!-- 图视图：思维导图占满活动栏以外的区域，支持键盘增删改 -->
	<div class="w-full h-full overflow-hidden">
		<MindMapWrapper :nodes="mindMapNodes" :selected-task-id="props.selectedTaskId" :edit-task-id="editTaskId"
			@task-selected="id => emit('task-selected', id)" @create-task="createTask" @rename-task="renameTask"
			@delete-task="deleteTask" @toggle-done="toggleDone" />
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTodoStore } from '@/stores/todos'
import MindMapWrapper from '@/components/MindMapWrapper.vue'

const props = defineProps({
	selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected', 'notify'])

const todoStore = useTodoStore()

// 新建后立即进入重命名，避免留下「新任务」占位
const editTaskId = ref(null)

// 临时 ID 换成真实 ID 后，重命名目标要跟着换，否则输入框会随节点消失
const handleIdReplaced = (event) => {
	const { tempId, realId } = event.detail || {}
	if (tempId == null || realId == null) return
	if (editTaskId.value == tempId) editTaskId.value = realId
}

onMounted(async () => {
	window.addEventListener('sync:id-replaced', handleIdReplaced)
	if (!todoStore.isFetched) {
		await todoStore.fetchTodos()
	}
})

onBeforeUnmount(() => {
	window.removeEventListener('sync:id-replaced', handleIdReplaced)
})

// 回边节点只是引用，点击时回到被引用的真实任务
const mapNode = (todo) => ({
	id: String(todo.id),
	title: todo._isRef ? `\u21A9\uFE0E ${todo.title || '未命名任务'}` : (todo.title || '未命名任务'),
	completed_at: todo.completed_at || null,
	isRef: !!todo._isRef,
	targetId: todo._isRef ? todo._refTargetId : todo.id,
	children: (todo.children || []).map(mapNode)
})

// 复用 store 中已排序并展开回边的森林，外层补一个总根节点
const mindMapNodes = computed(() => [{
	id: 'root',
	title: '全部任务',
	isRoot: true,
	children: (todoStore.treeNodes || []).map(mapNode)
}])

// 新建任务：同级插到当前节点之后，子级挂到当前节点下，随后进入重命名
const createTask = async ({ parentId = null, afterId = null } = {}) => {
	const result = await todoStore.addTodo('新任务', { parent_id: parentId })
	if (!result.success || !result.data) {
		if (result.error) emit('notify', { message: result.error })
		return
	}

	const newId = result.data.id
	if (afterId != null) {
		await todoStore.moveTodo(newId, { targetId: afterId, position: 'after' })
	}

	emit('task-selected', newId)
	editTaskId.value = newId
}

const renameTask = async ({ id, title }) => {
	const result = await todoStore.updateTodo(id, { title })
	if (!result.success && result.error) emit('notify', { message: result.error })
}

const deleteTask = async (id) => {
	const title = todoStore.findTodoById(id)?.title || '任务'
	const result = await todoStore.deleteTodo(id)
	if (!result.success) {
		if (result.error) emit('notify', { message: result.error })
		return
	}

	emit('task-selected', null)
	// 回收站记录的是真实 ID，撤销时按它恢复
	const trashId = result.data?.id ?? id
	emit('notify', {
		message: `已删除「${title}」`,
		undo: () => todoStore.restoreTodo(trashId)
	})
}

const toggleDone = async (id) => {
	const todo = todoStore.findTodoById(id)
	if (!todo) return
	const previousCompletedAt = todo.completed_at ?? null
	const result = await todoStore.toggleDone(id)
	if (!result.success) return

	const title = todo.title || '任务'
	emit('notify', {
		message: previousCompletedAt ? `已恢复「${title}」` : `已完成「${title}」`,
		undo: () => todoStore.updateTodo(id, { completed_at: previousCompletedAt })
	})
}
</script>
