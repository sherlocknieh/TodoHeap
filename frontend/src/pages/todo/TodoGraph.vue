<template>
	<!-- 任务图：思维导图占满活动栏以外的区域，支持键盘增删改 -->
	<div class="w-full h-full overflow-hidden">
		<MindMapWrapper :nodes="mindMapNodes" :selected-task-id="props.selectedTaskId" :edit-task-id="editTaskId"
			:new-edge="newEdge"
			@task-selected="id => emit('task-selected', id)" @create-task="createTask" @rename-task="renameTask"
			@delete-task="deleteTask" @toggle-done="toggleDone" @drop-task="dropTask" @unlink-task="unlinkTask"
			@notify="payload => emit('notify', payload)" @background-click="emit('background-click')" />
	</div>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useTodoStore } from '@/stores/todos'
import MindMapWrapper from '@/components/MindMapWrapper.vue'
import { collectDescendantIds, findParentIds } from '@/utils/taskGraph'
import { isTaskCollapsed, setTaskCollapsed } from '@/utils/taskCollapse'
import { ROOT_TODO_TITLE } from '@/utils/rootTask'

const props = defineProps({
	selectedTaskId: { type: Number, default: null }
})

const emit = defineEmits(['task-selected', 'notify', 'background-click'])

const todoStore = useTodoStore()

// 新建后立即进入重命名，避免留下「新任务」占位
const editTaskId = ref(null)

// 刚建立的链接交给导图按点击选线处理，引用变化即重新触发
const newEdge = ref(null)

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
	// 拖拽重排要写回落点所在的兄弟序列，先保留树展开时的父级
	parent_id: todo.parent_id ?? null,
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
		// 新建任务与落点在同一父级，带上父级上下文只做同级重排
		await todoStore.moveTodo(newId, { targetId: afterId, position: 'after', sourceParentId: parentId, targetParentId: parentId })
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

// 链接后改为移动：摘掉落点以外的所有父链接，让任务只留在新父级下
const unlinkOtherParents = async ({ childId, parentId }) => {
	const snapshots = findParentIds(todoStore.todos, childId)
		.filter(id => id !== parentId)
		.map(id => ({ id, child_ids: [...(todoStore.findTodoById(id)?.child_ids || [])] }))
		.filter(snapshot => snapshot.child_ids.includes(childId))

	const results = await Promise.all(snapshots.map(snapshot => todoStore.updateTodo(snapshot.id, {
		child_ids: snapshot.child_ids.filter(id => id !== childId)
	})))
	const failed = results.find(result => !result.success)
	if (failed?.error) emit('notify', { message: failed.error })
}

// 新链接落成后：展开折叠的落点并选中新连线，否则连线会被折叠计数藏住、或在细灰线里找不到
const revealNewLink = (parentId, childId) => {
	if (isTaskCollapsed(parentId)) setTaskCollapsed(parentId, false)
	newEdge.value = { parentId, childId }
}

// 拖拽落点：拖节点本体时，上/下四分之一插到目标兄弟前后，中间成为子任务；
// 插序使用树展开时记录的父级，多父任务落在首个父链下。从折叠/加号按钮拉出的拖拽只建立链接。
// 拖节点成子任务时，子任务只有一个父级就移动、多个父级就新增链接。
// 只有链接需要提示；移动与插序是直接结果，不弹提示
const dropTask = async ({
	parentId,
	childId,
	position = 'inside',
	sourceParentId = null,
	targetParentId = null,
	linkOnly = false
}) => {
	if (parentId === childId) return
	const parent = todoStore.findTodoById(parentId)
	const child = todoStore.findTodoById(childId)
	if (!parent || !child) return

	// 父任务已在子任务的子树里时再挂过去会成环
	if (collectDescendantIds(todoStore.todos, childId).includes(parentId)) {
		emit('notify', { message: '不能移动到自己的子任务下' })
		return
	}

	// 前后插序只重排落点所在的兄弟序列，不改变父子关系
	if (!linkOnly && position !== 'inside') {
		const result = await todoStore.moveTodo(childId, {
			targetId: parentId,
			position,
			sourceParentId,
			targetParentId
		})
		if (!result.success && result.error) emit('notify', { message: result.error })
		return
	}

	const parentIds = findParentIds(todoStore.todos, childId)
	if (parentIds.includes(parentId)) {
		emit('notify', { message: `「${child.title || '任务'}」已经是它的子任务` })
		return
	}

	if (linkOnly || parentIds.length > 1) {
		const childTitle = child.title || '任务'
		const parentTitle = parent.title || '任务'
		const targetChildIds = [...(parent.child_ids || [])]
		const result = await todoStore.updateTodo(parentId, { child_ids: [...targetChildIds, childId] })
		if (!result.success) {
			if (result.error) emit('notify', { message: result.error })
			return
		}

		// 建链接后立刻展开父节点并选中新连线，让用户看见落点
		revealNewLink(parentId, childId)

		emit('notify', {
			message: `已将「${childTitle}」链接到「${parentTitle}」`,
			action: linkOnly ? null : {
				// 改为移动会摘掉该任务其余父链接，提示里直接标明代价
				label: '改为移动（断开旧连接）',
				run: () => unlinkOtherParents({ childId, parentId })
			},
			undo: () => todoStore.updateTodo(parentId, { child_ids: targetChildIds })
		})
		return
	}

	// 单父任务（含只挂在根任务下的顶层任务）直接移动，落到新父级末尾
	const result = await todoStore.moveTodo(childId, {
		targetId: parentId,
		position: 'inside',
		sourceParentId: parentIds[0] ?? null
	})
	if (!result.success) {
		if (result.error) emit('notify', { message: result.error })
		return
	}

	// 移动同样形成新的父子关系，展开落点并选中新连线，避免子任务一落进去就消失
	revealNewLink(parentId, childId)
}

// 删除连线：只从父任务的 child_ids 移除引用；最后一个父级被摘掉时任务回到顶层
const unlinkTask = async ({ parentId, childId }) => {
	const parent = todoStore.findTodoById(parentId)
	const child = todoStore.findTodoById(childId)
	if (!parent || !child) return

	const result = await todoStore.unlinkTodo(parentId, childId)
	if (!result.success) {
		if (result.error) emit('notify', { message: result.error })
		return
	}
	if (result.data?.unchanged) return

	emit('notify', {
		message: `已断开「${parent.title || '任务'}」与「${child.title || '任务'}」的链接`,
		undo: () => {
			const actions = [todoStore.updateTodo(parentId, { child_ids: result.data.previousChildIds })]
			if (result.data.rootChildIds != null) {
				actions.push(todoStore.updateTodo(todoStore.rootTaskId, { child_ids: result.data.rootChildIds }))
			}
			return Promise.all(actions)
		}
	})
}
</script>
