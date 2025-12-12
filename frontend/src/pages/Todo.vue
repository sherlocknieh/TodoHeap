<template>
	<!-- 主界面 -->
	<div class="min-h-screen bg-slate-100 flex flex-col">
		<!-- 页面头部 -->
		<div class="bg-white border-b border-slate-200 sticky top-0 z-40">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
				<div class="flex justify-between items-start md:items-center gap-4 flex-col md:flex-row">
					<!-- 左侧标题 -->
					<div>
						<h1 class="text-2xl md:text-3xl font-bold text-slate-900">📝 TodoHeap</h1>
						<p class="text-sm text-slate-500 mt-1">登录后主页 · 三视图切换</p>
						<button
							@click="handleBreakdownTask"
							:disabled="!selectedTaskId || isBreakingDown"
							class="mt-3 px-4 py-2 bg-gradient-to-r from-emerald-500 to-emerald-600 text-white font-semibold rounded-lg hover:shadow-lg hover:-translate-y-0.5 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:shadow-none disabled:hover:translate-y-0 transition-all duration-300 text-sm"
						>
							{{ isBreakingDown ? '分解中...' : '任务分解' }}
							{{ selectedTaskId ? `(ID: ${selectedTaskId})` : '(请先选择任务)' }}
						</button>
					</div>

					<!-- 右侧用户菜单 -->
					<div class="relative">
						<button
							@click="showUserMenu = !showUserMenu"
							class="px-4 py-2 bg-gradient-to-r from-indigo-600 to-purple-700 text-white font-semibold rounded-lg hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 text-sm whitespace-nowrap"
						>
							👤 {{ authStore.user?.email?.split('@')[0] || '用户' }}
						</button>

						<!-- 下拉菜单 -->
						<div
							v-if="showUserMenu"
							class="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-xl border border-slate-200 overflow-hidden z-50"
						>
							<button
								@click="openSettings"
								class="w-full px-4 py-3 text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2"
							>
								⚙️ 设置
							</button>
							<div class="border-t border-slate-200"></div>
							<button
								@click="handleSignOut"
								class="w-full px-4 py-3 text-left text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 font-medium"
							>
								🚪 退出登录
							</button>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- 消息提示 -->
		<div
			v-if="breakdownMessage"
			:class="[
				'mx-4 mt-4 px-4 py-3 rounded-lg font-medium text-sm animate-in fade-in slide-in-from-top-2 duration-300',
				{
					'bg-emerald-100 text-emerald-800 border border-emerald-300': breakdownMessageType === 'success',
					'bg-red-100 text-red-800 border border-red-300': breakdownMessageType === 'error'
				}
			]"
		>
			{{ breakdownMessage }}
		</div>

		<!-- 视图选项卡 -->
		<div class="bg-white border-b border-slate-200">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex gap-2">
					<button
						v-for="view in ['list', 'tree', 'heap']"
						:key="view"
						@click="switchView(view)"
						:class="[
							'px-4 py-3 font-semibold border-b-2 transition-colors',
							activeView === view
								? 'border-indigo-600 text-indigo-600'
								: 'border-transparent text-slate-600 hover:text-slate-900'
						]"
					>
						{{ view === 'list' ? '📋 列表视图' : view === 'tree' ? '🌳 树视图' : '📦 堆视图' }}
					</button>
				</div>
			</div>
		</div>

		<!-- 视图内容区域 -->
		<div class="flex-1 overflow-auto bg-slate-100">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
				<div class="bg-white rounded-lg shadow-sm p-6">
					<!-- 列表视图 -->
					<div v-if="activeView === 'list'">
						<TodoList @task-selected="handleTaskSelected" />
					</div>

					<!-- 树视图 -->
					<div v-else-if="activeView === 'tree'">
						<div v-if="todoStore.loading" class="flex items-center justify-center h-96 text-slate-500">
							<p class="text-lg">⏳ 加载中...</p>
						</div>
						<TodoTree v-else :todos="todoStore.todos" title="Todo Mind Map" @task-selected="handleTaskSelected" />
					</div>

					<!-- 堆视图 -->
					<div v-else>
						<div v-if="todoStore.loading" class="flex items-center justify-center h-96 text-slate-500">
							<p class="text-lg">⏳ 加载中...</p>
						</div>
						<TodoHeap v-else :todos="todoStore.todos" :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
					</div>
				</div>
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
const isBreakingDown = ref(false)
const breakdownMessage = ref('')
const breakdownMessageType = ref('') // 'success' or 'error'

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
		showBreakdownMessage('请先选择一个任务', 'error')
		return
	}
	
	isBreakingDown.value = true
	breakdownMessage.value = ''
	
	try {
		const query = '继续分解'
		const result = await todoStore.invokeBreakdown(todoStore.treeNodes, selectedTaskId.value, query)
		
		if (result.success) {
			showBreakdownMessage(`成功添加 ${result.addedCount}/${result.totalCount} 个子任务`, 'success')
			// 刷新任务列表以显示新添加的子任务
			await todoStore.fetchTodos()
		} else {
			showBreakdownMessage(`任务分解失败: ${result.error}`, 'error')
		}
	} finally {
		isBreakingDown.value = false
	}
}

const showBreakdownMessage = (message, type) => {
	breakdownMessage.value = message
	breakdownMessageType.value = type
	// 3秒后自动清除消息
	setTimeout(() => {
		breakdownMessage.value = ''
		breakdownMessageType.value = ''
	}, 3000)
}
</script>
