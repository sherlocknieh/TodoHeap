// 路由管理

import { createRouter, createWebHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'
import Login from './pages/Login.vue'
import Home from './pages/Home.vue'
import Todo from './pages/Todo.vue'

const routes = [
  // 首页
  {
    path: '/',
    name: 'Landing',
    component: Home,
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 简洁高效的待办清单'
    }
  },
  // 登录页
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 登录/注册'
    }
  },
  // 应用页（需要认证） - 三视图切换
  {
    path: '/app',
    name: 'App',
    component: Todo,
    meta: { 
      requiresAuth: true,
      title: 'TodoHeap - 我的待办'
    }
  },
  // 设置页面（需要认证）
  {
    path: '/settings',
    name: 'Settings',
    component: () => import('./pages/work/Settings.vue'),
    meta: { 
      requiresAuth: true,
      title: 'TodoHeap - 设置'
    }
  },
  // 404 页面
  {
    path: '/:pathMatch(.*)*',
    name: 'NotFound',
    component: () => import('./pages/404.vue'),
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 页面未找到'
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// 路由守卫：检查认证状态和设置页面标题
router.beforeEach(async (to, from, next) => {
  const authStore = useAuthStore()
  
  // 如果 store 未初始化，先初始化（只在首次访问时执行）
  if (authStore.session === null && !authStore.loading) {
    await authStore.initialize()
  }

  const isAuthenticated = authStore.isAuthenticated

  if (to.meta.requiresAuth && !isAuthenticated) {
    // 需要认证但未登录，重定向到登录页
    next('/login')
  } else if (to.path === '/login' && isAuthenticated) {
    // 已登录但访问登录页，重定向到应用页
    next('/app')
  } else {
    // 其他情况，正常访问
    next()
  }
})

// 路由导航后：设置页面标题
router.afterEach((to) => {
  // 设置页面标题，如果没有定义则使用默认标题
  const title = to.meta.title || 'TodoHeap'
  document.title = title
})

export default router
