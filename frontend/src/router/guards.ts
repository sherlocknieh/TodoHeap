import type { Router } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

let guardsSetup = false

export function setupGuards(router: Router) {
  if (guardsSetup) {
    console.warn('[guards] setupGuards 已经被调用，忽略重复调用')
    return
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('auth:signedOut', () => {
      const current = router.currentRoute.value
      if (current?.meta?.requiresAuth) {
        router.replace({ name: 'Login', query: { redirect: current.fullPath } })
      }
    })
  }

  router.beforeEach(async (to, _from, next) => {
    const authStore = useAuthStore()

    // 获取认证状态
    if (!authStore.initialized) {
      try {
        await authStore.initialize()
      } catch (error) {
        console.error('认证初始化失败:', error)
      }
    }
    const isAuthenticated = authStore.isAuthenticated
    // 如果目标路由需要认证但用户未认证，重定向到登录页
    if (to.meta.requiresAuth && !isAuthenticated) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }
    // 如果用户已认证但访问登录页，重定向到应用主页
    if (to.name === 'Login' && isAuthenticated) {
      next({ name: 'App' })
      return
    }
    // 其他情况正常导航
    next()
  })

  router.afterEach((to) => {
    const title = (to.meta && (to.meta as any).title) || 'TodoHeap'
    document.title = title
  })

  guardsSetup = true
}
