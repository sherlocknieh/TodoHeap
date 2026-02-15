<template>
  <!-- 产品主页 -->
  <div class="min-h-screen bg-gray-50 dark:bg-gray-950 text-gray-900 dark:text-gray-100 flex flex-col transition-colors duration-300">

    <!-- 导航栏 -->
    <nav class="sticky top-0 z-50 bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm border-b border-gray-200 dark:border-gray-800 transition-colors duration-300">
      <!-- 内容居中与限制宽度 -->
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <!-- 内容布局管理 -->
        <div class="flex justify-between items-center h-16">
          <!-- 左侧内容 -->
          <div class="flex items-center gap-3 group cursor-pointer min-w-0">
            <h1 class="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white tracking-tight truncate max-w-35 sm:max-w-none">
              TodoHeap 任务堆
            </h1>
          </div>
          <!-- 右侧内容 -->
          <div class="flex items-center gap-3 sm:gap-6 shrink-0">
            <!-- 文档链接 -->
            <a href="/TodoHeap/docs" class="hidden sm:inline text-gray-600 dark:text-gray-300 font-medium hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors duration-300">
              📄在线文档
            </a>
            <!-- 登录按钮 -->
            <button @click="openLogin"
              class="px-3 sm:px-5 py-2 bg-indigo-600 text-white font-semibold rounded-lg hover:bg-indigo-700 transition-all duration-300 shadow-md hover:shadow-lg transform hover:-translate-y-0.5 whitespace-nowrap">
              登录 / 注册
            </button>
          </div>
        </div>
      </div>
    </nav>

    <!-- 宣传语 -->
    <section class="flex-1 flex items-center justify-center relative z-10 py-20">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-2 gap-12 items-center">
          <!-- 文字内容 -->
          <div class="space-y-8 animate-fadeInLeft">
            <div>
              <h2 class="text-5xl md:text-6xl font-extrabold leading-tight mb-6 text-gray-900 dark:text-white">
                AI 驱动的 <br/>
                <span class="text-indigo-600 dark:text-indigo-400">智能任务管理</span>
              </h2>
            </div>
            <p class="text-lg md:text-xl text-gray-600 dark:text-gray-300 leading-relaxed max-w-2xl">
              TodoHeap 用 AI 自动分解大任务，用堆结构智能排序，让你始终知道下一步该做什么，告别选择困难。
            </p>
            <div class="flex gap-4">
              <button @click="openLogin"
                class="px-8 py-3.5 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 shadow-lg hover:shadow-indigo-500/30 transition-all duration-300 text-lg transform hover:-translate-y-1">
                立即开始
              </button>
              <button @click="scrollToFeatures"
                class="px-8 py-3.5 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-200 font-bold rounded-xl border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-300 text-lg">
                了解更多
              </button>
            </div>
          </div>

          <!-- Hero 图片/动画 -->
          <div class="text-center animate-fadeInRight">
            <div class="relative h-96 flex items-center justify-center">
              <div class="absolute inset-0 bg-linear-to-tr from-indigo-100 to-purple-100 dark:from-indigo-900/30 dark:to-purple-900/30 rounded-3xl transform rotate-3"></div>
              <div class="relative bg-white dark:bg-gray-800 p-8 rounded-2xl shadow-2xl border border-gray-100 dark:border-gray-700 max-w-sm w-full mx-auto transform -rotate-2 hover:rotate-0 transition-transform duration-500">
                 <!-- 模拟 UI -->
                 <div class="space-y-4">
                    <div class="h-4 bg-gray-100 dark:bg-gray-700 rounded w-3/4"></div>
                    <div class="space-y-2">
                        <div class="flex items-center gap-3 p-3 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg border border-indigo-100 dark:border-indigo-800/30">
                            <div class="w-5 h-5 rounded-full border-2 border-indigo-500"></div>
                            <div class="h-3 bg-indigo-200 dark:bg-indigo-800 rounded w-1/2"></div>
                        </div>
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                            <div class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600"></div>
                            <div class="h-3 bg-gray-200 dark:bg-gray-600 rounded w-2/3"></div>
                        </div>
                        <div class="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg">
                            <div class="w-5 h-5 rounded-full border-2 border-gray-300 dark:border-gray-600"></div>
                            <div class="h-3 bg-gray-200 dark:bg-gray-600 rounded w-1/3"></div>
                        </div>
                    </div>
                 </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- 功能特色 -->
    <section id="features" class="bg-white dark:bg-gray-900 py-24 border-y border-gray-100 dark:border-gray-800 relative z-10 transition-colors duration-300">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="text-center mb-20 animate-fadeInUp">
          <h2 class="text-4xl font-bold text-gray-900 dark:text-white mb-6">
            功能特色
          </h2>
          <p class="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            超越传统待办清单，AI 赋能让任务管理更智能、更轻松
          </p>
        </div>

        <div class="grid md:grid-cols-3 gap-8">
          <!-- 特色卡片 1 -->
          <div
            class="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all duration-300 group">
            <div class="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-300">🤖</div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">AI 自动分解</h3>
            <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
              把大任务自动分解细化为能快速完成的小任务，减轻任务管理压力，每一步都清晰可行
            </p>
          </div>

          <!-- 特色卡片 2 -->
          <div
            class="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all duration-300 group">
            <div class="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-300">🎯</div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">智能优先级</h3>
            <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
              以堆结构智能排序任务，最优先的任务始终在顶端，省去在多个平等任务中做选择的精力
            </p>
          </div>

          <!-- 特色卡片 3 -->
          <div
            class="bg-gray-50 dark:bg-gray-800 rounded-2xl p-8 shadow-sm hover:shadow-xl border border-gray-100 dark:border-gray-700 transition-all duration-300 group">
            <div class="text-5xl mb-6 transform group-hover:scale-110 transition-transform duration-300">✨</div>
            <h3 class="text-xl font-bold text-gray-900 dark:text-white mb-3">简洁高效</h3>
            <p class="text-gray-600 dark:text-gray-400 leading-relaxed">
              清爽简约的界面设计，云端安全存储，跨设备无缝同步，让你专注于完成任务
            </p>
          </div>
        </div>
      </div>
    </section>

    <!-- 页脚 -->
    <footer class="bg-gray-50 dark:bg-gray-950 border-t border-gray-200 dark:border-gray-800 py-12 relative z-10 transition-colors duration-300">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div class="grid md:grid-cols-3 gap-12 mb-8">
          <!-- 品牌信息 -->
          <div>
            <div class="flex items-center gap-2 mb-4">
              <span class="text-2xl">📝</span>
              <h3 class="text-xl font-bold text-gray-900 dark:text-white">TodoHeap</h3>
            </div>
            <p class="text-gray-600 dark:text-gray-400 text-sm leading-relaxed">
              AI 驱动的智能任务管理，让你始终知道下一步该做什么。
            </p>
          </div>

          <!-- 快速链接 -->
          <div>
            <h4 class="text-gray-900 dark:text-white font-semibold mb-4">产品</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#features" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">功能特色</a></li>
              <li><a href="#" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">定价</a></li>
              <li><a href="#" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">博客</a></li>
            </ul>
          </div>

          <!-- 联系我们 -->
          <div>
            <h4 class="text-gray-900 dark:text-white font-semibold mb-4">关于</h4>
            <ul class="space-y-2 text-sm">
              <li><a href="#" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">关于我们</a></li>
              <li><a href="#" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">联系方式</a></li>
              <li><a href="#" class="text-gray-600 dark:text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors">隐私政策</a></li>
            </ul>
          </div>
        </div>

        <div class="border-t border-gray-200 dark:border-gray-800 pt-8 text-center">
          <p class="text-gray-500 dark:text-gray-500 text-sm">&copy; 2024 TodoHeap. 保留所有权利。</p>
        </div>
      </div>
    </footer>
  </div>
</template>

<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

// 状态变量
const authStore = useAuthStore()  // 认证状态存储
const router = useRouter()        // 路由实例


// 主函数
onMounted(async () => {

  // 如果 store 未初始化，先初始化
  if (!authStore.initialized && !authStore.loading) {
    await authStore.initialize()
  }

  // 如果已登录，自动跳转到应用页
  if (authStore.isAuthenticated) {
    router.push('/app')
  }
})


// 响应函数
const openLogin = () => {
  router.push('/login')
}

const scrollToFeatures = () => {
  const featuresSection = document.getElementById('features')
  if (featuresSection) {
    featuresSection.scrollIntoView({ behavior: 'smooth' })
  }
}
</script>

<style scoped>
/* 动画 */
@keyframes fadeInLeft {
  from {
    opacity: 0;
    transform: translateX(-30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeInRight {
  from {
    opacity: 0;
    transform: translateX(30px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
}

@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(30px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.animate-fadeInLeft {
  animation: fadeInLeft 0.8s ease-out;
}

.animate-fadeInRight {
  animation: fadeInRight 0.8s ease-out 0.2s both;
}

.animate-fadeInUp {
  animation: fadeInUp 0.8s ease-out;
}

.animation-delay-2000 {
  animation-delay: 2s;
}
</style>