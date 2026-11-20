---
title: "Markdown 编辑器的空引用块"
---
# Markdown 编辑器的空引用块

详情面板的 Markdown 编辑器由 `frontend/src/components/MilkdownEditor.vue` 封装 Milkdown + ProseMirror。这里记录「只剩空段落的引用块删不掉」的约束与处理。

## 现象与根因

- 光标停在空引用块的唯一段落里，按 Backspace / Delete 没有反应，引用块一直留在文档里。
- Milkdown 在 `@milkdown/core` 的 `overrideBaseKeymap` 里把 Backspace 换成 `chainCommands(undoInputRule, deleteSelection, joinTextblockBackward, selectNodeBackward)`，去掉了 ProseMirror 默认链里 `joinBackward` 的「前方没有可合并块时 lift 出包裹」兜底。
- 引用块首个子节点是空段落时，`findCutBefore` 返回 `null`，`joinTextblockBackward` 直接返回 false；`selectNodeBackward` 也没有可选的节点，按键因此被吞掉。

## 处理

- `MilkdownEditor.vue` 注册自定义 keymap，并通过 `prosePluginsCtx` 插在其它 prose 插件之前，保证先于 Milkdown 的合并 keymap：
  - 只接管「选区为空、光标在空 `paragraph`、且该段落是最近一层 `blockquote` 的第一个子节点」的 Backspace / Delete。
  - 用 ProseMirror 的 `lift` 把空段落抬出引用块；引用块空了会随之消失。
  - 其它情况返回 false，仍走 Milkdown 默认行为（例如引用块里已有内容时与前段合并）。
- 只影响编辑器交互，不改 Markdown 的解析与序列化。

## 验证

- 在详情面板输入 `>` 回车得到空引用块，再按 Backspace 应变成普通空段落，引用块消失。
- 引用块内已有文字时，在第二段行首按 Backspace 应与前段合并，不会整块跳出。
