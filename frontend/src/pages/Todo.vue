<template>
	<!-- 主界面 -->
	<div class="h-screen bg-slate-50 flex flex-col">
		<!-- 页面头部 -->
		<header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex items-center justify-between h-16 gap-4">
					<!-- 左侧标题和操作 -->
					<div class="flex items-center gap-4 flex-1 min-w-0">
						<div class="shrink-0">
							<h1 class="text-xl sm:text-2xl font-bold text-slate-900">📝 TodoHeap</h1>
						</div>
						<div class="hidden sm:block shrink-0">
							<p class="text-xs text-slate-500">智能任务管理</p>
						</div>
						<button
							@click="handleBreakdownTask"
							:disabled="!selectedTaskId || isBreakingDown"
							class="hidden md:flex items-center gap-2 px-3 py-1.5 bg-emerald-500 text-white text-sm font-medium rounded-md hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
						>
							<span v-if="isBreakingDown">⏳</span>
							<span>{{ isBreakingDown ? '分解中' : 'AI 分解' }}</span>
						</button>
					</div>

					<!-- 右侧用户菜单 -->
					<div class="relative shrink-0">
						<button
							@click="showUserMenu = !showUserMenu"
							class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors"
						>
							<span>👤</span>
							<span class="hidden sm:inline">{{ authStore.user?.email?.split('@')[0] || '用户' }}</span>
						</button>

						<!-- 下拉菜单 -->
						<Transition
							enter-active-class="transition ease-out duration-100"
							enter-from-class="opacity-0 scale-95"
							enter-to-class="opacity-100 scale-100"
							leave-active-class="transition ease-in duration-75"
							leave-from-class="opacity-100 scale-100"
							leave-to-class="opacity-0 scale-95"
						>
							<div
								v-if="showUserMenu"
								ref="userMenuRef"
								class="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50"
							>
								<button
									@click="openSettings"
									class="w-full px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm"
								>
									<span>⚙️</span>
									<span>设置</span>
								</button>
								<div class="border-t border-slate-200"></div>
								<button
									@click="handleSignOut"
									class="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 text-sm font-medium"
								>
									<span>🚪</span>
									<span>退出登录</span>
								</button>
							</div>
						</Transition>
					</div>
				</div>
			</div>
		</header>

		<!-- 消息提示 -->
		<Transition
			enter-active-class="transition ease-out duration-300"
			enter-from-class="opacity-0 -translate-y-2"
			enter-to-class="opacity-100 translate-y-0"
			leave-active-class="transition ease-in duration-200"
			leave-from-class="opacity-100 translate-y-0"
			leave-to-class="opacity-0 -translate-y-2"
		>
			<div
				v-if="breakdownMessage"
				:class="[
					'mx-4 mt-4 px-4 py-2.5 rounded-lg text-sm font-medium',
					{
						'bg-emerald-50 text-emerald-800 border border-emerald-200': breakdownMessageType === 'success',
						'bg-red-50 text-red-800 border border-red-200': breakdownMessageType === 'error'
					}
				]"
			>
				{{ breakdownMessage }}
			</div>
		</Transition>

		<!-- 视图选项卡 -->
		<nav class="bg-white border-b border-slate-200">
			<div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
				<div class="flex gap-1 overflow-x-auto">
					<button
						v-for="view in ['list', 'tree', 'heap']"
						:key="view"
						@click="switchView(view)"
						:class="[
							'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap',
							activeView === view
								? 'border-indigo-600 text-indigo-600'
								: 'border-transparent text-slate-600 hover:text-slate-900 hover:border-slate-300'
						]"
					>
						{{ view === 'list' ? '📋 列表' : view === 'tree' ? '🌳 树形' : '📦 堆' }}
					</button>
					<!-- 垃圾箱入口 -->
					<button
						@click="switchView('trash')"
						:class="[
							'px-4 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ml-auto',
							activeView === 'trash'
								? 'border-red-500 text-red-500'
								: 'border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300'
						]"
					>
						🗑️ 垃圾箱
					</button>
				</div>
			</div>
		</nav>

		<!-- 视图内容区域 -->
		<main class="flex-1 overflow-hidden bg-slate-50">
			<div class="max-w-7xl mx-auto h-full px-4 sm:px-6 lg:px-8">
				<div class="flex gap-4 h-full py-4">
					<!-- 左侧：三视图内容 -->
					<div class="flex-1 min-w-0 bg-white rounded-lg shadow-sm border border-slate-200 flex flex-col overflow-hidden">
						<!-- 移动端 AI 分解按钮 -->
						<div class="md:hidden px-4 pt-4 pb-2 border-b border-slate-200">
							<button
								@click="handleBreakdownTask"
								:disabled="!selectedTaskId || isBreakingDown"
								class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-md hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
							>
								<span v-if="isBreakingDown">⏳</span>
								<span>{{ isBreakingDown ? '分解中...' : 'AI 任务分解' }}</span>
								<span v-if="selectedTaskId" class="text-xs opacity-75">(已选择)</span>
							</button>
						</div>

						<div class="flex-1 overflow-auto p-4 sm:p-6">
							<!-- 列表视图 -->
							<div v-if="activeView === 'list'">
								<TodoList :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
							</div>

							<!-- 树视图 -->
							<div v-else-if="activeView === 'tree'">
								<div v-if="todoStore.loading" class="flex items-center justify-center h-96 text-slate-500">
									<div class="text-center">
										<p class="text-lg mb-2">⏳</p>
										<p class="text-sm">加载中...</p>
									</div>
								</div>
								<TodoTree
									v-else
									:todos="todoStore.todos"
									:title="'Todo Mind Map'"
									:selected-task-id="selectedTaskId"
									@task-selected="handleTaskSelected"
								/>
							</div>

							<!-- 堆视图 -->
							<div v-else-if="activeView === 'heap'">
								<div v-if="todoStore.loading" class="flex items-center justify-center h-96 text-slate-500">
									<div class="text-center">
										<p class="text-lg mb-2">⏳</p>
										<p class="text-sm">加载中...</p>
									</div>
								</div>
								<TodoHeap v-else :todos="todoStore.todos" :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
							</div>

							<!-- 垃圾箱视图 -->
							<div v-else-if="activeView === 'trash'">
								<Trash :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
							</div>
						</div>
					</div>

					<!-- 右侧：详情面板（桌面端常驻，全高） -->
					<aside class="hidden lg:flex lg:flex-col w-96 shrink-0">
						<div class="bg-white rounded-lg shadow-sm border border-slate-200 flex-1 overflow-hidden">
							<TodoDetailEditor :todo-id="selectedTaskId" />
						</div>
					</aside>
				</div>
			</div>
		</main>
	</div>
</template>

<script setup>
import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTodoStore } from '../stores/todos'
import TodoList from './work/TodoList.vue'
import TodoTree from './work/TodoTree.vue'
import TodoHeap from './work/TodoHeap.vue'
import Trash from './work/Trash.vue'
import TodoDetailEditor from '../components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '../utils/detailPanelContext'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()

const userMenuRef = ref(null)

// 根据路由名称同步当前视图
const activeView = computed({
	get: () => {
		const routeName = route.name
		if (routeName === 'TreeView') return 'tree'
		if (routeName === 'HeapView') return 'heap'
		if (routeName === 'TrashView') return 'trash'
		return 'list' // 默认是 ListView
	},
	set: (view) => {
		const viewNames = {
			'list': 'ListView',
			'tree': 'TreeView',
			'heap': 'HeapView',
			'trash': 'TrashView'
		}
		router.push({ name: viewNames[view] })
	}
})

const showUserMenu = ref(false)
const selectedTaskId = ref(null)
const isBreakingDown = ref(false)
const breakdownMessage = ref('')
const breakdownMessageType = ref('') // 'success' or 'error'

const detailPanelRequested = ref(false)

const openDetailPanel = () => {
	detailPanelRequested.value = true
}

provide(TODO_DETAIL_PANEL_CONTEXT, {
	openDetailPanel
})

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

// 点击外部关闭用户菜单
const handleClickOutside = (event) => {
	if (userMenuRef.value && !userMenuRef.value.contains(event.target)) {
		const userMenuButton = event.target.closest('button')
		if (!userMenuButton || !userMenuButton.textContent.includes('👤')) {
			showUserMenu.value = false
		}
	}
}

onMounted(() => {
	document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside)
})
</script>
