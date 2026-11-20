---
title: "视图与交互"
---
# 视图与交互

本页说明任务图、任务表、日程与堆视图的当前实现与关键落点。使用方法见[视图详解](../user/views.md)。

## 任务图

### 布局

- 只有两种横向布局：从左到右、从右到左。工具栏方向按钮在两者间轮换，选择存本地（`directionOptions`、`cycleDirection`、`persistedRef('mindmap-direction')`）。
- `computeGraphLayout` 先按折叠状态求出可见图，再用 Tarjan 缩点与最长路径分层；根节点钉在坐标原点，展开或折叠其它节点时根节点在画布上不动。
- 同层节点按子树块跨度排开：只累计紧邻下一列的子节点，且每个子节点只归第一个紧邻父级；多父节点取全部前向父级的中心均值。`limitGaps` 只压缩同一父级兄弟之间超过两个 `crossGap` 的空白（`blockSizeOf`、`blockBoundsOf`、`shareParent`）。
- 节点高度由 `measureNode` 按 canvas 实测像素折行算出，显示态与编辑态共用同一套断行（`wrapLines`），编辑中不截断行数。

### 画布

- 两种底纹互斥、各自开关：点阵固定 24px 点距，不随平移与缩放变化；坐标网格跟随平移缩放，原点取根节点出边按钮的圆心（布局仍以根节点左上角为基准，只平移读数），主刻度按 1/2/5×10ⁿ 自适应（相邻主刻度的屏幕间距不小于 100px），坐标轴与标签显示世界坐标（`mindmap-dot-grid`、`mindmap-coordinate-grid`、`gridOrigin`、`utils/canvasGrid.js`），机制见[任务图坐标网格](../dev/logic/mindmap-coordinate-grid.md)。画布可切浅色/深色，深色下点阵与网格线条转白。底色首次跟随 `prefers-color-scheme`，之后按手动选择保存（`mindmap-dark-canvas`）。
- 滚轮在选中节点或选中连线上缩放，其余位置上下平移；Ctrl/Cmd + 滚轮在任意位置缩放，触控板双指捏合也走这条分支。画布 `@wheel.prevent`，不会触发浏览器整页缩放（`onWheel`）。
- 右下角控件行最左侧是 `− 100% +` 缩放胶囊：百分比实时显示当前缩放（`zoomPercent`），± 按 1.2 倍等比、围绕可见区中心缩放（右栏浮层盖住的宽度不算中心），点百分比回到 100%；范围与滚轮一致（0.15–2.5），落点走 `animateView` 缓动并写入 `mindmap-view:v2`（`zoomTo`、`zoomIn`、`zoomOut`、`resetZoom`）。
- 拖拽空白处或根节点平移，右下角「适应视图」按钮复位。

### 节点

- 悬停是半透明绿色描边，选中是同色实线加淡绿底，两者同为 2px，只差透明度。
- 选中后节点右侧出现竖三点按钮，悬停也会露出；右键直接唤出菜单。菜单含重命名、新建子任务、复制为 Markdown、删除任务，靠近边缘自动翻转（`MENU_ITEMS`、`openNodeMenuAt`）。
- 未完成任务的勾选框描边按紧急度着色：一天内（含逾期）红、三天内橙、一周内蓝，一周以外与无截止日期沿用中性灰；已完成仍是绿色实心勾。截止时间与倒数日放在节点更多菜单顶部的只读信息行（如「11月21日 23:59 明天到期」，倒数日同色系），根节点没有勾选框与菜单，因此不显示提示（`deadlineUrgency`、`deadlineCountdown`、`formatDeadlineDateTime`、`URGENCY_CHECK_CLASS`、`URGENCY_TEXT_CLASS`；节点数据由 `TodoGraph.vue` 的 `mapNode` 透传 `deadline`）。
- 出边一侧有圆形控件：有子任务时是折叠开关，叶子节点在指针接近时显示加号；按钮中心就是连线起点（`controlPointFor`、`updateLeafControlHover`、`LEAF_CONTROL_REVEAL`）。
- 原地编辑使用常驻 textarea：Enter 提交、Esc 取消、Shift+Enter 插入硬换行；节点随内容长高，不出现内部滚动条（`onEditKeydown`、`commitEdit`）。
- 新建节点：Enter 建同级并落在当前节点之后；Tab、出边加号、菜单「新建子任务」建子级并追加到同级末尾，不受任务列表「新建置顶」影响（`TodoGraph.vue` 的 `createTask`，机制见[任务顺序](../dev/logic/task-order.md)）。

### 聚焦与右栏

- 选中任务的聚焦固定为三栏视野（父级、当前、子级各一栏）：选中节点在中间栏，横向以画布整宽居中，纵向保留当前屏幕位置，只有移出视口时才夹回可见范围；窗口缩放或侧栏开合这类画布尺寸变化时重新贴合（`focusTargetFor`、`centerOnNode`、`followColumnFocus`）。
- 详情右栏是浮层，不挤压画布，也不影响三栏聚焦；适应视图与节点菜单按 `detailPanelInset` 避让，右下角视图控件随面板左移（`utils/detailPanelContext.js`）。

## 拖拽与连线

- 拖节点时指针处显示影子副本，原节点降到 0.3 透明度；只有从折叠/加号按钮拉线才画预览线。预览线复用正式连线的三次贝塞尔规则（`previewCurve`）：起点沿出边法线离开、终点水平收尾，箭头与正式连线进入节点时同向，拖动期间用强调色加粗高亮（`dragState.shadow`、`nodeOpacity`）。
- 落点按指针在目标节点内的纵向位置分派：上/下四分之一是前后插序，中间才是拖进节点；根节点没有兄弟序列，只按拖进处理（`dropPositionAt`）。
- 前后插序只重排落点所在父级的 `child_ids`，拖动时在落点插入占位槽、兄弟节点真实让位（`dragState.dropPosition`、`insertDropPlaceholder`、`TodoGraph.vue` 的 `dropTask`）。
- 拖进节点按源任务的父级数量分派：单父直接移动且不弹提示；多父只追加链接，提示条可撤销，并提供「改为移动（断开旧连接）」（`TodoGraph.vue` 的 `findParentIds`）。
- 按钮拉线只建链接，不移动原父级；命中按指针点到节点矩形的距离判定，允许 24 屏幕像素误差（按缩放折算、上限 48 图内单位），多个候选取最近者（`linkTargetAtRect`）。
- 拖进节点或按钮拉线写入成功后，落点父节点若处于折叠状态会自动展开；同时把新边作为 `newEdge` 传给导图，走与点击连线相同的选中路径（`TodoGraph.vue` 的 `revealNewLink`、`MindMapWrapper.vue` 的 `newEdge` 监听），新连线带强调色、加粗与中点删除按钮。根任务发出的边不可删除，只高亮。
- 预览线终点就是指针位置，也就是新节点将出现的位置，不再向前出头。
- 目标已在源任务子树内会成环，直接拦截并提示；`isRef` 引用节点不能作为拖拽起点或落点。

## 键盘与剪贴板

- 主方向键进入子级或回到父级，交叉方向键在同级之间移动，方向随左右布局翻转；`Enter` 新建同级、`Tab` 新建子级、`F2` 或双击重命名、`Delete`/`Backspace` 删除、`Space` 切换完成、`Esc` 取消选中。
- 选中节点后 `Ctrl/Cmd+C` 把该节点及全部后代标题复制为 Markdown 列表，每层缩进两个空格；不受折叠影响，跳过引用节点并防环。剪贴板优先 `navigator.clipboard`，非安全上下文退回 `execCommand`。

## 任务表

- 行卡片使用 `rounded-lg` 与较轻阴影；选中行沿用侧栏激活样式：绿色浅底、绿色文字、左缘 2px 实线，选中态与普通行共用同一组阴影值，切换时不跳动。
- 完成状态为圆形勾选圈，多选使用方形选择框；未设截止时只显示日历按钮，已设时按逾期/今天/以后分别用红/绿/中性色。
- 子任务按层级画树状连线：每层一条竖线，祖先层仍有后续兄弟时竖线贯穿整行，末位兄弟在行中心收成 └ 角并横接到卡片左缘；折叠或完成后连线随可见行重算（`visibleRows`、`guideLeft`、`itemGuideStyle`、`elbowStyle`，机制见[任务表树状连线](../dev/logic/task-list-tree-lines.md)）。
- 有子任务的行在卡片左侧放圆圈 +/− 折叠开关，开关中心正好落在树状连线的交叉点上；顶层行没有连线，开关仍停在卡片前的同一列，快速添加栏与卡片左缘对齐。已完成区使用同款卡片与圆形勾选（`TodoListItem.vue`、`TodoList.vue`、`Trash.vue`、`TodoHeap.vue`）。

## 日程与堆视图

- 日程视图只展示 `schedules` 事件并按开始日期分组；堆视图按截止时间、完成进度、子任务复杂度打分排序（`utils/priorityCalculator.js`）。
