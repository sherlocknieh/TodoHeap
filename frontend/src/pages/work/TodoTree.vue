<script setup>
import { computed, watch } from 'vue'

const props = defineProps({
	todos: { type: Array, default: () => [] },
	title: { type: String, default: 'Todo 思维导图' }
})

// 监听 props 变化，用于调试
watch(
	() => props.todos,
	(newTodos) => {
		console.log('TreeView received todos:', newTodos)
	},
	{ immediate: true }
)

// 直接使用传入的树形数据（来自 store 的 treeNodes）
const treeData = computed(() => {
	const todosArray = props.todos || []
	console.log('TreeView received todos:', todosArray.length)
	
	// 如果接收到的是已经转换后的树形数据（有 children），直接使用
	if (todosArray.length > 0 && todosArray[0].children) {
		console.log('Using pre-built tree nodes')
		return {
			id: 'root',
			title: props.title,
			depth: 0,
			children: todosArray
		}
	}
	
	// 如果是平面数据，需要自己构建树结构
	console.log('Building tree from flat data')
	const buildNode = (todo) => ({
		id: todo.id,
		title: todo.title || '未命名任务',
		status: todo.status || 'todo',
		priority: todo.priority ?? 0,
		parent_id: todo.parent_id,
		children: []
	})
	
	const nodes = todosArray.map(buildNode)
	const map = new Map()
	nodes.forEach(n => map.set(n.id, n))
	
	const roots = []
	nodes.forEach(n => {
		if (n.parent_id && map.has(n.parent_id)) {
			map.get(n.parent_id).children.push(n)
		} else {
			roots.push(n)
		}
	})
	
	// 排序
	const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
	const sortTree = (arr) => {
		arr.sort(sortFn)
		arr.forEach(child => sortTree(child.children))
	}
	sortTree(roots)
	
	return {
		id: 'root',
		title: props.title,
		depth: 0,
		children: roots
	}
})

// 计算节点位置和所有连接线
const treeLayout = computed(() => {
	const positions = new Map()
	const connections = []
	const nodeWidth = 140
	const nodeHeight = 60
	const levelWidth = 280
	const verticalGap = 90
	
	let nodeIndex = 0  // 全局节点计数器
	
	const traverse = (node, level, parent, parentPosition) => {
		const x = 100 + level * levelWidth
		const y = 150 + nodeIndex * verticalGap
		
		positions.set(node.id, { 
			x, 
			y, 
			node,
			level,
			width: nodeWidth,
			height: nodeHeight
		})
		
		nodeIndex++  // 每处理一个节点，计数器增加
		
		// 添加连接线
		if (parent && parentPosition) {
			const x1 = parentPosition.x + parentPosition.width
			const y1 = parentPosition.y + parentPosition.height / 2
			const x2 = x
			const y2 = y + nodeHeight / 2
			
			// 使用贝塞尔曲线的控制点
			const controlX = x1 + (x2 - x1) * 0.3
			
			connections.push({
				x1, y1, x2, y2, controlX,
				parentId: parent.id,
				childId: node.id,
				parentStatus: parent.status
			})
		}
		
		// 递归处理子节点
		if (node.children && node.children.length > 0) {
			node.children.forEach((child) => {
				traverse(child, level + 1, node, positions.get(node.id))
			})
		}
	}
	
	// 从一级节点开始遍历
	if (treeData.value.children && treeData.value.children.length > 0) {
		treeData.value.children.forEach((child) => {
			traverse(child, 1, null, null)
		})
	}
	
	const maxLevel = Math.max(...Array.from(positions.values()).map(p => p.level), 0)
	const totalNodes = positions.size
	const svgWidth = Math.max(1200, (maxLevel + 1) * levelWidth + 200)
	const svgHeight = Math.max(500, totalNodes * verticalGap + 300)
	
	return {
		positions,
		connections,
		svgWidth,
		svgHeight,
		nodeWidth,
		nodeHeight
	}
})

// 添加中心节点位置
const rootPosition = computed(() => ({
	x: 30,
	y: 150 + (treeLayout.value.positions.size > 0 ? 
		(Array.from(treeLayout.value.positions.values()).reduce((sum, p) => sum + p.y, 0) / treeLayout.value.positions.size - 150) / 2 : 0),
	width: 100,
	height: 60
}))

// 将 Map 转换为数组，方便在 v-for 中使用
const positionsArray = computed(() => {
	return Array.from(treeLayout.value.positions.entries()).map(([nodeId, pos]) => ({
		nodeId,
		...pos
	}))
})

// 从中心到一级节点的连接线
const centerConnections = computed(() => {
	const connections = []
	if (treeData.value.children && treeData.value.children.length > 0) {
		treeData.value.children.forEach(child => {
			const childPos = treeLayout.value.positions.get(child.id)
			if (childPos) {
				const x1 = rootPosition.value.x + rootPosition.value.width
				const y1 = rootPosition.value.y + rootPosition.value.height / 2
				const x2 = childPos.x
				const y2 = childPos.y + childPos.height / 2
				const controlX = x1 + (x2 - x1) * 0.3
				
				connections.push({
					x1, y1, x2, y2, controlX,
					status: child.status
				})
			}
		})
	}
	return connections
})

const statusColor = {
	todo: '#3b82f6',
	doing: '#f59e0b',
	done: '#10b981'
}

const statusLabel = {
	todo: '待办',
	doing: '进行中',
	done: '已完成'
}

const getNodeColor = (status) => statusColor[status] || '#6b7280'

</script>

<template>
	<div class="tree-container">
		<div class="tree-header">
			<h2>{{ props.title }}</h2>
			<p>{{ treeData.children.length }} 个根任务 · 思维导图布局</p>
		</div>
		
		<div v-if="treeData.children.length === 0" class="empty-state">
			<div class="empty-icon">🌳</div>
			<p>暂无任务</p>
		</div>
		
		<div v-else class="svg-wrapper">
			<svg 
				class="tree-svg" 
				:viewBox="`0 0 ${treeLayout.svgWidth} ${treeLayout.svgHeight}`"
				:style="{ minHeight: `${Math.min(treeLayout.svgHeight, 800)}px` }"
			>
				<defs>
					<marker 
						id="arrowhead" 
						markerWidth="10" 
						markerHeight="10" 
						refX="9" 
						refY="3" 
						orient="auto"
					>
						<polygon points="0 0, 10 3, 0 6" fill="#cbd5e1" />
					</marker>
				</defs>

				<!-- 中心节点到一级节点的连接线 -->
				<g class="center-connections">
					<path
						v-for="(conn, idx) in centerConnections"
						:key="`center-conn-${idx}`"
						:d="`M ${conn.x1} ${conn.y1} Q ${conn.controlX} ${(conn.y1 + conn.y2) / 2} ${conn.x2} ${conn.y2}`"
						stroke="#e2e8f0"
						stroke-width="2"
						fill="none"
						stroke-linecap="round"
					/>
				</g>

				<!-- 节点间的连接线 -->
				<g class="node-connections">
					<path
						v-for="(conn, idx) in treeLayout.connections"
						:key="`conn-${idx}`"
						:d="`M ${conn.x1} ${conn.y1} Q ${conn.controlX} ${(conn.y1 + conn.y2) / 2} ${conn.x2} ${conn.y2}`"
						:stroke="getNodeColor(conn.parentStatus)"
						stroke-width="1.5"
						fill="none"
						opacity="0.6"
						stroke-linecap="round"
					/>
				</g>

				<!-- 中心节点 -->
				<g class="center-node">
					<rect 
						:x="rootPosition.x" 
						:y="rootPosition.y" 
						:width="rootPosition.width" 
						:height="rootPosition.height"
						rx="8"
						fill="#667eea"
						stroke="#5a67d8"
						stroke-width="2"
					/>
					<text 
						:x="rootPosition.x + rootPosition.width / 2" 
						:y="rootPosition.y + rootPosition.height / 2 + 2"
						text-anchor="middle"
						dominant-baseline="middle"
						fill="white"
						font-weight="700"
						font-size="13"
					>
						{{ treeData.title.substring(0, 10) }}
					</text>
				</g>

				<!-- 所有任务节点 -->
				<g class="task-nodes">
					<g 
						v-for="pos in positionsArray"
						:key="`node-${pos.nodeId}`"
						class="node-group"
					>
						<!-- 节点背景 -->
						<rect 
							:x="pos.x" 
							:y="pos.y" 
							:width="pos.width" 
							:height="pos.height"
							rx="6"
							:fill="getNodeColor(pos.node.status)"
							:stroke="getNodeColor(pos.node.status)"
							stroke-width="2"
							opacity="0.9"
							class="node-rect"
						/>
						
						<!-- 节点文本 -->
						<text 
							:x="pos.x + pos.width / 2" 
							:y="pos.y + pos.height / 2 - 6"
							text-anchor="middle"
							fill="white"
							font-weight="600"
							font-size="12"
							class="node-title"
						>
							{{ pos.node.title.substring(0, 12) }}
						</text>
						<text 
							:x="pos.x + pos.width / 2" 
							:y="pos.y + pos.height / 2 + 12"
							text-anchor="middle"
							fill="white"
							font-size="10"
							opacity="0.9"
						>
							{{ statusLabel[pos.node.status] }}
						</text>
					</g>
				</g>
			</svg>
		</div>
	</div>
</template>

<style scoped>
.tree-container {
	padding: 24px;
	background: #f9fafb;
	border-radius: 12px;
	height: 100%;
	overflow: hidden;
	display: flex;
	flex-direction: column;
}

.tree-header {
	margin-bottom: 20px;
	flex-shrink: 0;
}

.tree-header h2 {
	font-size: 24px;
	font-weight: 700;
	color: #111827;
	margin: 0 0 8px 0;
}

.tree-header p {
	color: #6b7280;
	margin: 0;
	font-size: 14px;
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

.empty-icon {
	font-size: 48px;
	margin-bottom: 12px;
}

.svg-wrapper {
	flex: 1;
	background: linear-gradient(135deg, #ffffff 0%, #f9fafb 100%);
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	overflow: auto;
	padding: 20px;
}

.tree-svg {
	width: 100%;
	height: auto;
	display: block;
}

/* 连接线和节点的样式 */
.center-connections path {
	transition: all 0.3s ease;
}

.node-connections path {
	transition: all 0.3s ease;
}

/* 中心节点 */
.center-node rect {
	transition: all 0.2s ease;
	cursor: pointer;
	filter: drop-shadow(0 2px 4px rgba(102, 126, 234, 0.2));
}

.center-node rect:hover {
	filter: drop-shadow(0 4px 12px rgba(102, 126, 234, 0.4));
	stroke-width: 3;
}

.center-node text {
	pointer-events: none;
}

/* 任务节点 */
.node-group {
	transition: all 0.2s ease;
}

.node-rect {
	transition: all 0.2s ease;
	cursor: pointer;
	filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.node-group:hover .node-rect {
	filter: drop-shadow(0 4px 12px rgba(0, 0, 0, 0.2));
	stroke-width: 3;
}

.node-title {
	pointer-events: none;
	transition: all 0.2s ease;
}

.node-group:hover .node-title {
	font-weight: 700;
}

/* 响应式调整 */
@media (max-width: 768px) {
	.tree-container {
		padding: 16px;
	}
	
	.tree-header h2 {
		font-size: 20px;
	}
	
	.svg-wrapper {
		padding: 12px;
	}
}
</style>
