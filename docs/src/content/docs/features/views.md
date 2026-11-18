---
title: "视图与交互"
---
# 视图与交互

本页说明任务图、任务表、日程与堆视图的当前实现与关键落点。使用方法见[视图详解](../user/views.md)。

## 任务图

### 布局

- 只有两种横向布局：从左到右、从右到左。工具栏方向按钮在两者间轮换，选择存本地（`directionOptions`、`cycleDirection`、`persistedRef('mindmap-direction')`）。
- `graphLayout` 先按折叠状态求出可见图，再用 Tarjan 缩点与最长路径分层；根节点钉在坐标原点，展开或折叠其它节点时根节点在画布上不动。
- 同层节点按子树块跨度排开：只累计紧邻下一列的子节点，且每个子节点只归第一个紧邻父级；多父节点取全部前向父级的中心均值。`limitGaps` 只压缩同一父级兄弟之间超过两个 `crossGap` 的空白（`blockSizeOf`、`blockBoundsOf`、`shareParent`）。
- 节点高度由 `measureNode` 按 canvas 实测像素折行算出，显示态与编辑态共用同一套断行（`wrapLines`），编辑中不截断行数。

### 画布

- 点阵底纹固定 24px 点距，不随平移与缩放变化；画布可切浅色/深色，深色下点阵转白。底色首次跟随 `prefers-color-scheme`，之后按手动选择保存（`mindmap-dot-grid`、`mindmap-dark-canvas`）。
- 滚轮在选中节点或选中连线上缩放，其余位置上下平移；Ctrl/Cmd + 滚轮在任意位置缩放，触控板双指捏合也走这条分支。画布 `@wheel.prevent`，不会触发浏览器整页缩放（`onWheel`）。
- 拖拽空白处或根节点平移，右下角「适应视图」按钮复位。

### 节点

- 悬停是半透明绿色描边，选中是同色实线加淡绿底，两者同为 2px，只差透明度。
- 选中后节点右侧出现竖三点按钮，悬停也会露出；右键直接唤出菜单。菜单含重命名、新建子任务、复制为 Markdown、删除任务，靠近边缘自动翻转（`MENU_ITEMS`、`openNodeMenuAt`）。
- 出边一侧有圆形控件：有子任务时是折叠开关，叶子节点在指针接近时显示加号；按钮中心就是连线起点（`controlPointFor`、`updateLeafControlHover`、`LEAF_CONTROL_REVEAL`）。
- 原地编辑使用常驻 textarea：Enter 提交、Esc 取消、Shift+Enter 插入硬换行；节点随内容长高，不出现内部滚动条（`onEditKeydown`、`commitEdit`）。

### 聚焦与右栏

- 选中任务的聚焦固定为三栏视野（父级、当前、子级各一栏）：节点横向居中，纵向保留当前屏幕位置，只有移出视口时才夹回可见范围；容器尺寸变化时重新贴合（`focusTargetFor`、`centerOnNode`、`followColumnFocus`）。
- 详情右栏是浮层，不挤压画布；右下角视图控件与节点菜单按 `detailPanelInset` 左移，避免被面板遮住（`utils/detailPanelContext.js`）。

## 拖拽与连线

- 拖节点时指针处显示影子副本，原节点降到 0.3 透明度；只有从折叠/加号按钮拉线才画虚线与箭头（`dragState.shadow`、`nodeOpacity`）。
- 落点按源任务的父级数量分派：单父直接移动且不弹提示；多父只追加链接，提示条可撤销，并提供「改为移动（断开旧连接）」（`TodoGraph.vue` 的 `findParentIds`）。
- 按钮拉线只建链接，不移动原父级；命中按指针点到节点矩形的距离判定，允许 24 屏幕像素误差（按缩放折算、上限 48 图内单位），多个候选取最近者（`linkTargetAtRect`）。
- 预览线终点超出指针 18 屏幕像素，箭头不被指针图标盖住（`DRAG_ARROW_GAP`）。
- 目标已在源任务子树内会成环，直接拦截并提示；`isRef` 引用节点不能作为拖拽起点或落点。

## 键盘与剪贴板

- 主方向键进入子级或回到父级，交叉方向键在同级之间移动，方向随左右布局翻转；`Enter` 新建同级、`Tab` 新建子级、`F2` 或双击重命名、`Delete`/`Backspace` 删除、`Space` 切换完成、`Esc` 取消选中。
- 选中节点后 `Ctrl/Cmd+C` 把该节点及全部后代标题复制为 Markdown 列表，每层缩进两个空格；不受折叠影响，跳过引用节点并防环。剪贴板优先 `navigator.clipboard`，非安全上下文退回 `execCommand`。

## 任务表

- 行卡片使用 `rounded-lg` 与较轻阴影；选中行沿用侧栏激活样式：绿色浅底、绿色文字、左缘 2px 实线，选中态与普通行共用同一组阴影值，切换时不跳动。
- 完成状态为圆形勾选圈，多选使用方形选择框；未设截止时只显示日历按钮，已设时按逾期/今天/以后分别用红/绿/中性色。
- 子任务沿父级箭头中心画细引导线；已完成区使用同款卡片与圆形勾选（`TodoListItem.vue`、`TodoList.vue`、`Trash.vue`、`TodoHeap.vue`）。

## 日程与堆视图

- 日程视图只展示 `schedules` 事件并按开始日期分组；堆视图按截止时间、完成进度、子任务复杂度打分排序（`utils/priorityCalculator.js`）。
