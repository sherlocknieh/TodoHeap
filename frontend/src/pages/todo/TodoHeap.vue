<template>
	<!-- 堆视图：形状表示层级，分数决定颜色 -->
	<div class="h-full overflow-y-auto pt-6">
		<div v-if="heapNodes.length === 0" class="py-20 text-center">
			<p class="text-sm text-neutral-500">暂无任务</p>
		</div>

		<div v-else class="grid lg:grid-cols-2 gap-4">
			<!-- 堆形可视化 -->
			<div v-if="heapTree.length > 0" class="panel p-2 overflow-auto max-h-150">
				<svg class="block mx-auto" :width="svgWidth" :height="svgHeight">
					<g class="heap-links">
						<line v-for="node in heapTree.filter(n => n.parentIdx >= 0)" :key="`link-${node.index}`"
							:x1="getNodeX(node.parentIdx)" :y1="getNodeY(node.parentIdx)" :x2="getNodeX(node.index)"
							:y2="getNodeY(node.index)" stroke-width="1.5" />
					</g>
					<g>
						<circle v-for="node in heapTree" :key="`circle-${node.index}`" :cx="getNodeX(node.index)"
							:cy="getNodeY(node.index)" :r="getNodeRadius(node.level)" class="heap-node"
							:style="{ fill: getNodeColor(node) }" />
						<text v-for="node in heapTree" :key="`score-${node.index}`" :x="getNodeX(node.index)"
							:y="getNodeY(node.index) + 2" class="heap-score" text-anchor="middle"
							dominant-baseline="middle" :style="{ fill: getNodeTextColor(node) }">
							{{ Math.round(node.priorityInfo.finalScore) }}
						</text>
					</g>
				</svg>
			</div>

			<!-- 按优先级排序 -->
			<div class="panel self-start overflow-hidden">
				<div class="px-3 py-2 border-b border-hairline dark:border-hairline-dark">
					<span class="eyebrow">按优先级排序</span>
				</div>
				<div v-for="(node, idx) in heapTree" :key="node.id" data-task-item :class="[
					'flex items-start gap-3 px-3 py-2 border-b border-hairline dark:border-hairline-dark last:border-0 cursor-pointer border-l-2 transition-colors',
					selectedTaskId === node.id
						? 'bg-accent-50 dark:bg-accent-500/10 border-l-accent-600 dark:border-l-accent-400'
						: 'border-l-transparent hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06]'
				]" @click="selectTask(node.id)">
					<span class="w-5 shrink-0 pt-0.5 font-mono text-xs text-neutral-400">{{ idx + 1 }}</span>
					<div class="flex-1 min-w-0">
						<p class="text-sm text-neutral-800 dark:text-neutral-200 truncate">{{ node.title }}</p>
						<div class="mt-1 flex flex-wrap items-center gap-1.5">
							<span class="chip font-mono">{{ Math.round(node.priorityInfo.finalScore) }}</span>
							<span class="chip">
								<span class="h-1.5 w-1.5 rounded-full" :style="{ background: getNodeColor(node) }"></span>
								{{ getPriorityLevelName(node.priorityInfo.finalScore) }}
							</span>
							<span v-if="node.deadline" class="chip">
								<AppIcon name="clock" :size="10" />
								{{ getUrgencyLevelName(node.priorityInfo.breakdown.daysUntilDeadline) }}
							</span>
						</div>
					</div>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.heap-links line {
	stroke: currentColor;
	opacity: 0.25;
}

.heap-node {
	cursor: pointer;
	stroke: transparent;
	transition: opacity 0.15s ease;
}

.heap-node:hover {
	opacity: 0.85;
}

.heap-score {
	font-family: var(--font-mono);
	font-weight: 600;
	font-size: 12px;
	pointer-events: none;
	text-anchor: middle;
	dominant-baseline: central;
}
</style>

<script setup>
// 不同层级节点半径，level越小越大
// 分数文字按节点底色的明暗取黑或白，浅色节点上也读得清
const getNodeTextColor = (node) => {
	const hex = getNodeColor(node).replace('#', '')
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
	const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b
	return luminance > 0.55 ? '#0b2a1c' : '#ffffff'
}

const getNodeRadius = (level) => {
	// 0层最大，后续每层递减，最小20，最大40
	const base = 40;
	const min = 20;
	const r = base - level * 6;
	return r > min ? r : min;
}
import { computed, watch, onMounted, onUnmounted, ref } from 'vue'
import { calculatePrioritiesForAll, getPriorityLevelName, getPriorityLevelColor, getUrgencyLevelName } from '@/utils/priorityCalculator'
import AppIcon from '@/components/AppIcon.vue'

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
		const isNotDone = !t.completed_at
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


