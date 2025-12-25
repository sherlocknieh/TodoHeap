<template>
	<!-- Todo 堆视图 -->
	<div class="heap-container" ref="heapContainerRef">
		<div v-if="heapNodes.length === 0" class="empty-state">
			<div class="empty-icon">📚</div>
			<p>暂无任务</p>
		</div>
		
		<div v-else class="heap-visual">
			<!-- 树形可视化 SVG -->
			<div class="svg-wrapper" v-if="heapTree.length > 0">
				<svg class="heap-svg" :width="svgWidth" :height="svgHeight">
					<!-- 连接线 -->
					<g class="heap-links">
						<line 
							v-for="node in heapTree.filter(n => n.parentIdx >= 0)" 
							:key="`link-${node.index}`"
							:x1="getNodeX(node.parentIdx)"
							:y1="getNodeY(node.parentIdx)"
							:x2="getNodeX(node.index)"
							:y2="getNodeY(node.index)"
							stroke="#cbd5e1"
							stroke-width="2"
						/>
					</g>
					
					<!-- 节点圆形 -->
					<g class="heap-nodes">
						<circle 
							v-for="node in heapTree" 
							:key="`circle-${node.index}`"
							:cx="getNodeX(node.index)"
							:cy="getNodeY(node.index)"
							:r="getNodeRadius(node.level)"
							class="heap-node"
							:style="{ fill: getNodeColor(node) }"
						/>
						<!-- 优先级数字 -->
						<text 
							v-for="node in heapTree" 
							:key="`score-${node.index}`"
							:x="getNodeX(node.index)"
							:y="getNodeY(node.index) + 2"
							class="heap-score"
							text-anchor="middle"
							dominant-baseline="middle"
						>
							{{ Math.round(node.priorityInfo.finalScore) }}
						</text>
					</g>
				</svg>
			</div>
			
			<!-- 列表视图 -->
			<div class="heap-list">
				<div class="list-header">任务列表（按优先级排序）</div>
				<div
					v-for="(node, idx) in heapTree"
					:key="node.id"
					data-task-item
					:class="['heap-item', { selected: selectedTaskId === node.id }]"
					@click="selectTask(node.id)"
				>
					<div class="item-rank">{{ idx + 1 }}</div>
					<div class="item-content">
						<div class="item-title">{{ node.title }}</div>
						<div class="item-meta">
							<span class="score-badge">
								📊 {{ Math.round(node.priorityInfo.finalScore) }}
							</span>
							<span class="priority-label">
								{{ getPriorityLevelName(node.priorityInfo.finalScore) }}
							</span>
							<span v-if="node.deadline" class="deadline-badge">
								⏱️ {{ getUrgencyLevelName(node.priorityInfo.breakdown.daysUntilDeadline) }}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>


<script setup>
// 不同层级节点半径，level越小越大
const getNodeRadius = (level) => {
	// 0层最大，后续每层递减，最小20，最大40
	const base = 40;
	const min = 20;
	const r = base - level * 6;
	return r > min ? r : min;
}
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { calculatePrioritiesForAll, getPriorityLevelName, getPriorityLevelColor, getUrgencyLevelName } from '../../utils/priorityCalculator'

const props = defineProps({
	todos: { type: Array, default: () => [] },
	selectedTaskId: Number
})

const emit = defineEmits(['task-selected'])

// 点击空白区域处理
const heapContainerRef = ref(null)

const outsideClickHandler = (e) => {
	const el = heapContainerRef.value
	if (!el) return

	// 如果点击发生在堆容器内部但不在任务项上，则取消选中
	if (el.contains(e.target)) {
		// 如果当前没有选中任务，则不需要处理
		if (props.selectedTaskId == null) return

		// 如果点击落在某个任务项内部，则不取消选中
		const taskItem = e.target.closest && e.target.closest('.heap-item')
		if (!taskItem) {
			emit('task-selected', null)
		}
	}
}

onMounted(() => {
	document.addEventListener('click', outsideClickHandler)
})

onUnmounted(() => {
	document.removeEventListener('click', outsideClickHandler)
})

// 调试
watch(() => props.todos, (newVal) => {
	console.log('TodoHeap 收到任务:', newVal)
}, { immediate: true })

const statusLabel = {
	todo: '待办',
	doing: '进行中',
	done: '已完成'
}

// 计算所有任务的综合优先级并排序
const sortedTodos = computed(() => {
	if (!props.todos || props.todos.length === 0) return []
	try {
		const result = calculatePrioritiesForAll(props.todos)
		console.log('排序后的任务:', result)
		return result
	} catch (e) {
		console.error('优先级计算错误:', e)
		return []
	}
})

// 构建大顶堆结构（仅使用叶子任务，基于计算后的优先级）
const heapNodes = computed(() => {
	const todos = sortedTodos.value.filter(t => {
		// 只保留未完成的叶子节点（没有子任务）
		const isNotDone = t.status !== 'done'
		const childCount = t.priorityInfo?.breakdown?.childCount ?? 0
		const isLeaf = childCount === 0
		return isNotDone && isLeaf
	})
	console.log('堆节点 (仅叶子):', todos)
	return todos
})

// 计算堆的层级和位置
const heapTree = computed(() => {
	if (heapNodes.value.length === 0) return []
	
	const tree = []
	const nodes = heapNodes.value
	
	for (let i = 0; i < nodes.length; i++) {
		const level = Math.floor(Math.log2(i + 1))
		const posInLevel = i - (Math.pow(2, level) - 1)
		tree.push({
			...nodes[i],
			index: i,
			level,
			posInLevel,
			leftChildIdx: 2 * i + 1,
			rightChildIdx: 2 * i + 2,
			parentIdx: Math.floor((i - 1) / 2)
		})
	}
	
	console.log('堆树:', tree)
	return tree
})

// 获取节点的颜色
const getNodeColor = (node) => {
	return getPriorityLevelColor(node.priorityInfo.finalScore)
}


// 节点间距参数
const BASE_RADIUS = 40;
const MIN_RADIUS = 20;
const H_GAP = 2.8; // 水平间距系数
const V_GAP = 2.5; // 垂直间距系数

// 计算 SVG 尺寸（根据最大半径和层数自适应）
const svgWidth = computed(() => {
	if (heapTree.value.length === 0) return 800;
	const maxLevel = Math.max(...heapTree.value.map(n => n.level));
	// 每层节点数 * 节点直径 * 间距系数
	const maxNodes = Math.pow(2, maxLevel);
	return maxNodes * BASE_RADIUS * H_GAP;
});

const svgHeight = computed(() => {
	if (heapTree.value.length === 0) return 400;
	const maxLevel = Math.max(...heapTree.value.map(n => n.level));
	// 层数 * 节点直径 * 间距系数
	return (maxLevel + 1) * BASE_RADIUS * V_GAP + BASE_RADIUS;
});

// 计算节点 X 坐标（水平方向）
const getNodeX = (index) => {
	const node = heapTree.value.find(n => n.index === index);
	if (!node) return 0;
	const level = node.level;
	const nodesInLevel = Math.pow(2, level);
	const radius = getNodeRadius(level);
	const levelWidth = nodesInLevel * radius * H_GAP;
	const offsetInLevel = (node.posInLevel + 0.5) / nodesInLevel;
	const levelStartX = (svgWidth.value - levelWidth) / 2;
	return levelStartX + offsetInLevel * levelWidth;
};

// 计算节点 Y 坐标（垂直方向）
const getNodeY = (index) => {
	const node = heapTree.value.find(n => n.index === index);
	if (!node) return 0;
	const radius = getNodeRadius(node.level);
	return node.level * BASE_RADIUS * V_GAP + BASE_RADIUS;
};

const selectTask = (taskId) => {
	console.log('选中任务ID:', taskId)
	emit('task-selected', taskId)
}
</script>


<style scoped>
.heap-container {
	padding: 20px;
	background: #f9fafb;
	border-radius: 12px;
	height: 100%;
	overflow-y: auto;
}

.heap-info {
	margin-bottom: 20px;
}

.heap-info h2 {
	font-size: 24px;
	font-weight: 700;
	color: #111827;
	margin: 0 0 8px 0;
}

.heap-info p {
	color: #6b7280;
	margin: 0;
	font-size: 14px;
}

.empty-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	padding: 60px 20px;
	text-align: center;
	color: #9ca3af;
}

.empty-icon {
	font-size: 48px;
	margin-bottom: 12px;
}

.heap-visual {
	display: flex;
	gap: 20px;
}

/* SVG 容器 */
.svg-wrapper {
	flex: 1;
	background: white;
	border-radius: 10px;
	padding: 10px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	overflow: auto;
	max-height: 600px;
}

.heap-svg {
	display: block;
	margin: 0 auto;
}

.heap-links {
	pointer-events: none;
}

.heap-node {
	cursor: pointer;
	transition: all 0.2s ease;
	stroke: white;
	stroke-width: 2;
	filter: drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1));
}

.heap-node:hover {
	filter: drop-shadow(0 4px 8px rgba(0, 0, 0, 0.2)) brightness(1.1);
	r: 35;
}

.heap-score {
	font-weight: 700;
	font-size: 13px;
	fill: white;
	pointer-events: none;
	text-anchor: middle;
	dominant-baseline: central;
}

/* 列表容器 */
.heap-list {
	flex: 1;
	display: flex;
	flex-direction: column;
	background: white;
	border-radius: 10px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
	overflow: hidden;
}

.list-header {
	padding: 12px 16px;
	font-weight: 700;
	color: #111827;
	background: #f3f4f6;
	border-bottom: 1px solid #e5e7eb;
	font-size: 14px;
}

.heap-item {
	display: flex;
	align-items: flex-start;
	gap: 12px;
	padding: 12px 16px;
	border-bottom: 1px solid #e5e7eb;
	transition: all 0.2s ease;
	cursor: pointer;
}

.heap-item:hover {
	background: #f9fafb;
}

.heap-item:last-child {
	border-bottom: none;
}

.item-rank {
	min-width: 32px;
	height: 32px;
	border-radius: 50%;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	display: flex;
	align-items: center;
	justify-content: center;
	font-weight: 700;
	font-size: 13px;
	color: white;
	flex-shrink: 0;
}

.item-content {
	flex: 1;
	min-width: 0;
}

.item-title {
	font-weight: 600;
	color: #111827;
	white-space: nowrap;
	overflow: hidden;
	text-overflow: ellipsis;
	font-size: 14px;
	margin-bottom: 4px;
}

.item-meta {
	display: flex;
	gap: 8px;
	align-items: center;
	flex-wrap: wrap;
	font-size: 12px;
}

.score-badge {
	padding: 2px 8px;
	border-radius: 4px;
	background: #f0f1f3;
	color: #6b7280;
	font-weight: 600;
}

.priority-label {
	padding: 2px 8px;
	border-radius: 4px;
	background: #e5e7eb;
	color: #4b5563;
	font-weight: 600;
}

.deadline-badge {
	padding: 2px 8px;
	border-radius: 4px;
	background: #fee2e2;
	color: #991b1b;
	font-weight: 600;
}

.item-select {
	display: flex;
	align-items: center;
	margin-left: 12px;
}

.heap-item.selected {
	/* border-color: #10b981; */
	/* box-shadow: 0 0 0 2px #d1fae5; */
	background: #eff6ff;
  	border-left: 3px solid #2563eb;
}

@media (max-width: 1024px) {
	.heap-visual {
		flex-direction: column;
	}
	
	.svg-wrapper {
		max-height: 300px;
	}
	
	.heap-list {
		max-height: 400px;
		overflow-y: auto;
	}
}
</style>
