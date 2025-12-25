<template>
  <div ref="editorRef" class="milkdown-editor h-full"></div>
</template>

<script setup>
import { ref, watch, onMounted, onUnmounted } from 'vue'
import { Editor, rootCtx, defaultValueCtx, editorViewOptionsCtx } from '@milkdown/kit/core'
import { commonmark } from '@milkdown/kit/preset/commonmark'
import { gfm } from '@milkdown/kit/preset/gfm'
import { history } from '@milkdown/kit/plugin/history'
import { clipboard } from '@milkdown/kit/plugin/clipboard'
import { listener, listenerCtx } from '@milkdown/kit/plugin/listener'
import { nord } from '@milkdown/theme-nord'
import '@milkdown/theme-nord/style.css'

const props = defineProps({
  modelValue: { type: String, default: '' },
  readonly: { type: Boolean, default: false },
  placeholder: { type: String, default: '输入内容，支持 Markdown...' }
})

const emit = defineEmits(['update:modelValue', 'blur', 'focus'])

const editorRef = ref(null)
let editor = null
let isInternalUpdate = false

// 创建编辑器
const createEditor = async () => {
  if (!editorRef.value) return

  editor = await Editor.make()
    .config((ctx) => {
      ctx.set(rootCtx, editorRef.value)
      ctx.set(defaultValueCtx, props.modelValue || '')
      ctx.set(editorViewOptionsCtx, {
        editable: () => !props.readonly,
        attributes: {
          class: 'prose prose-sm prose-slate max-w-none focus:outline-none',
          'data-placeholder': props.placeholder
        }
      })
      ctx.get(listenerCtx)
        .markdownUpdated((ctx, markdown, prevMarkdown) => {
          if (markdown !== prevMarkdown && !isInternalUpdate) {
            emit('update:modelValue', markdown)
          }
        })
        .focus(() => {
          emit('focus')
        })
        .blur(() => {
          emit('blur')
        })
    })
    .config(nord)
    .use(commonmark)
    .use(gfm)
    .use(history)
    .use(clipboard)
    .use(listener)
    .create()
}

// 更新编辑器内容
const updateContent = (content) => {
  if (!editor) return
  
  isInternalUpdate = true
  editor.action((ctx) => {
    const view = ctx.get(editorViewOptionsCtx)
    // 重新设置内容需要使用 replaceAll
    const { state } = editor.ctx.get(editorViewOptionsCtx)
  })
  isInternalUpdate = false
}

// 监听外部值变化
watch(() => props.modelValue, (newValue, oldValue) => {
  if (newValue !== oldValue && editor) {
    // 由于 Milkdown 不支持直接更新，需要销毁并重建
    // 这里暂时跳过，让用户主导编辑
  }
}, { immediate: false })

// 监听只读状态变化
watch(() => props.readonly, async () => {
  if (editor) {
    await editor.destroy()
    await createEditor()
  }
})

onMounted(() => {
  createEditor()
})

onUnmounted(() => {
  if (editor) {
    editor.destroy()
  }
})

defineExpose({
  getEditor: () => editor
})
</script>

<style>
/* Milkdown 编辑器基础样式 */
.milkdown-editor {
  min-height: 12rem;
  height: 100%;
  display: flex;
  flex-direction: column;
  color: #1e293b;
}

.milkdown-editor .milkdown {
  padding: 0;
  background: transparent !important;
  flex: 1;
  display: flex;
  flex-direction: column;
  height: 100%;
}

.milkdown-editor .editor {
  padding: 0.75rem;
  min-height: 12rem;
  flex: 1;
  display: flex;
  flex-direction: column;
  color: #1e293b;
}

/* ProseMirror 编辑区域 */
.milkdown-editor .ProseMirror {
  position: relative;
  min-height: 12rem;
  flex: 1;
  overflow-y: auto;
  color: #1e293b;
  background: transparent;
}

/* 占位符样式 */
.milkdown-editor .ProseMirror:empty::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
  position: absolute;
}

/* 聚焦样式 */
.milkdown-editor .ProseMirror:focus {
  outline: none;
}

/* 覆盖 Nord 主题的一些样式 */
.milkdown-editor .milkdown,
.milkdown-editor .milkdown .editor,
.milkdown-editor .milkdown .ProseMirror {
  background: transparent !important;
  font-family: inherit;
  color: #1e293b !important;
}

/* 段落样式 */
.milkdown-editor p {
  color: #1e293b;
  margin: 0.5em 0;
}

/* 标题样式 */
.milkdown-editor h1,
.milkdown-editor h2,
.milkdown-editor h3,
.milkdown-editor h4,
.milkdown-editor h5,
.milkdown-editor h6 {
  color: #0f172a;
  font-weight: 600;
  margin-top: 1em;
  margin-bottom: 0.5em;
}

.milkdown-editor h1 { font-size: 1.5em; }
.milkdown-editor h2 { font-size: 1.3em; }
.milkdown-editor h3 { font-size: 1.15em; }

/* 列表样式 */
.milkdown-editor ul,
.milkdown-editor ol {
  color: #1e293b;
  padding-left: 1.5em;
  margin: 0.5em 0;
}

.milkdown-editor ul { list-style-type: disc; }
.milkdown-editor ol { list-style-type: decimal; }

.milkdown-editor li {
  color: #1e293b;
  margin: 0.25em 0;
}

/* 代码块样式 */
.milkdown-editor code {
  background-color: #f1f5f9;
  color: #0f172a;
  padding: 0.15em 0.4em;
  border-radius: 0.25em;
  font-size: 0.9em;
}

.milkdown-editor pre {
  background-color: #1e293b !important;
  color: #e2e8f0 !important;
  padding: 0.75em 1em;
  border-radius: 0.5rem;
  overflow-x: auto;
}

.milkdown-editor pre code {
  background: transparent;
  color: #e2e8f0;
  padding: 0;
}

/* 引用块样式 */
.milkdown-editor blockquote {
  border-left: 4px solid #6366f1;
  padding-left: 1em;
  margin: 0.75em 0;
  color: #64748b;
  font-style: italic;
}

/* 链接样式 */
.milkdown-editor a {
  color: #6366f1;
  text-decoration: underline;
}

/* 分割线 */
.milkdown-editor hr {
  border: none;
  border-top: 1px solid #e2e8f0;
  margin: 1em 0;
}

/* 表格样式 */
.milkdown-editor table {
  border-collapse: collapse;
  width: 100%;
}

.milkdown-editor th,
.milkdown-editor td {
  border: 1px solid #e2e8f0;
  padding: 0.5em 0.75em;
  color: #1e293b;
}

.milkdown-editor th {
  background-color: #f8fafc;
  font-weight: 600;
}

/* 已删除内容的灰色样式 */
.deleted-content .milkdown-editor,
.deleted-content .milkdown-editor .milkdown,
.deleted-content .milkdown-editor .ProseMirror,
.deleted-content .milkdown-editor p,
.deleted-content .milkdown-editor h1,
.deleted-content .milkdown-editor h2,
.deleted-content .milkdown-editor h3,
.deleted-content .milkdown-editor h4,
.deleted-content .milkdown-editor h5,
.deleted-content .milkdown-editor h6,
.deleted-content .milkdown-editor ul,
.deleted-content .milkdown-editor ol,
.deleted-content .milkdown-editor li,
.deleted-content .milkdown-editor blockquote {
  color: #94a3b8 !important;
}

.deleted-content .milkdown-editor a {
  color: #94a3b8 !important;
}
</style>
