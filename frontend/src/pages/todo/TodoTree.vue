<template>
	<!-- Todo 树视图 -->
	<div class="p-6 bg-gray-50 rounded-xl w-full h-full min-h-150 overflow-hidden flex flex-col gap-4">
		<!-- 思维导图组件 -->
		<MindMapWrapper
			:mindData="mindMapData"
			:selectedTaskId="props.selectedTaskId"
			@task-selected="id => emit('task-selected', id)"
			@node-content-change="onNodeContentChange"
			@node-insert="onNodeInsert"
			@node-delete="onNodeDelete"
			@data-change-detail="onDataChangeDetail"/>
	</div>
</template>


<script setup>
import { onMounted, computed } from 'vue'
import { useTodoStore } from '../../stores/todos'
import MindMapWrapper from '../../components/MindMapWrapper.vue'

// 定义组件接收的属性
const props = defineProps({
	selectedTaskId: { type: Number, default: null } // 当前选中的任务 ID
})

// 定义组件发出的事件
const emit = defineEmits(['task-selected']) // 当任务被选中时发出事件

const todoStore = useTodoStore()
// 获取所有待办事项的计算属性
const todos = computed(() => todoStore.todos || [])

// 组件挂载时初始化数据
onMounted(async () => {
	if (!todoStore.isFetched) {
		await todoStore.fetchTodos() // 如果数据未获取，则获取待办事项
	}
})

// 处理节点内容变化事件
const onNodeContentChange = async ({ id, text }) => {
	if (!id) return // 如果没有 ID，直接返回
	try {
		await todoStore.updateTodo(id, { title: text }) // 更新待办事项的标题
	} catch (err) {
		console.error('Update todo failed:', err) // 记录更新失败的错误
	}
}

// 处理节点插入事件
const onNodeInsert = async ({ text, parentId }) => {
	if (!text || !parentId) return // 如果文本或父 ID 缺失，直接返回
	try {
		await todoStore.addTodo(text, { parent_id: parentId, status: 'todo' }) // 添加新待办事项
	} catch (err) {
		console.error('Add todo from mindmap failed:', err) // 记录添加失败的错误
	}
}

// 处理节点删除事件
const onNodeDelete = async ({ id }) => {
	if (!id) return // 如果没有 ID，直接返回
	try {
		await todoStore.deleteTodo(id) // 删除待办事项
	} catch (err) {
		console.error('Delete todo failed:', err) // 记录删除失败的错误
	}
}

// 处理 data_change_detail 事件：增量同步变更到 todoStore
const onDataChangeDetail = async (details) => {
	if (!Array.isArray(details)) return // 如果 details 不是数组，直接返回
	for (const detail of details) {
		const { action, data } = detail
		const nodeData = data?.data
		if (!nodeData) continue // 如果没有节点数据，跳过
		const { id, text } = nodeData
		try {
			if (action === 'create') {
				const parentId = data.parent?.data?.id || null
				await todoStore.addTodo(text, { parent_id: parentId, status: 'todo' }) // 创建新任务
			} else if (action === 'update') {
				await todoStore.updateTodo(id, { title: text }) // 更新任务
			} else if (action === 'delete') {
				await todoStore.deleteTodo(id) // 删除任务
			}
		} catch (err) {
			console.error(`Sync ${action} failed for id ${id}:`, err) // 记录同步失败的错误
		}
	}
}

// 由 Todo 树构建思维导图树
const mindMapData = computed(() => {
	const todosArray = todos.value || []

	// 创建节点数据的辅助函数
	const createNodeData = (text, uid, extra = {}) => ({
		text, // 节点文本
		richText: false, // 是否为富文本
		expand: true, // 是否展开
		uid, // 唯一 ID
		icon: [], // 图标列表
		image: '', // 图片 URL
		imageTitle: '', // 图片标题
		imageSize: { width: 100, height: 100, custom: false }, // 图片尺寸
		hyperlink: '', // 超链接
		hyperlinkTitle: '', // 超链接标题
		note: '', // 备注
		attachmentUrl: '', // 附件 URL
		attachmentName: '', // 附件名称
		tag: [], // 标签列表
		generalization: null, // 概要
		associativeLineTargets: [], // 关联线目标
		associativeLineText: '', // 关联线文本
		...extra // 额外属性
	})
	// 如果没有任务，返回一个空的根节点
	if (todosArray.length === 0) {
		return {
			data: createNodeData('全部任务', 'root'), // 创建根节点数据
			children: [] // 无子节点
		}
	}
	// 构建节点并建立父子关系
	const buildNode = (todo) => ({
		data: createNodeData(
			todo.title || '未命名任务', // 任务标题
			todo.id.toString(), // 任务 ID 作为 UID
			{
				status: todo.status || 'todo', // 任务状态
				id: todo.id // 任务 ID
			}
		),
		children: [] // 初始化子节点为空
	})

	const nodes = todosArray.map(buildNode) // 将所有任务转换为节点
	const map = new Map()
	todosArray.forEach((todo, idx) => map.set(todo.id, nodes[idx])) // 创建 ID 到节点的映射

	const roots = []
	todosArray.forEach((todo, idx) => {
		const node = nodes[idx]
		if (todo.parent_id && map.has(todo.parent_id)) {
			map.get(todo.parent_id).children.push(node) // 添加到父节点的子节点
		} else {
			roots.push(node) // 添加到根节点列表
		}
	})

	return {
		data: createNodeData('全部任务', 'root'), // 返回根节点
		children: roots // 返回根子节点
	}
})
</script>
