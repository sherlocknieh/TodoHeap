import { createRouter, createWebHistory } from 'vue-router'
import Login from './pages/Login.vue'
import Home from './pages/Home.vue'
import { supabase } from './supabase'

const routes = [
  {
    path: '/',
    name: 'Landing',
    component: Home,
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 简洁高效的待办清单'
    }
  },
  {
    path: '/login',
    name: 'Login',
    component: Login,
    meta: { 
      requiresAuth: false,
      title: 'TodoHeap - 登录/注册'
    }
  },
  {
    path: '/app',
    name: 'App',
    component: Home,
    meta: { 
      requiresAuth: true,
      title: 'TodoHeap - 我的待办'
    }
  }
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes
})

// 路由守卫：检查认证状态和设置页面标题
router.beforeEach(async (to, from, next) => {
  const { data } = await supabase.auth.getSession()
  const session = data.session

  if (to.meta.requiresAuth && !session) {
    // 需要认证但未登录，重定向到登录页
    next('/login')
  } else if (to.path === '/login' && session) {
    // 已登录但访问登录页，重定向到应用页
    next('/app')
  } else {
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
