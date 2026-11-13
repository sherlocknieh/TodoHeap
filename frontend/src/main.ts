import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './style.css'
import { handleAuthCallback } from '@/utils/handleAuthCallback'
import { handleDidaCallback } from '@/lib/didaMcp'
import { readPendingPreset } from '@/lib/mcpServers'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)


// --- 处理认证回调 URL --
await handleAuthCallback() // 处理认证回调URL

// --- 处理滴答清单授权回跳：换取令牌后进入导入页 --
const didaConnected = await handleDidaCallback()
// 从 MCP 服务一键添加发起的授权：回跳后留在 AI 视图，由侧栏续上这条服务
const pendingPreset = readPendingPreset()


app.use(router)

app.mount('#app')

// 授权刚完成时直接落到对应入口，省去用户再找一次
if (didaConnected && pendingPreset) {
  router.replace({ name: 'AIView' })
} else if (didaConnected) {
  router.replace({ name: 'settings', query: { tab: 'import' } })
}
