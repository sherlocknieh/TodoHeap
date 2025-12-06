import { createApp } from 'vue'
import { createPinia } from 'pinia'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)

app.mount('#app')

// 路由准备完毕后，处理 GitHub Pages 的重定向
// 延迟到应用挂载和首次路由导航完成之后
router.isReady().then(() => {
  const redirect = sessionStorage.getItem('redirect')
  if (redirect) {
    sessionStorage.removeItem('redirect')
    router.replace(redirect)
  }
})
