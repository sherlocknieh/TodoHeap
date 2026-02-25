import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { useAuthStore } from '@/stores/auth'
import { handleAuthCallback } from '@/utils/handleAuthCallback'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)


// --- 处理认证回调 URL --
const {initialize} = useAuthStore()
await initialize() // 确保认证状态已初始化
await handleAuthCallback() // 处理认证回调URL


app.use(router)

app.mount('#app')
