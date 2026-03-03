import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { handleAuthCallback } from '@/utils/handleAuthCallback'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)


// --- 处理认证回调 URL --
await handleAuthCallback() // 处理认证回调URL


app.use(router)

app.mount('#app')
