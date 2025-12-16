import { useAuthStore } from '../stores/auth'


// 路由守卫

export function setupGuards(router) {
  // 路由导航前：检查认证状态
  router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore()
    console.debug('[router] navigating to', to.fullPath, 'matched:', to.matched.map(r => r.name))
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
    const title = to.meta.title || 'TodoHeap'
    document.title = title
  })
}
