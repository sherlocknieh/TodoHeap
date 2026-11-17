<template>
	<!-- 任务图：思维导图占满活动栏以外的区域，支持键盘增删改 -->
	<div class="w-full h-full overflow-hidden">
		<MindMapWrapper :nodes="mindMapNodes" :selected-task-id="props.selectedTaskId" :edit-task-id="editTaskId"
			@task-selected="id => emit('task-selected', id)" @create-task="createTask" @rename-task="renameTask"
			@delete-task="deleteTask" @toggle-done="toggleDone" @link-task="linkTask" @unlink-task="unlinkTask" />
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTodoStore } from '@/stores/todos'
import MindMapWrapper from '@/components/MindMapWrapper.vue'
import { collectDescendantIds } from '@/utils/taskGraph'
import { ROOT_TODO_TITLE } from '@/utils/rootTask'

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

// 复用 store 中已排序并展开回边的森林；图的根节点就是真实的根任务
const mindMapNodes = computed(() => {
	const forest = todoStore.treeNodes || []
	const rootNode = forest.find(node => node.is_root)
	const subtitle = `${todoStore.tasks.length} 个任务`

	// 根任务还没拉到时用合成根兜底，离线首屏仍能看图
	if (!rootNode) {
		return [{ id: 'root', title: ROOT_TODO_TITLE, subtitle, isRoot: true, children: forest.map(mapNode) }]
	}

	// 根任务尚未挂上顶层任务时（离线首屏或旧数据）把森林里其它根一并挂上，避免任务在图里消失
	const orphans = forest.filter(node => node !== rootNode)
	return [{
		id: String(rootNode.id),
		title: rootNode.title || ROOT_TODO_TITLE,
		subtitle,
		isRoot: true,
		children: [...rootNode.children, ...orphans].map(mapNode)
	}]
})

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

// 拖拽建链接：把子任务并入父任务的 child_ids，形成多父关系，不移动原父级
const linkTask = async ({ parentId, childId }) => {
	if (parentId === childId) return
	const parent = todoStore.findTodoById(parentId)
	const child = todoStore.findTodoById(childId)
	if (!parent || !child) return

	// 父任务已在子任务的子树里时再链接会成环
	if (collectDescendantIds(todoStore.todos, childId).includes(parentId)) {
		emit('notify', { message: '不能链接到自己的子任务' })
		return
	}

	const childIds = parent.child_ids || []
	if (childIds.includes(childId)) {
		emit('notify', { message: `「${child.title || '任务'}」已经是它的子任务` })
		return
	}

	const result = await todoStore.updateTodo(parentId, { child_ids: [...childIds, childId] })
	if (!result.success) {
		if (result.error) emit('notify', { message: result.error })
		return
	}

	emit('notify', {
		message: `已链接「${child.title || '任务'}」到「${parent.title || '任务'}」`,
		undo: () => todoStore.updateTodo(parentId, { child_ids: childIds })
	})
}

// 删除连线：只从父任务的 child_ids 移除引用，任务本身与其他父关系不受影响
const unlinkTask = async ({ parentId, childId }) => {
	const parent = todoStore.findTodoById(parentId)
	const child = todoStore.findTodoById(childId)
	if (!parent || !child) return

	const childIds = parent.child_ids || []
	if (!childIds.includes(childId)) return

	const result = await todoStore.updateTodo(parentId, {
		child_ids: childIds.filter((id) => id !== childId)
	})
	if (!result.success) {
		if (result.error) emit('notify', { message: result.error })
		return
	}

	emit('notify', {
		message: `已断开「${parent.title || '任务'}」与「${child.title || '任务'}」的链接`,
		undo: () => todoStore.updateTodo(parentId, { child_ids: childIds })
	})
}
</script>
