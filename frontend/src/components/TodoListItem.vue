<template>
  <ul class="space-y-2">
    <li
      v-for="item in flatList"
      :key="item.id"
      :class="[
        'flex items-center gap-3 px-3 py-2 bg-white border border-slate-200 rounded-lg',
        'hover:bg-slate-50 transition-colors cursor-pointer',
        {
          'bg-emerald-50 border-emerald-200': selectedTaskId === item.id,
          'opacity-60': item.status === 'done'
        }
      ]"
      :style="{ marginLeft: (item._level * 24) + 'px' }"
    >
      <!-- 复选框 -->
      <div class="flex-shrink-0">
        <input
          type="checkbox"
          :checked="item.status === 'done'"
          readonly
          class="w-5 h-5 rounded accent-emerald-600 cursor-pointer"
          @click="emitToggleDone(item)"
        />
      </div>

      <!-- 标题 -->
      <div class="flex-1 min-w-0">
        <span
          v-if="editingId !== item.id"
          class="block text-slate-900 font-medium truncate"
          @click.stop="selectTask(item.id)"
        >
          {{ item.title || '未命名任务' }}
        </span>
        <input
          v-else
          :id="'edit-input-' + item.id"
          v-model="editingText"
          class="w-full px-2 py-1 border border-slate-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
          @blur="finishEdit(item.id)"
          @keyup.enter="finishEdit(item.id)"
        />
      </div>

      <!-- 状态标签 -->
      <span
        :class="[
          'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold flex-shrink-0',
          {
            'bg-blue-100 text-blue-800': item.status === 'todo',
            'bg-amber-100 text-amber-800': item.status === 'doing',
            'bg-emerald-100 text-emerald-800': item.status === 'done'
          }
        ]"
      >
        {{ item.status === 'done' ? '✓ 完成' : item.status === 'doing' ? '⚡ 进行中' : '○ 待办' }}
      </span>

      <!-- 操作按钮 -->
      <button
        class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 border border-blue-200 rounded transition-colors"
        @click.stop="emitAddSubtask(item.id, startEdit)"
      >
        ➕ 子任务
      </button>

      <button
        v-if="selectedTaskId === item.id"
        class="inline-flex items-center px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
        @click.stop="selectTask(item.id)"
      >
        ✓ 已选择
      </button>
      <button
        v-else
        class="hidden sm:inline-flex items-center px-2 py-1 text-xs font-medium text-emerald-600 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded transition-colors"
        @click.stop="selectTask(item.id)"
      >
        选择
      </button>

      <!-- 删除按钮 -->
      <button
        class="flex-shrink-0 inline-flex items-center justify-center w-8 h-8 text-red-600 hover:bg-red-50 rounded transition-colors"
        @click.stop="emitDeleteTodo(item.id)"
        title="删除任务"
      >
        ×
      </button>
    </li>
  </ul>
</template>

<script setup>
import { computed, ref, nextTick } from 'vue'

const props = defineProps({
  node: Object,
  selectedTaskId: Number
})

const emit = defineEmits(['toggle-done', 'delete-todo', 'add-subtask', 'edit-subtask', 'task-selected'])
const emitToggleDone = (node) => emit('toggle-done', node)
const emitDeleteTodo = (id) => emit('delete-todo', id)
const emitAddSubtask = (parentId, cb) => emit('add-subtask', parentId, cb)
const emitEditSubtask = (id) => emit('edit-subtask', id)
const emitTaskSelected = (id) => emit('task-selected', id)

// 展平树结构为带层级的数组
function flattenTree(node, level = 0, arr = []) {
  if (!node) return arr
  arr.push({ ...node, _level: level })
  if (node.children && node.children.length) {
    node.children.forEach((child) => flattenTree(child, level + 1, arr))
  }
  return arr
}
const flatList = computed(() => flattenTree(props.node))

const editingId = ref(null)
const editingText = ref('')

function startEdit(id, title) {
  editingId.value = id
  editingText.value = title
  nextTick(() => {
    const input = document.getElementById('edit-input-' + id)
    if (input) input.focus()
  })
}

function finishEdit(id) {
  emitEditSubtask(id, editingText.value)
  editingId.value = null
  editingText.value = ''
}

function selectTask(id) {
  emitTaskSelected(id)
}
</script>
