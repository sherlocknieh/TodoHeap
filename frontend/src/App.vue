<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from './supabase'
import { useRouter } from 'vue-router'

const session = ref()
const router = useRouter()

onMounted(() => {
  supabase.auth.getSession().then(({ data }) => {
    session.value = data.session
  })

  supabase.auth.onAuthStateChange((_, _session) => {
    session.value = _session
  })
})

const openLogin = () => {
  router.push('/login')
}
</script>

<template>
  <!-- 显示路由视图（除了首页推广页） -->
  <RouterView v-if="$route.path !== '/' || session" />

  <!-- 未登录且在首页：显示推广主页 -->
  <div v-else class="landing-page">
    <!-- 导航栏 -->
    <nav class="navbar">
      <div class="logo-section">
        <span class="logo">📝</span>
        <h1 class="site-title">TodoHeap</h1>
      </div>
      <button class="nav-login-btn" @click="openLogin">登录 / 注册</button>
    </nav>

    <!-- Hero 区域 -->
    <section class="hero">
      <div class="hero-content">
        <h2 class="hero-title">简洁高效的待办清单</h2>
        <p class="hero-subtitle">用 TodoHeap 管理你的日常任务，提升工作效率</p>
        <button class="cta-btn" @click="openLogin">立即开始</button>
      </div>
      <div class="hero-image">🚀</div>
    </section>

    <!-- 特色区域 -->
    <section class="features">
      <h3 class="section-title">为什么选择 TodoHeap？</h3>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h4>快速简洁</h4>
          <p>无需复杂配置，开箱即用的待办体验</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">🔒</div>
          <h4>安全私密</h4>
          <p>基于 Supabase 的企业级安全认证与数据保护</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">☁️</div>
          <h4>随处访问</h4>
          <p>云端同步，随时随地管理你的任务</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">✓</div>
          <h4>实时同步</h4>
          <p>完成状态实时更新，掌握任务进度</p>
        </div>
      </div>
    </section>

    <!-- CTA 区域 -->
    <section class="cta-section">
      <h3>准备好提升你的效率了吗？</h3>
      <button class="cta-btn-large" @click="openLogin">免费开始使用</button>
    </section>

    <!-- 页脚 -->
    <footer class="footer">
      <p>&copy; 2025 TodoHeap. 所有权利保留。</p>
    </footer>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ========== 推广主页样式 ========== */

.landing-page {
  min-height: 100vh;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #333;
}

/* 导航栏 */
.navbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px 40px;
  background: rgba(255, 255, 255, 0.95);
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
  position: sticky;
  top: 0;
  z-index: 100;
}

.logo-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  font-size: 32px;
}

.site-title {
  font-size: 24px;
  font-weight: 700;
  color: #667eea;
  margin: 0;
}

.nav-login-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-weight: 500;
  transition: all 0.3s ease;
}

.nav-login-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* Hero 区域 */
.hero {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: 1200px;
  margin: 80px auto 40px;
  padding: 40px;
  gap: 60px;
}

.hero-content {
  flex: 1;
  color: white;
}

.hero-title {
  font-size: 48px;
  font-weight: 700;
  margin-bottom: 20px;
  line-height: 1.3;
}

.hero-subtitle {
  font-size: 18px;
  margin-bottom: 30px;
  opacity: 0.95;
  line-height: 1.6;
}

.cta-btn {
  padding: 14px 40px;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.cta-btn:hover {
  transform: translateY(-3px);
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
}

.hero-image {
  flex: 1;
  font-size: 120px;
  text-align: center;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-20px); }
}

/* 特色区域 */
.features {
  max-width: 1200px;
  margin: 80px auto 40px;
  padding: 40px;
}

.section-title {
  font-size: 36px;
  font-weight: 700;
  text-align: center;
  color: white;
  margin-bottom: 50px;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 30px;
}

.feature-card {
  background: white;
  padding: 30px;
  border-radius: 12px;
  text-align: center;
  box-shadow: 0 5px 20px rgba(0, 0, 0, 0.1);
  transition: all 0.3s ease;
}

.feature-card:hover {
  transform: translateY(-10px);
  box-shadow: 0 15px 40px rgba(0, 0, 0, 0.2);
}

.feature-icon {
  font-size: 48px;
  margin-bottom: 15px;
}

.feature-card h4 {
  font-size: 18px;
  margin-bottom: 10px;
  color: #667eea;
}

.feature-card p {
  color: #666;
  line-height: 1.6;
}

/* CTA 区域 */
.cta-section {
  text-align: center;
  padding: 80px 40px;
  background: rgba(255, 255, 255, 0.1);
  margin-top: 40px;
}

.cta-section h3 {
  font-size: 36px;
  color: white;
  margin-bottom: 30px;
}

.cta-btn-large {
  padding: 16px 50px;
  background: white;
  color: #667eea;
  border: none;
  border-radius: 8px;
  font-size: 18px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.cta-btn-large:hover {
  transform: translateY(-3px);
  box-shadow: 0 15px 35px rgba(0, 0, 0, 0.3);
}

/* 页脚 */
.footer {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
}

/* ========== Todo 应用样式 ========== */

.app-shell {
  min-height: 100vh;
  background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
  padding: 20px;
}

.app-header {
  max-width: 900px;
  margin: 0 auto;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  background: white;
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  margin-bottom: 20px;
}

.app-header h1 {
  margin: 0;
  font-size: 24px;
  color: #667eea;
}

.todo-container {
  max-width: 900px;
  margin: 0 auto;
}

.sign-out-btn {
  padding: 10px 20px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
  border: none;
  border-radius: 8px;
  cursor: pointer;
  font-size: 14px;
  font-weight: 500;
  transition: all 0.3s ease;
}

.sign-out-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

/* ========== 登录弹窗 ========== */

.auth-shell {
  min-height: 100vh;
  position: relative;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
}

.close-btn {
  position: absolute;
  top: 20px;
  right: 20px;
  background: white;
  color: #666;
  border: none;
  padding: 10px 16px;
  border-radius: 8px;
  cursor: pointer;
  font-size: 18px;
  transition: all 0.3s ease;
  z-index: 101;
}

.close-btn:hover {
  background: #f5f5f5;
  color: #333;
}

/* 响应式设计 */
@media (max-width: 1024px) {
  .hero {
    flex-direction: column;
    margin: 60px auto 40px;
    gap: 40px;
  }

  .hero-title {
    font-size: 36px;
  }

  .hero-image {
    font-size: 80px;
  }
}

@media (max-width: 768px) {
  .navbar {
    padding: 15px 20px;
  }

  .site-title {
    font-size: 18px;
  }

  .hero-title {
    font-size: 28px;
  }

  .hero-subtitle {
    font-size: 16px;
  }

  .section-title {
    font-size: 28px;
  }

  .cta-section h3 {
    font-size: 24px;
  }

  .features {
    padding: 20px;
  }

  .hero {
    padding: 20px;
  }

  .features-grid {
    grid-template-columns: 1fr;
  }

  .app-header {
    flex-direction: column;
    gap: 15px;
    text-align: center;
  }

  .app-shell {
    padding: 15px;
  }
}
</style>
