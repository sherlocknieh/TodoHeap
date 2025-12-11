<template>
  <!-- 404 页面 -->
  <div class="not-found-page">
    <div class="container">
      <div class="content">
        <div class="error-code">404</div>
        <h1>页面未找到</h1>
        <p class="description">抱歉,您访问的页面不存在或已被删除</p>

        <div class="illustration">
          <span class="emoji">🔍</span>
        </div>

        <div class="actions">
          <button class="btn-primary" @click="goHome">
            返回首页
          </button>
          <button class="btn-secondary" @click="goBack">
            返回上一页
          </button>
        </div>
      </div>

      <div class="background-decoration">
        <div class="shape shape-1"></div>
        <div class="shape shape-2"></div>
        <div class="shape shape-3"></div>
      </div>
    </div>
  </div>
</template>

<script setup>
  import { useRouter } from 'vue-router'

  const router = useRouter()

  const goHome = () => {
    router.push('/')
  }

  const goBack = () => {
    router.back()
  }
</script>

<style scoped>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

.not-found-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  overflow: hidden;
  position: relative;
}

.container {
  position: relative;
  z-index: 10;
  width: 100%;
  padding: 20px;
}

.content {
  max-width: 600px;
  margin: 0 auto;
  text-align: center;
}

.error-code {
  font-size: 120px;
  font-weight: 900;
  background: linear-gradient(135deg, #ffffff 0%, #e0e7ff 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  line-height: 1;
  margin-bottom: 20px;
  text-shadow: 0 8px 32px rgba(0, 0, 0, 0.1);
}

h1 {
  font-size: 48px;
  color: white;
  margin-bottom: 12px;
  font-weight: 800;
}

.description {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.9);
  margin-bottom: 40px;
  line-height: 1.6;
}

.illustration {
  margin: 40px 0;
}

.emoji {
  font-size: 80px;
  display: inline-block;
  animation: float 3s ease-in-out infinite;
}

@keyframes float {
  0%, 100% {
    transform: translateY(0px);
  }
  50% {
    transform: translateY(-20px);
  }
}

.actions {
  display: flex;
  gap: 12px;
  justify-content: center;
  flex-wrap: wrap;
}

.btn-primary,
.btn-secondary {
  padding: 14px 32px;
  border: none;
  border-radius: 8px;
  font-size: 16px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
  text-decoration: none;
}

.btn-primary {
  background: white;
  color: #667eea;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 12px 32px rgba(0, 0, 0, 0.25);
}

.btn-primary:active {
  transform: translateY(0);
}

.btn-secondary {
  background: rgba(255, 255, 255, 0.2);
  color: white;
  border: 2px solid white;
  backdrop-filter: blur(10px);
}

.btn-secondary:hover {
  background: rgba(255, 255, 255, 0.3);
  transform: translateY(-2px);
}

.btn-secondary:active {
  transform: translateY(0);
}

/* 装饰背景 */
.background-decoration {
  position: fixed;
  inset: 0;
  z-index: 1;
  pointer-events: none;
}

.shape {
  position: absolute;
  border-radius: 50%;
  opacity: 0.1;
}

.shape-1 {
  width: 300px;
  height: 300px;
  background: white;
  top: -100px;
  left: -100px;
  animation: rotate 20s linear infinite;
}

.shape-2 {
  width: 200px;
  height: 200px;
  background: white;
  bottom: -50px;
  right: -50px;
  animation: rotate 15s linear infinite reverse;
}

.shape-3 {
  width: 150px;
  height: 150px;
  background: white;
  bottom: 20%;
  left: 10%;
  animation: rotate 25s linear infinite;
}

@keyframes rotate {
  from {
    transform: rotate(0deg);
  }
  to {
    transform: rotate(360deg);
  }
}

/* 响应式设计 */
@media (max-width: 768px) {
  .error-code {
    font-size: 80px;
  }

  h1 {
    font-size: 32px;
  }

  .description {
    font-size: 16px;
  }

  .emoji {
    font-size: 60px;
  }

  .actions {
    flex-direction: column;
  }

  .btn-primary,
  .btn-secondary {
    width: 100%;
  }
}

@media (max-width: 480px) {
  .error-code {
    font-size: 60px;
  }

  h1 {
    font-size: 24px;
  }

  .description {
    font-size: 14px;
  }

  .emoji {
    font-size: 50px;
  }

  .btn-primary,
  .btn-secondary {
    padding: 12px 24px;
    font-size: 14px;
  }
}
</style>
