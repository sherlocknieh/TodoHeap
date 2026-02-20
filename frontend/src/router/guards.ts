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

    if (!authStore.initialized) {
      try {
        await authStore.initialize()
      } catch (error) {
        console.error('认证初始化失败:', error)
      }
    }

    const isAuthenticated = authStore.isAuthenticated

    if (to.meta.requiresAuth && !isAuthenticated) {
      next({ name: 'Login', query: { redirect: to.fullPath } })
      return
    }

    if (to.name === 'Login' && isAuthenticated) {
      next({ name: 'App' })
      return
    }

    next()
  })

  router.afterEach((to) => {
    const title = (to.meta && (to.meta as any).title) || 'TodoHeap'
    document.title = title
  })

  guardsSetup = true
}
