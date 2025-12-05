<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../supabase'
import TodoList from '../components/TodoList.vue'
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

const handleSignOut = async () => {
  await supabase.auth.signOut()
  router.push('/login')
}
</script>

<template>
  <div class="app-shell">
    <div class="app-header">
      <h1>📝 TodoHeap</h1>
      <button class="sign-out-btn" @click="handleSignOut">退出登录</button>
    </div>
    <div class="todo-container">
      <TodoList :session="session" />
    </div>
  </div>
</template>

<style scoped>
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

@media (max-width: 768px) {
  .app-shell {
    padding: 15px;
  }

  .app-header {
    padding: 15px;
    margin-bottom: 15px;
    flex-direction: column;
    gap: 15px;
  }

  .app-header h1 {
    font-size: 20px;
  }

  .sign-out-btn {
    padding: 8px 16px;
    font-size: 13px;
  }
}
</style>
