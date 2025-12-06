<script setup>
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '../stores/auth'

const router = useRouter()
const authStore = useAuthStore()

onMounted(async () => {
  // 如果 store 未初始化，先初始化
  if (authStore.session === null && !authStore.loading) {
    await authStore.initialize()
  }
  
  // 如果已登录，自动跳转到应用页
  if (authStore.isAuthenticated) {
    router.push('/app')
  }
})

const openLogin = () => {
  router.push('/login')
}
</script>

<template>
  <!-- 推广页 - 仅在未登录时显示 -->
  <div class="landing-page">
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
      <h2>功能特色</h2>
      <div class="features-grid">
        <div class="feature-card">
          <div class="feature-icon">✨</div>
          <h3>简洁界面</h3>
          <p>清爽的设计，专注于任务本身</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">⚡</div>
          <h3>高效操作</h3>
          <p>快速添加、编辑和完成任务</p>
        </div>
        <div class="feature-card">
          <div class="feature-icon">☁️</div>
          <h3>云端同步</h3>
          <p>您的数据安全存储在云端</p>
        </div>
      </div>
    </section>

    <!-- Footer -->
    <footer class="footer">
      <p>&copy; 2024 TodoHeap. All rights reserved.</p>
    </footer>
  </div>
</template>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

/* ========== 推广页面样式 ========== */

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

.features h2 {
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

.feature-card h3 {
  font-size: 18px;
  margin-bottom: 10px;
  color: #667eea;
}

.feature-card p {
  color: #666;
  line-height: 1.6;
}

/* 页脚 */
.footer {
  text-align: center;
  padding: 20px;
  color: rgba(255, 255, 255, 0.8);
  border-top: 1px solid rgba(255, 255, 255, 0.2);
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

  .features h2 {
    font-size: 28px;
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
}
</style>