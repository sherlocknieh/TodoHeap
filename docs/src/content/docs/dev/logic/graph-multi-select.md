---
title: "任务图节点多选"
---
# 任务图节点多选

任务图支持 Ctrl/⌘ 切换节点、Shift 按图的可见顺序连选。选中多个节点后，在任一选中节点上右键出现批量菜单（复制选中节点 / 删除选中任务）。

## 选择状态

- `multiSelectedKeys` 保存字符串节点 ID，根节点不参与；与详情面板的单选 `selectedTaskId` 相互独立，多选不会切换详情。
- Ctrl/⌘ 切换单个节点并更新锚点；普通点击会清空多选但记住该节点作为锚点，第一次 Shift 也能从当前单选节点开始连选。
- Shift 从锚点按 `layout.value.nodes` 的可见顺序取区间，锚点不可见时退化为切换。
- 多选高亮复用节点选中样式：`measureNode` 把多选 ID 也计入 `selected`。
- 普通点击、点空白或按 Esc 退出多选；外部切换任务（列表、侧栏）时同步清空，避免高亮与详情不一致。

## 右键批量菜单

- `openNodeMenuAt` 判断右键节点是否属于多选且数量大于 1；是则 `menuBatch=true`，菜单项换成 `BATCH_MENU_ITEMS`，否则清空多选并走单节点菜单。
- 批量删除通过 `delete-tasks` 一次性交给 `TodoGraph.deleteTasks`：逐个软删除，父子重叠时跳过已被祖先带走的后代，提示里整批撤销。
- 批量复制把每个选中节点的子树拼成一份 Markdown，`visited` 去重父子重叠，只写一次剪贴板。
- 快捷键：Delete/Backspace 在多选时批量删除，Ctrl/⌘+C 复制全部选中节点。

## 验证

- 手工：Ctrl 点两个节点后右键其一；Shift 连选；Delete 批量删除后撤销；Ctrl+C 粘贴核对 Markdown。
