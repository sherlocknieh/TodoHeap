<script setup>
import { computed } from 'vue'

const props = defineProps({
	todos: { type: Array, default: () => [] }
})

const columns = computed(() => {
	const grouped = { todo: [], doing: [], done: [] }
	;(props.todos || []).forEach((item) => {
		const status = item.status === 'doing' ? 'doing' : item.status === 'done' ? 'done' : 'todo'
		grouped[status].push(item)
	})

	const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
	Object.values(grouped).forEach((arr) => arr.sort(sortFn))
	return grouped
})

const labels = {
	todo: '待办',
	doing: '进行中',
	done: '已完成'
}

const statusTone = {
	todo: 'blue',
	doing: 'amber',
	done: 'green'
}
</script>

<template>
	<div class="heap-shell">
		<div v-for="(items, key) in columns" :key="key" class="heap-column">
			<div class="column-head">
				<div class="dot" :data-tone="statusTone[key]"></div>
				<div class="title">{{ labels[key] }}</div>
				<div class="count">{{ items.length }}</div>
			</div>
			<div class="card-list" v-if="items.length">
				<div v-for="item in items" :key="item.id" class="heap-card">
					<div class="card-title">{{ item.title }}</div>
					<div class="card-meta">
						<span class="priority" :data-level="item.priority ?? 0">P{{ item.priority ?? 0 }}</span>
						<span v-if="item.deadline" class="deadline">截止 {{ new Date(item.deadline).toLocaleDateString() }}</span>
					</div>
				</div>
			</div>
			<div v-else class="empty">暂无任务</div>
		</div>
	</div>
</template>

<style scoped>
.heap-shell {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
	gap: 16px;
	padding: 8px;
}

.heap-column {
	background: #fff;
	border-radius: 12px;
	border: 1px solid #e5e7eb;
	box-shadow: 0 8px 18px rgba(0, 0, 0, 0.05);
	padding: 12px;
}

.column-head {
	display: flex;
	align-items: center;
	gap: 8px;
	margin-bottom: 10px;
}

.dot {
	width: 10px;
	height: 10px;
	border-radius: 999px;
	background: #9ca3af;
}

.dot[data-tone='blue'] { background: #3b82f6; }
.dot[data-tone='amber'] { background: #f59e0b; }
.dot[data-tone='green'] { background: #10b981; }

.title {
	font-weight: 700;
	color: #111827;
}

.count {
	margin-left: auto;
	background: #f3f4f6;
	color: #4b5563;
	border-radius: 999px;
	padding: 2px 8px;
	font-size: 12px;
}

.card-list {
	display: flex;
	flex-direction: column;
	gap: 8px;
}

.heap-card {
	border: 1px solid #e5e7eb;
	border-radius: 10px;
	padding: 10px;
	background: linear-gradient(135deg, #f8fafc, #ffffff);
}

.card-title {
	font-weight: 600;
	color: #111827;
}

.card-meta {
	margin-top: 6px;
	display: flex;
	align-items: center;
	gap: 10px;
	font-size: 12px;
	color: #6b7280;
}

.priority {
	padding: 2px 6px;
	border-radius: 6px;
	font-weight: 700;
	color: #fff;
	background: #9ca3af;
}

.priority[data-level='0'] { background: #9ca3af; }
.priority[data-level='1'] { background: #60a5fa; }
.priority[data-level='2'] { background: #f59e0b; }
.priority[data-level='3'] { background: #ef4444; }

.deadline {
	color: #1f2937;
}

.empty {
	padding: 12px;
	text-align: center;
	color: #9ca3af;
	background: #f9fafb;
	border-radius: 10px;
}
</style>
