<template>
	<!-- Todo 树视图 -->
	<div class="tree-container">
		<div class="tree-header">
			<h2>{{ props.title }}</h2>
			<p>{{ (props.todos || []).length }} 个任务 · 逻辑结构图</p>
		</div>

		<div v-if="(props.todos || []).length === 0" class="empty-state">
			<div class="empty-icon">🌳</div>
			<p>暂无任务</p>
		</div>

		<div v-else class="mindmap-wrapper" ref="mindMapContainer" style="flex: 1; min-height: 0;"></div>
	</div>
</template>


<script setup>
import { onMounted, ref, computed, watch, nextTick } from 'vue'
import MindMap from 'simple-mind-map'
import { useTodoStore } from '../../stores/todos'

const props = defineProps({
	todos: { type: Array, default: () => [] },
	title: { type: String, default: 'Todo 思维导图' }
})

const emit = defineEmits(['task-selected'])

const todoStore = useTodoStore()

const mindMapContainer = ref(null)
let mindMapInstance = null
let savedViewState = null  // 保存视图状态
let existingTodoIds = new Set()  // 跟踪现有任务 ID，用于检测新创建的节点

// 默认固定使用逻辑结构图
const layoutMode = ref('logicalStructure')

	// 将 todos 转换为 simple-mind-map 格式
const mindMapData = computed(() => {
	const todosArray = props.todos || []
	if (todosArray.length === 0) {
		return {
			data: { text: props.title },
			children: []
		}
	}

	// 构建树结构
	const buildNode = (todo) => ({
		data: {
			text: todo.title || '未命名任务',
			status: todo.status || 'todo',
			id: todo.id  // 添加 ID 到数据中，便于后续关联
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

	return {
		data: { text: props.title },
		children: roots
	}
})// 初始化 mindmap 实例
const initMindMap = async () => {
	if (!mindMapContainer.value) {
		console.warn('Container not ready')
		return
	}

	// 如果已存在实例，先保存视图状态再销毁
	if (mindMapInstance) {
		try {
			// 保存当前的缩放和平移位置
			savedViewState = {
				scale: mindMapInstance.view?.scaleVal || 1,
				x: mindMapInstance.view?.translateX || 0,
				y: mindMapInstance.view?.translateY || 0
			}
			console.log('Saved view state:', savedViewState)
			mindMapInstance.destroy?.()
		} catch (e) {
			console.error('Error destroying previous instance:', e)
		}
		mindMapInstance = null
	}

	// 等待 DOM 重排完成
	await nextTick()

	try {
		const rect = mindMapContainer.value.getBoundingClientRect()
		console.log('Before init - Container rect:', { width: rect.width, height: rect.height })

		// 如果没有高度，这是一个问题
		if (rect.height <= 0) {
			console.error('Container height is 0 or negative! This will prevent rendering.')
		}

		mindMapInstance = new MindMap({
			el: mindMapContainer.value,
			data: mindMapData.value,
			layout: layoutMode.value,
			theme: 'default',
			readonly: false,
			alwaysShowExpandBtn: false,
			expandBtnSize: 20,
			hoverRectColor: 'rgb(94, 200, 248)',
			hoverRectPadding: 2,
			fit: false,
			fitPadding: 0,
			isDisableDrag: false,
			disableMouseWheelZoom: false,
			enableCtrlKeyNodeSelection: true,
			// 添加高度相关配置
			nodeTextEditZindex: 1000
		})

		// 初始化后立即调用 fit
		await nextTick()
		setTimeout(() => {
			console.log('Initial fit call')
			if (mindMapInstance?.view?.fit) {
				mindMapInstance.view.fit()
			}
		}, 100)

		// 渲染完成后调用 fit 并恢复视图状态
		mindMapInstance.on('node_tree_render_end', () => {
			console.log('MindMap rendered')
			setTimeout(() => {
				// 如果有保存的视图状态，恢复它
				if (savedViewState && mindMapInstance?.view) {
					console.log('Restoring view state:', savedViewState)
					mindMapInstance.view.setScale(savedViewState.scale)
					mindMapInstance.view.translateX = savedViewState.x
					mindMapInstance.view.translateY = savedViewState.y
					// 手动触发视图更新
					if (mindMapInstance.view?.refresh) {
						mindMapInstance.view.refresh()
					}
				} else if (mindMapInstance?.view?.fit) {
					// 第一次渲染，使用 fit 自动调整
					mindMapInstance.view.fit()
				}
			}, 50)
		})

		// 初始化现有任务 ID 集合
		existingTodoIds = new Set(props.todos.map(t => t.id))

		// 监听节点内容修改事件，同步到数据库
		mindMapInstance.on('node_content_change', async (node) => {
			try {
				const nodeData = node.getData()
				const text = nodeData?.text || ''
				const nodeId = nodeData?.id
				
				// 如果节点数据中有 ID，直接使用
				if (nodeId && existingTodoIds.has(nodeId)) {
					await todoStore.updateTodo(nodeId, { title: text })
					console.log('Node content updated:', { id: nodeId, title: text })
				}
			} catch (err) {
				console.error('Error updating node content:', err)
			}
		})

		// 监听节点插入事件（插入新节点时触发）
		mindMapInstance.on('node_insert', async (node) => {
			try {
				const nodeData = node.getData()
				const text = nodeData?.text || ''
				
				if (!text || text === props.title) return
				
				const parentNode = node.parent
				if (!parentNode) return
				
				// 获取父节点的 ID
				const parentNodeData = parentNode.getData()
				const parentId = parentNodeData?.id
				
				// 检查是否是新创建的节点（不在现有 ID 集合中）
				if (!parentId || existingTodoIds.has(parentId) === false) return
				
				// 检查是否已经存在相同的任务
				const existingTodo = props.todos.find(
					t => t.title === text && t.parent_id === parentId
				)
				
				if (!existingTodo) {
					// 创建新子任务
					const result = await todoStore.addTodo(text, {
						parent_id: parentId,
						status: 'todo'
					})
					if (result.success) {
						console.log('New subtask created from mindmap:', result.data)
						// 更新节点数据中的 ID
						node.setData({ ...nodeData, id: result.data.id })
						// 更新现有任务 ID 集合
						existingTodoIds.add(result.data.id)
					}
				}
			} catch (err) {
				console.error('Error in node_insert event:', err)
			}
		})

		// 监听节点被选中/点击事件，用于捕获编辑完成的节点
		mindMapInstance.on('node_click', async (node) => {
			try {
				const nodeData = node.getData()
				const text = nodeData?.text || ''
				const nodeId = nodeData?.id
				
				// 如果点击了有ID的节点，触发任务选择事件
				if (nodeId && existingTodoIds.has(nodeId)) {
					console.log('选中任务:', { id: nodeId, title: text })
					emit('task-selected', nodeId)
				}
				
				// 如果点击了没有 ID 的新节点，需要创建任务
				if (!nodeId && text && text !== props.title) {
					const parentNode = node.parent
					if (parentNode) {
						const parentNodeData = parentNode.getData()
						const parentId = parentNodeData?.id
						
						if (parentId && existingTodoIds.has(parentId)) {
							// 检查是否已存在
							const existingTodo = props.todos.find(
								t => t.title === text && t.parent_id === parentId
							)
							
							if (!existingTodo) {
								const result = await todoStore.addTodo(text, {
									parent_id: parentId,
									status: 'todo'
								})
								if (result.success) {
									console.log('New subtask created:', result.data)
									node.setData({ ...nodeData, id: result.data.id })
									existingTodoIds.add(result.data.id)
								}
							}
						}
					}
				}
			} catch (err) {
				console.error('Error in node_click event:', err)
			}
		})

		// ResizeObserver 来处理容器大小变化
		if (typeof ResizeObserver !== 'undefined' && mindMapContainer.value) {
			const resizeObserver = new ResizeObserver(() => {
				console.log('Container resized, calling fit()')
				// 延迟调用，确保 DOM 已更新
				setTimeout(() => {
					if (mindMapInstance?.view?.fit) {
						mindMapInstance.view.fit()
					}
				}, 50)
			})
			resizeObserver.observe(mindMapContainer.value)
		}
	} catch (error) {
		console.error('Failed to initialize MindMap:', error)
	}
}

// 监听 todos 和 layoutMode 变化
watch(
	() => props.todos,
	async () => {
		console.log('Todos changed, reinitializing')
		await nextTick()
		await new Promise(resolve => setTimeout(resolve, 100))
		initMindMap()
	},
	{ deep: true }
)

// 组件挂载时初始化
onMounted(async () => {
	console.log('TodoTree mounted')
	await nextTick()
	// 再等一下确保布局完成
	await new Promise(resolve => setTimeout(resolve, 200))
	
	// 明确检查并输出容器信息
	if (mindMapContainer.value) {
		const rect = mindMapContainer.value.getBoundingClientRect()
		console.log('Mount check - Container rect:', { width: rect.width, height: rect.height })
	}
	
	initMindMap()
})
</script>


<style scoped>
.tree-container {
	padding: 24px;
	background: #f9fafb;
	border-radius: 12px;
	width: 100%;
	height: 100%;
	min-height: 600px; /* 新增，保证有基础高度 */
	overflow: hidden;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.tree-header {
	flex-shrink: 0;
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 12px;
}

.tree-header h2 {
	font-size: 24px;
	font-weight: 700;
	color: #111827;
	margin: 0;
	flex-shrink: 0;
}

.tree-header p {
	color: #6b7280;
	margin: 0;
	font-size: 14px;
	flex-shrink: 0;
}

.layout-switch {
	display: flex;
	gap: 6px;
	flex-wrap: wrap;
	margin-left: auto;
	flex-shrink: 0;
}

.layout-btn {
	padding: 6px 10px;
	border-radius: 6px;
	border: 1px solid #e5e7eb;
	background: #fff;
	cursor: pointer;
	font-weight: 500;
	font-size: 12px;
	color: #4b5563;
	transition: all 0.15s ease;
	display: flex;
	align-items: center;
	gap: 4px;
	min-width: auto;
}

.layout-icon {
	font-size: 14px;
}

.layout-label {
	white-space: nowrap;
}

.layout-btn.active {
	background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
	color: #fff;
	border-color: transparent;
	box-shadow: 0 4px 12px rgba(99, 102, 241, 0.2);
}

.layout-btn:hover {
	transform: translateY(-1px);
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	flex: 1;
	text-align: center;
	color: #9ca3af;
}

.mindmap-wrapper {
	/* 关键：flex 容器中占据剩余空间 */
	flex: 1;
	min-height: 300px; /* 新增，保证思维导图区有高度 */
	width: 100%;
	max-height: 100%;
	
	/* 布局 */
	display: flex;
	flex-direction: column;
	position: relative;
	overflow: hidden;

	/* 视觉效果 */
	background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}

/* 确保 simple-mind-map 库的内部容器正确显示 */
:deep(.sm-mind-map-container) {
	width: 100% !important;
	height: 100% !important;
	flex: 1 !important;
	background: transparent !important;
	margin: 0 !important;
	padding: 0 !important;
	overflow: auto !important;
	display: flex !important;
	flex-direction: column !important;
}

:deep(.smm-inner-box) {
	width: 100% !important;
	height: 100% !important;
	position: relative !important;
	display: flex !important;
	flex-direction: column !important;
	flex: 1 !important;
	min-height: 0 !important;
}

:deep(svg) {
	width: 100% !important;
	height: 100% !important;
	display: block !important;
	flex: 1 !important;
	min-height: 100% !important;
	min-width: 100% !important;
}

:deep(.smm-svg),
:deep(.sm-mind-map-svg),
:deep(.smm-container) {
	width: 100% !important;
	height: 100% !important;
	display: block !important;
}

:deep(.smm-node) {
	cursor: pointer !important;
}

:deep(.smm-node-text) {
	font-size: 13px;
	font-weight: 500;
}

:deep(.smm-node-content-wrapper) {
	border-radius: 8px;
	box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* 响应式调整 */
@media (max-width: 768px) {
	.tree-container {
		padding: 12px;
		gap: 12px;
	}

	.tree-header {
		flex-direction: column;
		align-items: flex-start;
	}

	.layout-switch {
		margin-left: 0;
		width: 100%;
	}

	.layout-label {
		display: none;
	}

	.tree-header h2 {
		font-size: 20px;
	}
}
</style>
