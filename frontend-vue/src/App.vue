<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from './supabase'
import Login from './pages/Login.vue'
import TodoList from './components/TodoList.vue'

const session = ref()

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
}
</script>

<template>
  <div v-if="!session">
    <Login />
  </div>
  <div v-else class="todo-container">
    <div style="text-align: right; margin-bottom: 20px;">
      <button class="sign-out-btn" @click="handleSignOut">Sign Out</button>
    </div>
    <TodoList :session="session" />
  </div>
</template>

<style scoped>
.todo-container {
  max-width: 600px;
  margin: 0 auto;
  padding: 50px 20px 100px 20px; /* Added horizontal padding for mobile */
}

.sign-out-btn {
  padding: 8px 16px;
  background-color: #333;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.sign-out-btn:hover {
  background-color: #000;
}
</style>
