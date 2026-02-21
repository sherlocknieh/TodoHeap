import type { RouteRecordRaw } from 'vue-router'

// 路由配置
const routes: Array<RouteRecordRaw> = [
  // 首页
  {
    path: '/',
    name: 'Landing',
    component: () => import('@/pages/Home.vue'),
    meta: { requiresAuth: false, title: 'TodoHeap - 任务堆' }
  },
  // 登录页
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/Login.vue'),
    meta: { requiresAuth: false, title: 'TodoHeap - 登录/注册' }
  },
  // 应用页
  {
    path: '/app',
    component: () => import('@/pages/Todo.vue'),
    meta: { requiresAuth: true, title: 'TodoHeap - 我的清单' },
    children: [
      { path: '', name: 'App', redirect: '/app/list', meta: { title: 'TodoHeap - 我的清单' } },
      { path: 'list', name: 'ListView', component: () => import('@/pages/todo/TodoList.vue'), meta: { title: 'TodoHeap - 列表视图' } },
      { path: 'tree', name: 'TreeView', component: () => import('@/pages/todo/TodoTree.vue'), meta: { title: 'TodoHeap - 树视图' } },
      { path: 'heap', name: 'HeapView', component: () => import('@/pages/todo/TodoHeap.vue'), meta: { title: 'TodoHeap - 堆视图' } },
      { path: 'trash', name: 'TrashView', component: () => import('@/pages/todo/Trash.vue'), meta: { title: 'TodoHeap - 垃圾箱' } }
    ]
  },
  // 设置页
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('@/pages/todo/Settings.vue'),
    meta: { requiresAuth: true, title: 'TodoHeap - 设置' }
  },
  // OAuth 回调页
  {
    path: '/auth/callback',
    name: 'AuthCallback',
    component: () => import('@/pages/AuthCallback.vue'),
    meta: { requiresAuth: false, title: 'TodoHeap - 授权中' }
  },
  // 404 页
  {
    path: '/:pathMatch(.*)*', // 除上述之外的所有路径
    name: 'NotFound',
    component: () => import('@/pages/404.vue'),
    meta: { requiresAuth: false, title: 'TodoHeap - 页面未找到' }
  }
]

export default routes