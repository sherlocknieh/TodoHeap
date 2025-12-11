<template>
	<!-- 主界面 -->
	<div class="todo-page">
		<div class="page-header">
			<div>
				<div class="app-title">📝 TodoHeap</div>
				<p class="app-sub">登录后主页 · 三视图切换</p>
				<button class="invoke-hello" @click="todoStore.invokeHello">invoke Hello</button>
				<button class="invoke-breakdown" @click="handleBreakdownTask" :disabled="!selectedTaskId">
					invoke Breakdown {{ selectedTaskId ? `(ID: ${selectedTaskId})` : '(请先选择任务)' }}
				</button>
			</div>
			<div class="header-actions">
				<button class="user-menu-btn" @click="showUserMenu = !showUserMenu">
					👤 {{ authStore.user?.email?.split('@')[0] || '用户' }}
				</button>
				<div v-if="showUserMenu" class="user-menu">
					<button class="menu-item" @click="openSettings">⚙️ 设置</button>
					<div class="divider"></div>
					<button class="menu-item logout" @click="handleSignOut">🚪 退出登录</button>
				</div>
			</div>
		</div>

		<div class="view-tabs">
			<button :class="['tab', { active: activeView === 'list' }]" @click="switchView('list')">列表视图</button>
			<button :class="['tab', { active: activeView === 'tree' }]" @click="switchView('tree')">树视图</button>
			<button :class="['tab', { active: activeView === 'heap' }]" @click="switchView('heap')">堆视图</button>
		</div>

		<div class="view-area">
			<div v-if="activeView === 'list'">
				<TodoList @task-selected="handleTaskSelected" />
			</div>
			<div v-else-if="activeView === 'tree'">
				<div v-if="todoStore.loading" class="loading-state">
					<p>⏳ 加载中...</p>
				</div>
				<TodoTree v-else :todos="todoStore.todos" title="Todo Mind Map" @task-selected="handleTaskSelected" />
			</div>
			<div v-else>
				<div v-if="todoStore.loading" class="loading-state">
					<p>⏳ 加载中...</p>
				</div>
				<TodoHeap v-else :todos="todoStore.todos" @task-selected="handleTaskSelected" />
			</div>
		</div>
	</div>
</template>

<script setup>
import { ref, onMounted, computed, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTodoStore } from '../stores/todos'
import TodoList from './work/TodoList.vue'
import TodoTree from './work/TodoTree.vue'
import TodoHeap from './work/TodoHeap.vue'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()

// 根据路由名称同步当前视图
const activeView = computed({
	get: () => {
		const routeName = route.name
		if (routeName === 'TreeView') return 'tree'
		if (routeName === 'HeapView') return 'heap'
		return 'list' // 默认是 ListView
	},
	set: (view) => {
		const viewNames = {
			'list': 'ListView',
			'tree': 'TreeView',
			'heap': 'HeapView'
		}
		router.push({ name: viewNames[view] })
	}
})

const showUserMenu = ref(false)
const selectedTaskId = ref(null)

onMounted(async () => {
	// 初始化认证
	if (authStore.session === null && !authStore.loading) {
		await authStore.initialize()
	}
	
	// 如果已登录，获取待办事项
	if (authStore.isAuthenticated) {
		await todoStore.fetchTodos()
	}
})

// 监听路由变化，确保数据总是最新的
watch(
	() => route.name,
	async (newRouteName) => {
		console.log('Route changed to:', newRouteName)
		if (authStore.isAuthenticated && newRouteName?.includes('View')) {
			console.log('Checking todos - isFetched:', todoStore.isFetched, 'loading:', todoStore.loading)
			// 确保数据已经获取过
			if (!todoStore.isFetched && !todoStore.loading) {
				console.log('Fetching todos...')
				await todoStore.fetchTodos()
			}
		}
	}
)

const handleSignOut = async () => {
	const result = await authStore.signOut()
	if (result.success) {
		router.push('/login')
	}
}

const openSettings = () => {
	router.push('/settings')
	showUserMenu.value = false
}

const switchView = (view) => {
	activeView.value = view
}

const handleTaskSelected = (taskId) => {
	selectedTaskId.value = taskId
	console.log('选中任务ID:', taskId)
}

const handleBreakdownTask = async () => {
	if (!selectedTaskId.value) {
		alert('请先选择一个任务')
		return
	}
	
	const query = '继续分解'
	
	const result = await todoStore.invokeBreakdown(todoStore.treeNodes, selectedTaskId.value, query)
	
	if (result.success) {
		alert(`成功添加 ${result.addedCount}/${result.totalCount} 个子任务`)
		// 刷新任务列表以显示新添加的子任务
		await todoStore.fetchTodos()
	} else {
		alert(`任务分解失败: ${result.error}`)
	}
}
</script>

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

.header-actions {
	position: relative;
}

.user-menu-btn {
	padding: 10px 16px;
	background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	color: white;
	border: none;
	border-radius: 10px;
	cursor: pointer;
	font-weight: 600;
	transition: all 0.2s ease;
	font-size: 14px;
}

.user-menu-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 6px 18px rgba(102, 126, 234, 0.45);
}

.user-menu {
	position: absolute;
	top: 100%;
	right: 0;
	margin-top: 8px;
	background: white;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
	overflow: hidden;
	z-index: 100;
	min-width: 150px;
}

.menu-item {
	width: 100%;
	padding: 12px 16px;
	border: none;
	background: none;
	text-align: left;
	cursor: pointer;
	color: #374151;
	font-size: 14px;
	transition: background 0.2s;
}

.menu-item:hover {
	background: #f3f4f6;
}

.menu-item.logout {
	color: #ef4444;
}

.divider {
	height: 1px;
	background: #e5e7eb;
	margin: 0;
}

.sign-out-btn:hover {
	transform: translateY(-1px);
	box-shadow: 0 6px 18px rgba(102, 126, 234, 0.45);
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
	min-height: 300px;
	flex: 1;
	display: flex;
	flex-direction: column;
	overflow: hidden;
}

.view-area > div {
	width: 100%;
	height: 100%;
	display: flex;
	flex-direction: column;
}

.loading-state {
	display: flex;
	align-items: center;
	justify-content: center;
	height: 400px;
	color: #9ca3af;
	font-size: 16px;
}

.loading-state p {
	margin: 0;
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
