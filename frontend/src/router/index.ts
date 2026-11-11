import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { settingsPanelOpen } from '@/utils/settingsPanel'

// 路由配置
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 首页
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/Home.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap · 把模糊的任务排进日程' }
    },
    // 登录页
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/Login.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap - 登录/注册' }
    },
    {
      path: '/reset-password',
      name: 'reset-password',
      component: () => import('@/pages/ResetPassword.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap - 重置密码' }
    },
    // 设置页
    {
      path: '/settings',
      name: 'settings',
      component: () => import('@/pages/todo/Settings.vue'),
      meta: { requiresAuth: true, title: 'TodoHeap - 设置' }
    },
    // 应用页
    {
      component: () => import('@/pages/Todo.vue'),
      meta: { requiresAuth: true, title: 'TodoHeap - 我的清单' },
      path: '/app',
      name: 'app',
      redirect: '/app/list', // 默认子路由
      children: [
        { path: 'list', name: 'ListView', component: () => import('@/pages/todo/TodoList.vue'), meta: { title: 'TodoHeap - 列表视图' } },
        { path: 'graph', name: 'GraphView', component: () => import('@/pages/todo/TodoGraph.vue'), meta: { title: 'TodoHeap - 图视图' } },
        // 旧书签与外部链接仍指向 tree，统一转到图视图
        { path: 'tree', redirect: '/app/graph' },
        { path: 'heap', name: 'HeapView', component: () => import('@/pages/todo/TodoHeap.vue'), meta: { title: 'TodoHeap - 堆视图' } },
        { path: 'ai', name: 'AIView', component: () => import('@/pages/todo/AIView.vue'), meta: { title: 'TodoHeap - AI' } },
        { path: 'schedule', name: 'ScheduleView', component: () => import('@/pages/todo/ScheduleView.vue'), meta: { title: 'TodoHeap - 日程' } },
        { path: 'trash', name: 'TrashView', component: () => import('@/pages/todo/Trash.vue'), meta: { title: 'TodoHeap - 垃圾箱' } }
      ]
    },
    // 404 页
    {
      path: '/:pathMatch(.*)*', // 除上述之外的所有路径
      name: '404',
      component: () => import('@/pages/404.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap - 页面未找到' }
    }
  ]
})

router.beforeEach(async (to, _from) => {
  // 获取认证状态
  const auth = useAuthStore()
  await auth.initAuth()
  // 如果目标路由需要认证但用户未认证，重定向到登录页
  if (to.meta.requiresAuth && !auth.isAuthenticated) {
    return { name: 'login', query: { redirect: to.fullPath } }
  }
  // 已登录用户访问登录页时直接进入应用；主页保持可访问，便于回顾功能介绍
  if (to.name === 'login' && auth.isAuthenticated) {
    return { name: 'app' }
  }
  return;
})

router.afterEach((to) => {
  const title = (to.meta && (to.meta as any).title) || 'TodoHeap'
  document.title = title
  // 设置浮窗只在应用页出现，导航到其它页面时收起
  if (!String(to.path).startsWith('/app')) {
    settingsPanelOpen.value = false
  }
})

export default router
