<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '../supabase'

const props = defineProps(['session'])

const todos = ref([])
const newTaskText = ref('')
const errorText = ref('')

const fetchTodos = async () => {
  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .order('id', { ascending: true })

  if (error) console.log('error', error)
  else todos.value = data
}

onMounted(() => {
  fetchTodos()
})

const addTodo = async () => {
  const task = newTaskText.value.trim()
  if (task.length) {
    const { data, error } = await supabase
      .from('todos')
      .insert({ task, user_id: props.session.user.id })
      .select()
      .single()

    if (error) {
      errorText.value = error.message
    } else {
      todos.value.push(data)
      newTaskText.value = ''
    }
  }
}

const deleteTodo = async (id) => {
  try {
    await supabase.from('todos').delete().eq('id', id).throwOnError()
    todos.value = todos.value.filter((x) => x.id != id)
  } catch (error) {
    console.log('error', error)
  }
}

const toggleDone = async (todo) => {
  try {
    const { data, error } = await supabase
      .from('todos')
      .update({ is_complete: !todo.is_complete })
      .eq('id', todo.id)
      .select()
      .single()
      
    if (error) throw error
    
    todo.is_complete = data.is_complete
  } catch (error) {
    console.log('error', error)
  }
}
</script>

<template>
  <div class="todo-app">
    <h1>Todo List.</h1>
    
    <div class="input-group">
      <input 
        v-model="newTaskText" 
        @keyup.enter="addTodo" 
        placeholder="make coffee" 
      />
      <button @click="addTodo">Add</button>
    </div>

    <div v-if="errorText" class="error-alert">
      {{ errorText }}
    </div>

    <ul class="todo-list">
      <li v-for="todo in todos" :key="todo.id" :class="{ done: todo.is_complete }">
        <span @click="toggleDone(todo)">{{ todo.task }}</span>
        <button class="delete-btn" @click="deleteTodo(todo.id)">x</button>
      </li>
    </ul>
  </div>
</template>

<style scoped>
.todo-app {
  font-family: Arial, sans-serif;
  max-width: 400px;
  margin: 0 auto;
  text-align: left;
}

h1 {
  text-align: center;
  color: #42b883;
  margin-bottom: 2rem;
}

.input-group {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

input {
  flex: 1;
  padding: 8px;
  border: 1px solid #ccc;
  border-radius: 4px;
}

button {
  padding: 8px 16px;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

button:hover {
  background-color: #33a06f;
}

.error-alert {
  color: #721c24;
  background-color: #f8d7da;
  border-color: #f5c6cb;
  padding: .75rem 1.25rem;
  margin-bottom: 1rem;
  border: 1px solid transparent;
  border-radius: .25rem;
}

.todo-list {
  list-style: none;
  padding: 0;
}

li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  background: #2f2f2f;
  margin-bottom: 5px;
  border-radius: 4px;
}

li span {
  cursor: pointer;
  flex: 1;
}

li.done span {
  text-decoration: line-through;
  color: #888;
}

.delete-btn {
  background-color: #ff4444;
  padding: 4px 8px;
  margin-left: 10px;
}

.delete-btn:hover {
  background-color: #cc0000;
}
</style>
