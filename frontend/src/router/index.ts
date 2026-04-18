import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

// 路由配置
const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    // 首页
    {
      path: '/',
      name: 'home',
      component: () => import('@/pages/Home.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap - 任务堆' }
    },
    // 登录页
    {
      path: '/login',
      name: 'login',
      component: () => import('@/pages/Login.vue'),
      meta: { requiresAuth: false, title: 'TodoHeap - 登录/注册' }
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
        { path: 'tree', name: 'TreeView', component: () => import('@/pages/todo/TodoTree.vue'), meta: { title: 'TodoHeap - 树视图' } },
        { path: 'heap', name: 'HeapView', component: () => import('@/pages/todo/TodoHeap.vue'), meta: { title: 'TodoHeap - 堆视图' } },
        { path: 'trash', name: 'TrashView', component: () => import('@/pages/todo/Trash.vue'), meta: { title: 'TodoHeap - 垃圾箱' } },
        { path: 'settings', name: 'settings', component: () => import('@/pages/todo/Settings.vue'), meta: { title: 'TodoHeap - 设置' } }
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
  // 如果用户已认证但访问登录页，重定向到应用主页
  if ((to.name === 'login' || to.name === 'home') && auth.isAuthenticated) {
    return { name: 'app' }
  }
  return;
})

router.afterEach((to) => {
  const title = (to.meta && (to.meta as any).title) || 'TodoHeap'
  document.title = title
})

export default router
