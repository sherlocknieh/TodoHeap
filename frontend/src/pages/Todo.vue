<template>
	<!-- 主界面 -->
	<div class="h-screen bg-slate-50 flex flex-col">
		<!-- 顶栏 -->
		<header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
			<!-- 用于内容布局的容器（去掉限宽） -->
			<div class="flex items-center justify-between h-16 gap-4 px-6">
				<!-- 左侧标题 -->
				<div class="flex items-center gap-3">
					<!-- 侧栏切换按钮（汉堡菜单） -->
					<button @click="toggleLeftPanel"
						class="lg:hidden flex items-center justify-center w-10 h-10 rounded-md border border-slate-200 bg-white shadow hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition"
						title="切换侧栏">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="4" y="6" width="16" height="2" rx="1" fill="#6366F1" />
							<rect x="4" y="11" width="16" height="2" rx="1" fill="#6366F1" />
							<rect x="4" y="16" width="16" height="2" rx="1" fill="#6366F1" />
						</svg>
					</button>
					<h1 class="text-xl sm:text-2xl font-bold text-slate-900">📝 TodoHeap</h1>
					<span class="hidden sm:inline text-sm text-slate-500">智能任务管理</span>
				</div>

				<!-- 右侧用户信息和同步状态 -->
				<div class="flex items-center gap-4">
					<!-- 同步状态指示器 -->
					<SyncStatusIndicator />

					<!-- 用户菜单 -->
					<div class="relative">
						<button @click="showUserMenu = !showUserMenu"
							class="flex items-center gap-2 px-3 py-1.5 bg-slate-100 text-slate-700 text-sm font-medium rounded-md hover:bg-slate-200 transition-colors">
							<span>👤</span>
							<span class="hidden sm:inline">{{ authStore.user?.email?.split('@')[0] || '用户' }}</span>
						</button>

						<!-- 下拉菜单 -->
						<Transition enter-active-class="transition ease-out duration-100"
							enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
							leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
							leave-to-class="opacity-0 scale-95">
							<div v-if="showUserMenu" ref="userMenuRef"
								class="absolute top-full right-0 mt-2 w-48 bg-white rounded-lg shadow-lg border border-slate-200 overflow-hidden z-50">
								<button @click="openSettings"
									class="w-full px-4 py-2.5 text-left text-slate-700 hover:bg-slate-50 transition-colors flex items-center gap-2 text-sm">
									<span>⚙️</span>
									<span>设置</span>
								</button>
								<div class="border-t border-slate-200"></div>
								<button @click="handleSignOut"
									class="w-full px-4 py-2.5 text-left text-red-600 hover:bg-red-50 transition-colors flex items-center gap-2 text-sm font-medium">
									<span>🚪</span>
									<span>退出登录</span>
								</button>
							</div>
						</Transition>
					</div>
				</div>
			</div>
		</header>

		<!-- 内容区域 - 左中右三栏布局 -->
		<main class="flex-1 overflow-hidden bg-slate-50">
			<div class="h-full flex relative">
				<!-- 左栏：任务导航面板（大屏常驻） -->
				<aside :class="[
					'bg-white border-r border-slate-200 flex flex-col transition-all duration-300',
					leftPanelCollapsed ? 'w-0 overflow-hidden' : 'w-64',
					'hidden lg:flex'
				]">
					<!-- 侧栏内容... -->
					<div class="p-4 border-b border-slate-200">
						<h3 class="font-semibold text-slate-900 mb-3">📁 任务分类</h3>
						<!-- 快速统计 -->
						<div class="space-y-2 text-sm">
							<div class="flex justify-between items-center p-2 bg-slate-50 rounded">
								<span class="text-slate-600">全部任务</span>
								<span class="font-medium text-slate-900">{{ todoStore.todos.length }}</span>
							</div>
							<div class="flex justify-between items-center p-2 bg-emerald-50 rounded">
								<span class="text-emerald-700">已完成</span>
								<span class="font-medium text-emerald-900">{{todoStore.todos.filter(t =>
									t.completed).length }}</span>
							</div>
							<div class="flex justify-between items-center p-2 bg-orange-50 rounded">
								<span class="text-orange-700">进行中</span>
								<span class="font-medium text-orange-900">{{todoStore.todos.filter(t =>
									!t.completed).length }}</span>
							</div>
						</div>
					</div>
					<!-- 导航菜单 -->
					<nav class="flex-1 p-4 space-y-1">
						<button @click="switchView('list')" :class="[
							'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
							activeView === 'list'
								? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
								: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
						]">
							📄 列表视图
						</button>
						<button @click="switchView('tree')" :class="[
							'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
							activeView === 'tree'
								? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
								: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
						]">
							🌳 树视图
						</button>
						<button @click="switchView('heap')" :class="[
							'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
							activeView === 'heap'
								? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
								: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
						]">
							🏔️ 堆视图
						</button>
						<hr class="my-4 border-slate-200">
						<button @click="switchView('trash')" :class="[
							'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
							activeView === 'trash'
								? 'bg-red-50 text-red-700 border-l-4 border-red-600'
								: 'text-slate-400 hover:bg-red-50 hover:text-red-600'
						]">
							🗑️ 回收站
						</button>
					</nav>
					<!-- AI分解区域 -->
					<div class="p-4 border-t border-slate-200">
						<button @click="handleBreakdownTask" :disabled="!selectedTaskId || isBreakingDown"
							class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-md hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
							<span v-if="isBreakingDown">⏳</span>
							<span>{{ isBreakingDown ? '分解中...' : 'AI 任务分解' }}</span>
						</button>
					</div>
				</aside>

				<!-- 小屏浮层侧栏（左侧滑出，机制与详情面板一致） -->
				<Transition enter-active-class="transition-all duration-300 ease-out"
					enter-from-class="-translate-x-full" enter-to-class="translate-x-0"
					leave-active-class="transition-all duration-200 ease-in" leave-from-class="translate-x-0"
					leave-to-class="-translate-x-full">
					<div v-if="showMobileSidebar"
						class="lg:hidden fixed top-0 left-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col z-50">
						<!-- 标题栏 -->
						<div class="flex items-center justify-between p-4 border-b border-slate-200">
							<h3 class="font-semibold text-slate-900">📁 任务分类</h3>
							<button @click="showMobileSidebar = false" class="p-2 rounded hover:bg-slate-100">
								<span class="text-lg">✖️</span>
							</button>
						</div>
						<!-- 侧栏主体内容（复用原侧栏内容） -->
						<div class="flex-1 overflow-y-auto">
							<!-- 快速统计 -->
							<div class="space-y-2 text-sm p-4">
								<div class="flex justify-between items-center p-2 bg-slate-50 rounded">
									<span class="text-slate-600">全部任务</span>
									<span class="font-medium text-slate-900">{{ todoStore.todos.length }}</span>
								</div>
								<div class="flex justify-between items-center p-2 bg-emerald-50 rounded">
									<span class="text-emerald-700">已完成</span>
									<span class="font-medium text-emerald-900">{{todoStore.todos.filter(t =>
										t.completed).length }}</span>
								</div>
								<div class="flex justify-between items-center p-2 bg-orange-50 rounded">
									<span class="text-orange-700">进行中</span>
									<span class="font-medium text-orange-900">{{todoStore.todos.filter(t =>
										!t.completed).length }}</span>
								</div>
							</div>
							<!-- 导航菜单 -->
							<nav class="p-4 space-y-1">
								<button @click="switchView('list'); showMobileSidebar = false" :class="[
									'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
									activeView === 'list'
										? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
										: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
								]">
									📄 列表视图
								</button>
								<button @click="switchView('tree'); showMobileSidebar = false" :class="[
									'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
									activeView === 'tree'
										? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
										: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
								]">
									🌳 树视图
								</button>
								<button @click="switchView('heap'); showMobileSidebar = false" :class="[
									'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
									activeView === 'heap'
										? 'bg-indigo-50 text-indigo-700 border-l-4 border-indigo-600'
										: 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
								]">
									🏔️ 堆视图
								</button>
								<hr class="my-4 border-slate-200">
								<button @click="switchView('trash'); showMobileSidebar = false" :class="[
									'w-full text-left px-3 py-2 rounded-lg text-sm font-medium transition-colors',
									activeView === 'trash'
										? 'bg-red-50 text-red-700 border-l-4 border-red-600'
										: 'text-slate-400 hover:bg-red-50 hover:text-red-600'
								]">
									🗑️ 回收站
								</button>
							</nav>
							<!-- AI分解区域 -->
							<div class="p-4 border-t border-slate-200">
								<button @click="handleBreakdownTask" :disabled="!selectedTaskId || isBreakingDown"
									class="w-full flex items-center justify-center gap-2 px-4 py-2 bg-emerald-500 text-white text-sm font-medium rounded-md hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors">
									<span v-if="isBreakingDown">⏳</span>
									<span>{{ isBreakingDown ? '分解中...' : 'AI 任务分解' }}</span>
								</button>
							</div>
						</div>
					</div>
				</Transition>

				<!-- 中栏：主要视图内容 -->
				<div class="flex-1 flex flex-col min-w-0" @click="onMainAreaClick">
					<!-- 消息提示区域 -->
					<Transition enter-active-class="transition ease-out duration-300"
						enter-from-class="opacity-0 -translate-y-2" enter-to-class="opacity-100 translate-y-0"
						leave-active-class="transition ease-in duration-200"
						leave-from-class="opacity-100 translate-y-0" leave-to-class="opacity 0 -translate-y-2">
						<div v-if="breakdownMessage" :class="[
							'mx-4 mt-4 mb-2 px-4 py-2.5 rounded-lg text-sm font-medium',
							{
								'bg-emerald-50 text-emerald-800 border border-emerald-200': breakdownMessageType === 'success',
								'bg-red-50 text-red-800 border border-red-200': breakdownMessageType === 'error'
							}
						]">
							{{ breakdownMessage }}
						</div>
					</Transition>

					<div class="flex-1 overflow-auto p-4" @click="onMainAreaClick">
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
							<TodoTree v-else :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
						</div>

						<!-- 堆视图 -->
						<div v-else-if="activeView === 'heap'">
							<div v-if="todoStore.loading" class="flex items-center justify-center h-96 text-slate-500">
								<div class="text-center">
									<p class="text-lg mb-2">⏳</p>
									<p class="text-sm">加载中...</p>
								</div>
							</div>
							<TodoHeap v-else :todos="todoStore.todos" :selected-task-id="selectedTaskId"
								@task-selected="handleTaskSelected" />
						</div>

						<!-- 回收站 -->
						<div v-else-if="activeView === 'trash'">
							<Trash :selected-task-id="selectedTaskId" @task-selected="handleTaskSelected" />
						</div>
					</div>
				</div>

				   <!-- 右栏：详情面板 -->
				   <!-- 大屏常驻，窄屏浮层 -->
				   <Transition enter-active-class="transition-all duration-300 ease-out"
					   enter-from-class="translate-x-full" enter-to-class="translate-x-0"
					   leave-active-class="transition-all duration-200 ease-in" leave-from-class="translate-x-0"
					   leave-to-class="translate-x-full">
					   <div v-if="selectedTaskId && showDetailPanel"
											 :class="[
												 // 小屏浮层
												 'absolute top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-white shadow-2xl flex flex-col z-20',
												 // 大屏常驻右栏
												 'lg:static lg:relative lg:flex lg:w-96 lg:max-w-none lg:shadow-none lg:border-l lg:border-slate-200 lg:z-10',
												 // 大屏显示
												 'lg:block'
											 ]">
						   <!-- 详情内容 -->
						   <div class="flex-1 overflow-hidden">
							   <TodoDetailEditor :todo-id="selectedTaskId" @close="showDetailPanel = false" />
						   </div>
					   </div>
				   </Transition>

				<!-- 窄屏：浮动按钮 -->
				<div v-if="selectedTaskId && !showDetailPanel" class="lg:hidden fixed bottom-6 right-6 z-40">
					<button @click="showDetailPanel = true"
						class="p-4 bg-indigo-600 text-white rounded-full shadow-lg hover:bg-indigo-700 transition-colors"
						title="显示详情面板">
						<span class="text-xl">📝</span>
					</button>
				</div>
			</div>
		</main>
	</div>
</template>

<script setup>
// 只在点击中栏空白区域时取消选中任务
const onMainAreaClick = (e) => {
	if (e.target === e.currentTarget) {
		clearTaskSelection();
	}
}
// 点击中栏空白区域时取消选中任务
const clearTaskSelection = () => {
	selectedTaskId.value = null
	showDetailPanel.value = false
}
// 移动端侧栏显示状态
const showMobileSidebar = ref(false)

// 切换左侧侧栏（大屏为折叠，窄屏为浮层）
const toggleLeftPanel = () => {
	if (window.innerWidth < 1024) {
		showMobileSidebar.value = true
	} else {
		leftPanelCollapsed.value = !leftPanelCollapsed.value
	}
}
import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '../stores/auth'
import { useTodoStore } from '../stores/todos'
import { useSyncQueueStore } from '../stores/syncQueue'
import { storeToRefs } from 'pinia'
import SyncStatusIndicator from '../components/SyncStatusIndicator.vue'
import TodoList from './todo/TodoList.vue'
import TodoTree from './todo/TodoTree.vue'
import TodoHeap from './todo/TodoHeap.vue'
import Trash from './todo/Trash.vue'
import TodoDetailEditor from '../components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '../utils/detailPanelContext'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()

// 获取同步队列状态
const { hasUnsyncedChanges } = storeToRefs(syncQueueStore)

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
const leftPanelCollapsed = ref(false)
const showDetailPanel = ref(false) // 右侧详情面板默认隐藏

const detailPanelRequested = ref(false)

const openDetailPanel = () => {
	detailPanelRequested.value = true
	showDetailPanel.value = true // 确保详情面板打开
}

provide(TODO_DETAIL_PANEL_CONTEXT, {
	openDetailPanel
})

// 页面离开警告处理
const handleBeforeUnload = (e) => {
	if (hasUnsyncedChanges.value) {
		e.preventDefault()
		e.returnValue = '有更改尚未保存到服务器，确定离开吗？'
		return e.returnValue
	}
}

onMounted(async () => {
	// 初始化认证
	if (authStore.session === null && !authStore.loading) {
		await authStore.initialize()
	}

	// 如果已登录，获取待办事项
	if (authStore.isAuthenticated) {
		await todoStore.fetchTodos()
		// 初始化 Realtime 订阅
		todoStore.setupRealtimeSubscription()
	}

	// 添加页面离开警告
	window.addEventListener('beforeunload', handleBeforeUnload)
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
	if (taskId === null) {
		// 取消选中任务
		selectedTaskId.value = null
		showDetailPanel.value = false
	} else if (selectedTaskId.value === taskId) {
		// 如果点击的是已选中的任务，切换详情面板显示状态
		showDetailPanel.value = !showDetailPanel.value
	} else {
		// 如果选择的是新任务，更新选中ID并自动显示详情面板
		selectedTaskId.value = taskId
		showDetailPanel.value = true
	}
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
	// 清理 Realtime 订阅
	todoStore.cleanupRealtimeSubscription()
	// 移除页面离开警告
	window.removeEventListener('beforeunload', handleBeforeUnload)
})
</script>
