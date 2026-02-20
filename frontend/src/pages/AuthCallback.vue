<template>
  <div class="min-h-screen flex items-center justify-center bg-linear-to-br from-indigo-400 to-purple-500 dark:from-gray-900 dark:to-gray-800">
    <div class="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-2xl p-8 text-center">
      <div class="text-5xl mb-4">🔄</div>
      <h1 class="text-2xl font-bold text-indigo-600 dark:text-indigo-400 mb-2">授权处理中</h1>
      <p class="text-gray-600 dark:text-gray-400 mb-6">{{ statusMessage }}</p>
      
      <div v-if="loading" class="flex justify-center">
        <div class="animate-spin w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full"></div>
      </div>
      
      <div v-if="error" class="mt-4 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-300 border border-red-200 dark:border-red-700">
        <p>{{ error }}</p>
      </div>
      
      <div v-if="!loading && !error" class="mt-6">
        <button 
          @click="goToApp" 
          class="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
        >
          进入应用
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { supabase } from '@/api/supabase'

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()

const loading = ref(true)
const error = ref('')
const statusMessage = ref('正在处理授权信息...')

onMounted(async () => {
  try {
    statusMessage.value = '正在验证授权信息...'
    
    // 等待一小段时间，确保Supabase已经处理了URL中的令牌
    await new Promise(resolve => setTimeout(resolve, 500))
    
    // 获取当前会话（Supabase会自动从URL中提取令牌）
    const { data, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError) {
      throw sessionError
    }
    
    if (!data.session) {
      // 处理包含两个#的URL格式：/#/auth/callback#access_token=...
      let hashFragment = window.location.hash
      
      // 如果URL包含路由哈希和OAuth哈希，我们需要提取OAuth部分
      if (hashFragment.includes('#/auth/callback#')) {
        hashFragment = hashFragment.split('#/auth/callback#')[1] || ''
      } else if (hashFragment.startsWith('#')) {
        hashFragment = hashFragment.substring(1)
      }
      
      const hashParams = new URLSearchParams(hashFragment)
      const accessToken = hashParams.get('access_token')
      const error = hashParams.get('error')
      
      if (error) {
        throw new Error(`授权失败: ${error}`)
      }
      
      if (!accessToken) {
        throw new Error('未找到授权令牌')
      }
      
      // 使用获取到的令牌设置会话
      const { data: sessionData, error: setError } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: hashParams.get('refresh_token')
      })
      
      if (setError) {
        throw setError
      }
      
      // 更新认证状态
      authStore.session = sessionData.session
    } else {
      // 更新认证状态
      authStore.session = data.session
    }
    
    statusMessage.value = '授权成功！正在跳转...'
    
    // 短暂延迟后跳转到应用
    setTimeout(() => {
      goToApp()
    }, 1000)
    
  } catch (err) {
    console.error('OAuth回调处理错误:', err)
    console.error('当前URL:', window.location.href)
    error.value = err.message || '授权处理失败，请重试'
    statusMessage.value = '授权处理失败'
  } finally {
    loading.value = false
  }
})

const goToApp = () => {
  // 检查是否有重定向路径
  const redirect = route.query.redirect || '/app'
  router.push(redirect)
}
</script>