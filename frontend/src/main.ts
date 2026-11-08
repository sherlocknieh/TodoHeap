import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { handleAuthCallback } from '@/utils/handleAuthCallback'
import { handleDidaCallback } from '@/lib/didaMcp'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)


// --- 处理认证回调 URL --
await handleAuthCallback() // 处理认证回调URL

// --- 处理滴答清单授权回跳：换取令牌后进入导入页 --
const didaConnected = await handleDidaCallback()


app.use(router)

app.mount('#app')

// 授权刚完成时直接落到「设置 → 导入数据」，省去用户再找入口
if (didaConnected) {
  router.replace({ name: 'settings', query: { tab: 'import' } })
}
