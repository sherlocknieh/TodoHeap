<script setup>
import { computed } from 'vue'

const props = defineProps({
	todos: { type: Array, default: () => [] },
	title: { type: String, default: 'Todo 思维导图' }
})

const rootNode = computed(() => {
	const children = (props.todos || []).map((todo, idx) => ({
		id: todo.id ?? `todo-${idx}`,
		title: todo.title || '未命名任务',
		status: todo.status || 'todo',
		children: todo.children || []
	}))

	const doneCount = children.filter((c) => c.status === 'done').length
	return {
		id: 'root',
		title: props.title,
		meta: `${children.length} 个任务 · ${doneCount} 已完成`,
		children
	}
})

const statusLabel = (status) => {
	switch (status) {
		case 'done':
			return '已完成'
		case 'doing':
			return '进行中'
		case 'todo':
		default:
			return '待办'
	}
}

const nodeCardClass = (status) => {
	if (status === 'done') return 'done'
	if (status === 'doing') return 'doing'
	return ''
}

const splitBranches = computed(() => {
	const nodes = rootNode.value.children || []
	const mid = Math.ceil(nodes.length / 2)
	return {
		left: nodes.slice(0, mid),
		right: nodes.slice(mid)
	}
})
</script>

<template>
	<div class="mindmap-shell" aria-label="todo mind map">
		<div class="branch branch-left" aria-label="left branch">
			<div v-for="node in splitBranches.left" :key="node.id" class="branch-item">
				<div class="connector"></div>
				<div class="node-card" :class="nodeCardClass(node.status)">
					<div class="node-title">{{ node.title }}</div>
					<div class="node-meta">
						<span class="status-dot" :data-status="node.status"></span>
						{{ statusLabel(node.status) }}
					</div>
					<ul v-if="node.children?.length" class="child-list">
						<li v-for="child in node.children" :key="child.id" :class="nodeCardClass(child.status)">
							<span class="bullet"></span>
							<span>{{ child.title }}</span>
						</li>
					</ul>
				</div>
			</div>
		</div>

		<div class="center-node">
			<div class="center-title">{{ rootNode.title }}</div>
			<div class="center-meta">{{ rootNode.meta }}</div>
		</div>

		<div class="branch branch-right" aria-label="right branch">
			<div v-for="node in splitBranches.right" :key="node.id" class="branch-item">
				<div class="connector"></div>
				<div class="node-card" :class="nodeCardClass(node.status)">
					<div class="node-title">{{ node.title }}</div>
					<div class="node-meta">
						<span class="status-dot" :data-status="node.status"></span>
						{{ statusLabel(node.status) }}
					</div>
					<ul v-if="node.children?.length" class="child-list">
						<li v-for="child in node.children" :key="child.id" :class="nodeCardClass(child.status)">
							<span class="bullet"></span>
							<span>{{ child.title }}</span>
						</li>
					</ul>
				</div>
			</div>
		</div>
	</div>
</template>

<style scoped>
.mindmap-shell {
	position: relative;
	display: grid;
	grid-template-columns: 1fr auto 1fr;
	align-items: center;
	gap: 24px;
	padding: 32px 12px;
	background: linear-gradient(135deg, #f7f9ff 0%, #eef2ff 100%);
	border-radius: 16px;
	box-shadow: 0 8px 24px rgba(0, 0, 0, 0.06);
	overflow: hidden;
}

.branch {
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.branch-item {
	display: grid;
	grid-template-columns: 40px 1fr;
	align-items: center;
}

.connector {
	height: 100%;
	width: 40px;
	position: relative;
}

.connector::before {
	content: '';
	position: absolute;
	top: 50%;
	left: 8px;
	right: 8px;
	height: 2px;
	background: linear-gradient(90deg, #8b5cf6, #22d3ee);
	transform: translateY(-50%);
}

.center-node {
	position: relative;
	z-index: 1;
	background: white;
	padding: 18px 22px;
	border-radius: 14px;
	box-shadow: 0 12px 30px rgba(0, 0, 0, 0.08);
	text-align: center;
	border: 2px solid #8b5cf6;
	min-width: 180px;
}

.center-title {
	font-weight: 700;
	font-size: 18px;
	color: #4c1d95;
}

.center-meta {
	margin-top: 6px;
	font-size: 12px;
	color: #6b7280;
}

.node-card {
	position: relative;
	padding: 14px 16px;
	background: white;
	border-radius: 12px;
	border: 1px solid #e5e7eb;
	box-shadow: 0 8px 18px rgba(0, 0, 0, 0.05);
	transition: transform 0.2s ease, box-shadow 0.2s ease, border 0.2s ease;
}

.node-card:hover {
	transform: translateY(-2px);
	box-shadow: 0 12px 28px rgba(0, 0, 0, 0.08);
}

.node-card.done {
	border-color: #10b981;
	background: #ecfdf3;
}

.node-card.doing {
	border-color: #f59e0b;
	background: #fff7ed;
}

.node-title {
	font-weight: 600;
	color: #111827;
}

.node-meta {
	margin-top: 4px;
	font-size: 12px;
	color: #6b7280;
}

.status-dot {
	display: inline-block;
	width: 8px;
	height: 8px;
	border-radius: 999px;
	margin-right: 6px;
	background: #9ca3af;
}

.status-dot[data-status='todo'] {
	background: #3b82f6;
}

.status-dot[data-status='doing'] {
	background: #f59e0b;
}

.status-dot[data-status='done'] {
	background: #10b981;
}

.child-list {
	margin-top: 10px;
	list-style: none;
	padding: 0;
	display: flex;
	flex-direction: column;
	gap: 6px;
}

.child-list li {
	display: flex;
	align-items: center;
	gap: 8px;
	font-size: 13px;
	color: #374151;
}

.child-list li.doing {
	color: #d97706;
}

.child-list li.done {
	color: #10b981;
	text-decoration: line-through;
}

.bullet {
	width: 8px;
	height: 8px;
	border-radius: 50%;
	background: linear-gradient(135deg, #22d3ee, #8b5cf6);
	flex-shrink: 0;
}

@media (max-width: 900px) {
	.mindmap-shell {
		grid-template-columns: 1fr;
		text-align: center;
	}

	.branch {
		order: 2;
	}

	.branch-item {
		grid-template-columns: 24px 1fr;
	}

	.connector::before {
		left: 0;
		right: 0;
	}
}
</style>
