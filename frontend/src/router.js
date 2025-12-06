import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from './stores/auth'

const routes = [
  // 首页
  {
    path: '/',
    name: 'Landing',
    component: () => import('./pages/Home.vue'),
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 简洁高效的待办清单'
    }
  },
  // 登录页
  {
    path: '/login',
    name: 'Login',
    component: () => import('./pages/Login.vue'),
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 登录/注册'
    }
  },
  // 应用页（需要认证） - 三视图切换
  {
    path: '/app',
    name: 'App',
    component: () => import('./pages/Todo.vue'),
    meta: { 
      requiresAuth: true,
      title: 'TodoHeap - 我的清单'
    },
    children: [
      {
        path: '',
        redirect: '/app/list'
      },
      {
        path: 'list',
        name: 'ListView',
        component: () => import('./pages/Todo.vue'),
        meta: { 
          requiresAuth: true,
          title: 'TodoHeap - 列表视图'
        }
      },
      {
        path: 'tree',
        name: 'TreeView',
        component: () => import('./pages/Todo.vue'),
        meta: { 
          requiresAuth: true,
          title: 'TodoHeap - 树视图'
        }
      },
      {
        path: 'heap',
        name: 'HeapView',
        component: () => import('./pages/Todo.vue'),
        meta: { 
          requiresAuth: true,
          title: 'TodoHeap - 堆视图'
        }
      }
    ]
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
  history: createWebHashHistory(import.meta.env.BASE_URL),
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

  // 需要认证但未登录，重定向到登录页
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
    return
  }

  // 已登录用户访问登录页，重定向到应用页
  if (to.path === '/login' && isAuthenticated) {
    next('/app')
    return
  }

  // 其他情况，正常访问
  next()
})

// 路由导航后：设置页面标题
router.afterEach((to) => {
  // 设置页面标题，如果没有定义则使用默认标题
  const title = to.meta.title || 'TodoHeap'
  document.title = title
})

export default router
