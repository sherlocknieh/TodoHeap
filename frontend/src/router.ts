import { createRouter, createWebHashHistory } from 'vue-router'
import routes from './router/routes'
import { setupGuards } from './router/guards'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes
})

setupGuards(router)

export default router
