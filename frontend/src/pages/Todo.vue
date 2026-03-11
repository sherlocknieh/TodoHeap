<template>
	<!-- 主界面 -->
	<div class="h-screen bg-slate-50 flex flex-col">
		<!-- 顶栏 -->
		<header class="bg-white border-b border-slate-200 sticky top-0 z-40 shadow-sm">
			<!-- 顶栏布局容器 -->
			<div class="flex items-center justify-between h-16 gap-4 px-6">
				<!-- 左侧标题 -->
				<div class="flex items-center gap-3">
					<!-- 侧栏切换按钮 -->
					<button @click="toggleLeftPanel"
						class="flex items-center justify-center w-10 h-10 rounded-md border border-slate-200 bg-white shadow hover:bg-slate-100 transition"
						title="切换侧栏">
						<svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
							<rect x="4" y="6" width="16" height="2" rx="1" fill="#6366F1" />
							<rect x="4" y="11" width="16" height="2" rx="1" fill="#6366F1" />
							<rect x="4" y="16" width="16" height="2" rx="1" fill="#6366F1" />
						</svg>
					</button>
					<h1 class="text-xl sm:text-2xl font-bold text-slate-900">TodoHeap</h1>
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
		<main class="flex-1 overflow-hidden bg-slate-50 relative">
			<div class="h-full flex relative">
				<!-- 左栏：任务导航面板（统一在 LeftSidebar 内部处理移动/桌面渲染与动画） -->
				<LeftSidebar :show="showLeftSidebar" :active-view="activeView" :selected-task-id="selectedTaskId"
					:is-breaking-down="isBreakingDown"
					@close="() => { showLeftSidebar = false; showMobileSidebar = false }" @switch-view="switchView"
					@create-task="createNewTask" @breakdown-task="handleBreakdownTask" />

				<!-- 中栏：主要视图内容 -->
				<div class="flex-1 flex flex-col min-w-0" @click="onMainAreaClick">
					<!-- AI 分解状态区域 -->
					<div class="mx-4 mt-4 mb-2">
						<BreakdownStatusCard :is-processing="isBreakingDown" :message="breakdownMessage"
							:status="breakdownMessageType" :task-count="breakdownProgress.count"
							:tasks="breakdownProgress.tasks" @confirm="handleConfirmTasks"
							@cancel="handleCancelTasks" />
					</div>

					<div class="flex-1 overflow-auto p-4" @click="onMainAreaClick">
						<div v-if="showViewLoading" class="flex items-center justify-center h-96 text-slate-500">
							<div class="text-center">
								<p class="text-lg mb-2">⏳</p>
								<p class="text-sm">加载中...</p>
							</div>
						</div>
						<router-view v-else v-slot="{ Component }">
							<component :is="Component" v-bind="viewProps" :selected-task-id="selectedTaskId"
								@task-selected="handleTaskSelected" />
						</router-view>
					</div>
				</div>

				<!-- 右栏：详情面板 -->
				<TodoDetailEditor :todo-id="selectedTaskId" :show="showDetailPanel" @close="closeDetailPanel" />
			</div>
		</main>
	</div>
</template>

<script setup>
// 切换左栏显示状态
const toggleLeftPanel = () => {
	if (window.innerWidth >= 1024) {
		// 大屏模式下切换左栏折叠状态
		leftPanelCollapsed.value = !leftPanelCollapsed.value
		showLeftSidebar.value = !leftPanelCollapsed.value
	} else {
		// 小屏模式下切换移动端侧栏
		showMobileSidebar.value = !showMobileSidebar.value
		showLeftSidebar.value = showMobileSidebar.value
	}
}

// 点击中栏区域时关闭详情面板（如果点击的不是任务项）
const onMainAreaClick = (e) => {
	// 检查是否点击了任务项（带有 data-task-item 属性的元素）
	const clickedTaskItem = e.target.closest('[data-task-item]')
	// 检查是否点击了详情面板
	const clickedDetailPanel = e.target.closest('[data-detail-panel]')

	// 如果没有点击任务项也没有点击详情面板，则关闭详情面板
	if (!clickedTaskItem && !clickedDetailPanel) {
		closeDetailPanel()
		selectedTaskId.value = null
	}
}



import { ref, onMounted, computed, watch, onUnmounted, provide } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useSyncQueueStore } from '@/stores/syncQueue'
import { useSettingsStore } from '@/stores/settings'
import { storeToRefs } from 'pinia'
import SyncStatusIndicator from '@/components/SyncStatusIndicator.vue'
import LeftSidebar from '@/components/LeftSidebar.vue'
import BreakdownStatusCard from '@/components/BreakdownStatusCard.vue'
import TodoDetailEditor from '@/components/TodoDetailEditor.vue'
import { TODO_DETAIL_PANEL_CONTEXT } from '@/utils/detailPanelContext'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const syncQueueStore = useSyncQueueStore()
const settingsStore = useSettingsStore()

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
const breakdownProgress = ref({ count: 0, tasks: [] }) // 分解进度
const pendingTasks = ref([]) // 待确认的任务列表（用于预览模式）
const leftPanelCollapsed = ref(false)
const showDetailPanel = ref(false) // 窄屏下默认不显示详情面板
const showLeftSidebar = ref(false) // 侧栏显示状态
const showMobileSidebar = ref(false) // 移动端侧栏显示状态

const showViewLoading = computed(() => {
	return (activeView.value === 'tree' || activeView.value === 'heap') && todoStore.loading
})

const viewProps = computed(() => {
	return activeView.value === 'heap' ? { todos: todoStore.todos } : {}
})

const detailPanelRequested = ref(false)

// 窗口大小响应式处理
const windowWidth = ref(window.innerWidth)

const updateWindowWidth = () => {
	windowWidth.value = window.innerWidth
	// 当窗口从窄屏变为宽屏时，自动显示详情面板和侧栏
	if (windowWidth.value >= 1024) {
		showDetailPanel.value = true
		showLeftSidebar.value = true
		showMobileSidebar.value = false
	}
	// 当窗口从宽屏变为窄屏时，如果没有选中任务，隐藏详情面板和侧栏
	if (windowWidth.value < 1024) {
		if (!selectedTaskId.value) showDetailPanel.value = false
		showLeftSidebar.value = false
	}
}

const handleSelectedIdReplaced = (event) => {
	const { tempId, realId } = event.detail || {}
	if (tempId == null || realId == null) return

	if (selectedTaskId.value == tempId) {
		selectedTaskId.value = realId
	}
}

const openDetailPanel = () => {
	detailPanelRequested.value = true
	showDetailPanel.value = true // 确保详情面板打开
}

// 关闭详情面板（大屏/小屏通用）
const closeDetailPanel = () => {
	showDetailPanel.value = false
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
	// 确保认证初始化完成
	await authStore.initAuth()
	
	// 如果已登录，获取待办事项
	if (authStore.isAuthenticated) {
		await todoStore.fetchTodos()
		// 初始化 Realtime 订阅
		todoStore.setupRealtimeSubscription()
	}
	// 添加事件监听器
	document.addEventListener('click', handleClickOutside)
	window.addEventListener('beforeunload', handleBeforeUnload)
	window.addEventListener('resize', updateWindowWidth)
	window.addEventListener('sync:id-replaced', handleSelectedIdReplaced)
	// 初始化窗口宽度
	updateWindowWidth()
	// 初始化侧栏显示（大屏默认显示，窄屏默认隐藏）
	showLeftSidebar.value = window.innerWidth >= 1024
})

// 监听路由变化，确保数据总是最新的
watch(
	() => route.name,
	async (newRouteName) => {
		// 检查是否是 Todo 相关页面（包括子路由）
		const isTodoPage = newRouteName && (
			newRouteName === 'app' || 
			newRouteName === 'App' || 
			String(newRouteName).includes('View')
		)
		
		if (authStore.isAuthenticated && isTodoPage) {
			// 确保数据已经获取过
			if (!todoStore.isFetched && !todoStore.loading) {
				await todoStore.fetchTodos()
			}
		}
	},
	{ immediate: true } // 立即执行一次，确保首次进入页面也会触发
)

const handleSignOut = async () => {
	const result = await authStore.signOut()
	router.push({ name: 'login' })
}

const openSettings = () => {
	router.push({ name: 'settings' })
	showUserMenu.value = false
}

const switchView = (view) => {
	activeView.value = view
}

const handleTaskSelected = (taskId) => {
	if (taskId === null) {
		// 取消选中任务
		closeDetailPanel()
		selectedTaskId.value = null
	} else if (selectedTaskId.value === taskId) {
		// 如果点击的是已选中的任务，不做任何操作（保持详情面板打开）
		// 这样可以避免在编辑时误触导致面板关闭
	} else {
		// 如果选择的是新任务，更新选中ID并自动显示详情面板
		selectedTaskId.value = taskId
		showDetailPanel.value = true
	}
	console.log('选中任务ID:', taskId)
}

// 创建新任务
const createNewTask = async () => {
	try {
		const result = await todoStore.addTodo('新任务', {
			description: '',
			completed: false
		})
		if (result) {
			// 选中新创建的任务
			selectedTaskId.value = result.id
			showDetailPanel.value = true
		}
	} catch (error) {
		console.error('创建任务失败:', error)
	}
}

const handleBreakdownTask = async () => {
	if (!selectedTaskId.value) {
		showBreakdownMessage('请先选择一个任务', 'error')
		return
	}

	isBreakingDown.value = true
	breakdownMessage.value = ''
	breakdownMessageType.value = ''
	breakdownProgress.value = { count: 0, tasks: [] }
	pendingTasks.value = []

	try {
		const query = '继续分解'
		const autoApply = settingsStore.autoApplyAITasks

		// 使用流式接收，每收到一个子任务就更新进度
		const onTaskReceived = ({ task, index, totalSoFar }) => {
			breakdownProgress.value.count = totalSoFar
			breakdownProgress.value.tasks.push(task)
		}

		const result = await todoStore.invokeBreakdown(
			todoStore.treeNodes,
			selectedTaskId.value,
			query,
			onTaskReceived,
			autoApply
		)

		if (result.success) {
			if (autoApply) {
				// 自动应用模式：显示成功消息
				showBreakdownMessage(`成功添加 ${result.addedCount} 个子任务`, 'success')
			} else {
				// 预览模式：保存待确认的任务，显示确认界面
				pendingTasks.value = result.pendingTasks || []
				breakdownMessageType.value = 'pending'
				// 不清空进度，保持显示任务列表供用户确认
			}
		} else {
			showBreakdownMessage(`任务分解失败: ${result.error}`, 'error')
		}
	} finally {
		isBreakingDown.value = false
		// 只有在非预览模式下才清空进度
		if (settingsStore.autoApplyAITasks) {
			setTimeout(() => {
				breakdownProgress.value = { count: 0, tasks: [] }
			}, 300)
		}
	}
}

// 确认保存待确认的任务
const handleConfirmTasks = async () => {
	if (pendingTasks.value.length === 0) return

	const result = await todoStore.applyPendingTasks(pendingTasks.value)

	if (result.success) {
		showBreakdownMessage(`成功添加 ${result.addedCount} 个子任务`, 'success')
	} else {
		showBreakdownMessage('保存任务失败', 'error')
	}

	// 清空状态
	pendingTasks.value = []
	breakdownProgress.value = { count: 0, tasks: [] }
}

// 取消待确认的任务
const handleCancelTasks = () => {
	pendingTasks.value = []
	breakdownProgress.value = { count: 0, tasks: [] }
	breakdownMessage.value = ''
	breakdownMessageType.value = ''
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

onUnmounted(() => {
	document.removeEventListener('click', handleClickOutside)
	// 移除窗口大小变化监听
	window.removeEventListener('resize', updateWindowWidth)
	// 清理 Realtime 订阅
	todoStore.cleanupRealtimeSubscription()
	// 移除页面离开警告
	window.removeEventListener('beforeunload', handleBeforeUnload)
	window.removeEventListener('sync:id-replaced', handleSelectedIdReplaced)
})
</script>

<style scoped>
/* 无需额外样式，状态卡片样式已移至 BreakdownStatusCard 组件 */
</style>
