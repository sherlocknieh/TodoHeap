
<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { supabase } from '../supabase'
import TodoList from '../components/TodoList.vue'
import TodoTree from '../components/TodoTree.vue'
import TodoHeap from '../components/TodoHeap.vue'

const session = ref()
const todos = ref([])
const activeView = ref('list')
const router = useRouter()

onMounted(() => {
	supabase.auth.getSession().then(({ data }) => {
		session.value = data.session
	})

	supabase.auth.onAuthStateChange((_, _session) => {
		session.value = _session
	})
})

const handleSignOut = async () => {
	await supabase.auth.signOut()
	router.push('/login')
}

const handleTodoChange = (items) => {
	todos.value = items || []
}

const treeNodes = computed(() => buildTree(todos.value))

function buildTree(list) {
	const nodes = (list || [])
		.filter((item) => item.status !== 'deleted')
		.map((item) => ({
			id: item.id,
			title: item.title,
			status: item.status || 'todo',
			priority: item.priority ?? 0,
			parent_id: item.parent_id,
			children: []
		}))

	const map = new Map()
	nodes.forEach((n) => map.set(n.id, n))

	const roots = []
	nodes.forEach((n) => {
		if (n.parent_id && map.has(n.parent_id)) {
			map.get(n.parent_id).children.push(n)
		} else {
			roots.push(n)
		}
	})

	const sortFn = (a, b) => (b.priority ?? 0) - (a.priority ?? 0) || a.id - b.id
	const sortTree = (arr) => {
		arr.sort(sortFn)
		arr.forEach((child) => sortTree(child.children))
	}
	sortTree(roots)
	return roots
}
</script>

<template>
	<div class="todo-page">
		<div class="page-header">
			<div>
				<div class="app-title">📝 TodoHeap</div>
				<p class="app-sub">登录后主页 · 三视图切换</p>
			</div>
			<button class="sign-out-btn" @click="handleSignOut">退出登录</button>
		</div>

		<div class="view-tabs">
			<button :class="['tab', { active: activeView === 'list' }]" @click="activeView = 'list'">列表视图</button>
			<button :class="['tab', { active: activeView === 'tree' }]" @click="activeView = 'tree'">树视图</button>
			<button :class="['tab', { active: activeView === 'heap' }]" @click="activeView = 'heap'">堆视图</button>
		</div>

		<div class="view-area">
			<div v-if="activeView === 'list'">
				<TodoList :session="session" @change="handleTodoChange" />
			</div>
			<div v-else-if="activeView === 'tree'">
				<TodoTree :todos="treeNodes" title="Todo Mind Map" />
			</div>
			<div v-else>
				<TodoHeap :todos="todos" />
			</div>
		</div>
	</div>
</template>

<style scoped>
.todo-page {
	min-height: 100vh;
	background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
	padding: 24px;
	display: flex;
	flex-direction: column;
	gap: 16px;
}

.page-header {
	display: flex;
	justify-content: space-between;
	align-items: center;
	background: #fff;
	padding: 16px 20px;
	border-radius: 12px;
	box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.app-title {
	font-size: 22px;
	font-weight: 800;
	color: #4c1d95;
}

.app-sub {
	margin-top: 4px;
	color: #6b7280;
	font-size: 13px;
}

.sign-out-btn {
	padding: 10px 16px;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border: none;
	border-radius: 10px;
	cursor: pointer;
	font-weight: 600;
	transition: all 0.2s ease;
}

.sign-out-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 6px 18px rgba(102, 126, 234, 0.45);
}

.view-tabs {
	display: flex;
	gap: 10px;
	background: #fff;
	padding: 10px;
	border-radius: 12px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.06);
}

.tab {
	flex: 1;
	padding: 10px 12px;
	border-radius: 10px;
	border: 1px solid #e5e7eb;
	background: #f9fafb;
	cursor: pointer;
	font-weight: 600;
	color: #4b5563;
	transition: all 0.15s ease;
}

.tab.active {
	background: linear-gradient(135deg, #a855f7 0%, #6366f1 100%);
	color: #fff;
	border-color: transparent;
	box-shadow: 0 8px 18px rgba(99, 102, 241, 0.25);
}

.view-area {
	background: #fff;
	border-radius: 12px;
	padding: 16px;
	box-shadow: 0 8px 18px rgba(0, 0, 0, 0.06);
}

@media (max-width: 768px) {
	.todo-page {
		padding: 16px;
	}

	.page-header {
		flex-direction: column;
		gap: 10px;
		align-items: flex-start;
	}

	.view-tabs {
		flex-direction: column;
	}

	.tab {
		width: 100%;
	}
}
</style>
