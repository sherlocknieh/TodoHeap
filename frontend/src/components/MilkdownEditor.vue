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

<template>
  <div ref="editorRef" class="milkdown-editor h-full"></div>
</template>

<style>
@layer components {
  /*
    说明: Milkdown 编辑器内部需要在 flex 高度边界内收缩以启用内部滚动。
    因此 `.milkdown-editor`、`.editor` 与 `.ProseMirror` 使用 `min-height: 0` 和 `height: 100%`。
    这能确保当父容器（详情面板的描述区）为 `flex:1` 时，编辑器不会被内容撑开，
    内部的 `overflow-y: auto` 可以正确显示滚动条并滚动内容。
  */
  /* 基础编辑器容器 - 使用 CSS 变量实现深色模式 */
  .milkdown-editor {
    --text-primary: rgb(30 41 59);
    --text-dark: rgb(226 232 240);

    min-width: 0;
    min-height: 0;
    height: 100%;
    display: flex;
    flex-direction: column;
    color: var(--text-primary);
    font-family: inherit;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor {
      color: var(--text-dark);
    }
  }

  /* Milkdown 编辑器内层容器 */
  .milkdown-editor .milkdown,
  .milkdown-editor .milkdown .editor,
  .milkdown-editor .milkdown .ProseMirror {
    background: transparent !important;
    font-family: inherit;
    color: var(--text-primary) !important;
    min-height: 0;
    height: 100%;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor .milkdown,
    .milkdown-editor .milkdown .editor,
    .milkdown-editor .milkdown .ProseMirror {
      color: var(--text-dark) !important;
    }
  }

  /* 编辑区域 */
  .milkdown-editor .editor {
    padding: 0.75rem;
    min-height: 0;
    height: 100%;
    flex: 1;
    display: flex;
    flex-direction: column;
    color: var(--text-primary);
    overflow-y: auto;
    scrollbar-gutter: stable;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor .editor {
      color: var(--text-dark);
    }
  }

  /* ProseMirror 编辑框 */
  .milkdown-editor .ProseMirror {
    position: relative;
    min-height: 0;
    height: 100%;
    flex: 1;
    overflow-y: auto;
    color: var(--text-primary);
    background: transparent;
    scrollbar-gutter: stable;
  }

  .milkdown-editor .editor::-webkit-scrollbar,
  .milkdown-editor .ProseMirror::-webkit-scrollbar {
    width: 10px;
  }

  .milkdown-editor .editor::-webkit-scrollbar-track,
  .milkdown-editor .ProseMirror::-webkit-scrollbar-track {
    background: transparent;
  }

  .milkdown-editor .editor::-webkit-scrollbar-thumb,
  .milkdown-editor .ProseMirror::-webkit-scrollbar-thumb {
    background-color: rgb(148 163 184 / 0.5);
    border-radius: 9999px;
    border: 2px solid transparent;
    background-clip: content-box;
  }

  .milkdown-editor .editor::-webkit-scrollbar-thumb:hover,
  .milkdown-editor .ProseMirror::-webkit-scrollbar-thumb:hover {
    background-color: rgb(100 116 139 / 0.7);
  }

  .milkdown-editor .editor,
  .milkdown-editor .ProseMirror {
    scrollbar-width: thin;
    scrollbar-color: rgb(148 163 184 / 0.6) transparent;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor .ProseMirror {
      color: var(--text-dark);
    }
  }

  /* 占位符 */
  .milkdown-editor .ProseMirror:empty::before {
    content: attr(data-placeholder);
    color: rgb(148 163 184);
    pointer-events: none;
    position: absolute;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor .ProseMirror:empty::before {
      color: rgb(100 116 139);
    }
  }

  /* 聚焦样式 */
  .milkdown-editor .ProseMirror:focus {
    outline: none;
  }

  /* 段落 */
  .milkdown-editor p {
    color: var(--text-primary);
    margin: 0.5em 0;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor p {
      color: var(--text-dark);
    }
  }

  /* 标题 */
  .milkdown-editor h1,
  .milkdown-editor h2,
  .milkdown-editor h3,
  .milkdown-editor h4,
  .milkdown-editor h5,
  .milkdown-editor h6 {
    color: rgb(15 23 42);
    font-weight: 600;
    margin-top: 1em;
    margin-bottom: 0.5em;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor h1,
    .milkdown-editor h2,
    .milkdown-editor h3,
    .milkdown-editor h4,
    .milkdown-editor h5,
    .milkdown-editor h6 {
      color: rgb(241 245 249);
    }
  }

  .milkdown-editor h1 { font-size: 1.5em; }
  .milkdown-editor h2 { font-size: 1.3em; }
  .milkdown-editor h3 { font-size: 1.15em; }

  /* 列表 */
  .milkdown-editor ul,
  .milkdown-editor ol {
    color: var(--text-primary);
    padding-left: 1.5em;
    margin: 0.5em 0;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor ul,
    .milkdown-editor ol {
      color: var(--text-dark);
    }
  }

  .milkdown-editor ul { list-style-type: disc; }
  .milkdown-editor ol { list-style-type: decimal; }

  .milkdown-editor li {
    color: var(--text-primary);
    margin: 0.25em 0;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor li {
      color: var(--text-dark);
    }
  }

  /* 代码 */
  .milkdown-editor code {
    background-color: rgb(241 245 249);
    color: rgb(15 23 42);
    padding: 0.15em 0.4em;
    border-radius: 0.25em;
    font-size: 0.9em;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor code {
      background-color: rgb(30 41 59);
      color: rgb(226 232 240);
    }
  }

  .milkdown-editor pre {
    background-color: rgb(30 41 59) !important;
    color: rgb(226 232 240) !important;
    padding: 0.75em 1em;
    border-radius: 0.5rem;
    overflow-x: auto;
  }

  .milkdown-editor pre code {
    background: transparent;
    color: rgb(226 232 240);
    padding: 0;
  }

  /* 引用 */
  .milkdown-editor blockquote {
    border-left: 4px solid rgb(99 102 241);
    padding-left: 1em;
    margin: 0.75em 0;
    color: rgb(100 116 139);
    font-style: italic;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor blockquote {
      border-left-color: rgb(129 140 248);
      color: rgb(203 213 225);
    }
  }

  /* 链接 */
  .milkdown-editor a {
    color: rgb(99 102 241);
    text-decoration: underline;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor a {
      color: rgb(129 140 248);
    }
  }

  /* 分割线 */
  .milkdown-editor hr {
    border: none;
    border-top: 1px solid rgb(226 232 240);
    margin: 1em 0;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor hr {
      border-top-color: rgb(71 85 105);
    }
  }

  /* 表格 */
  .milkdown-editor table {
    border-collapse: collapse;
    width: 100%;
  }

  .milkdown-editor th,
  .milkdown-editor td {
    border: 1px solid rgb(226 232 240);
    padding: 0.5em 0.75em;
    color: var(--text-primary);
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor th,
    .milkdown-editor td {
      border-color: rgb(71 85 105);
      color: var(--text-dark);
    }
  }

  .milkdown-editor th {
    background-color: rgb(248 250 252);
    font-weight: 600;
  }

  @media (prefers-color-scheme: dark) {
    .milkdown-editor th {
      background-color: rgb(30 41 59);
    }
  }

  /* 已删除内容 */
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
    color: rgb(148 163 184) !important;
  }

  .deleted-content .milkdown-editor a {
    color: rgb(148 163 184) !important;
  }
}
</style>
