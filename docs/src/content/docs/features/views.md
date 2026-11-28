---
title: "视图与交互"
---
# 视图与交互

本页说明任务图、任务表、日程与堆视图的当前实现与关键落点。使用方法见[视图详解](../user/views.md)。

## 任务图

### 布局

- 只有两种横向布局：从左到右、从右到左。工具栏方向按钮在两者间轮换，选择存本地（`directionOptions`、`cycleDirection`、`persistedRef('mindmap-direction')`）。
- 布局模式在右下角视图控件里轮换：紧凑布局（默认，层叠图标）、标准布局（层级图标）、平衡布局（滑杆图标），按钮只显示图标、悬停看模式名，选择存本地（`layoutModeOptions`、`cycleLayoutMode`、`persistedRef('mindmap-layout-mode')`）。三种模式共用渲染层，算法在 `utils/mindmapLayout.js`，机制见[任务图布局逻辑](../dev/logic/mindmap-layout.md)。
- `computeGraphLayout` 先按折叠状态求出可见图，再用 Tarjan 缩点与最长路径分层；根节点钉在坐标原点，展开或折叠其它节点时根节点在画布上不动。
- 紧凑布局分三步：先按树边排版（子树块留位、父节点居中于树子节点带），再把多父节点放到所有父级中心的平均位置（高权重，邻居让位），最后交替收敛、按真实节点边缘回收空白，最长连线与分支间距明显缩短。
- 平衡布局以标准布局（兄弟块完全压紧）打底，再做 3 轮有界父子吸引（单轮 ≤120px），高度约降 25%、父节点居中略松，适合长分支较多时使用。
- 标准布局是经典思维导图：子树按真实占地递归排布，父节点严格居中于子节点带；多父节点取所有父级中心平均并整块平移，普通兄弟块默认不压紧（`REPACK_RATIO = 0`），避免把父级推离，最后只按节点真实边缘补足重叠（`blockOf`、`membersOf`、`repackAroundPinned`、`separateLayer`）。
- 节点高度由 `measureNode` 按 canvas 实测像素折行算出，显示态与编辑态共用同一套断行（`wrapLines`），编辑中不截断行数。

### 画布

- 两种底纹互斥，共用一个底纹按钮：循环 点阵 → 坐标网格 → 关闭（`cycleBackground`、`backgroundLabel`）。点阵点距 24px × 当前缩放倍率，整层位置随视口平移；屏幕点距不足 16px 时把世界点距按 2 的幂翻倍（点仍落在世界坐标整数倍上），放大变稀疏则不调整；坐标网格跟随平移缩放，原点取根节点出边按钮的圆心（布局仍以根节点左上角为基准，只平移读数），主刻度按 1/2/5×10ⁿ 自适应（相邻主刻度的屏幕间距不小于 100px），坐标轴与标签显示世界坐标（`mindmap-dot-grid`、`mindmap-coordinate-grid`、`gridOrigin`、`utils/canvasGrid.js`），机制见[任务图坐标网格](../dev/logic/mindmap-coordinate-grid.md)。画布底色与页面画布同色、深浅跟随全局主题，深色下点阵与网格线条转白，没有独立按钮。
- 滚轮在选中节点或选中连线上缩放，其余位置上下平移；指针停在右上角缩放器或右下角视图控件上时滚轮也缩放（围绕可见区中心，与 ± 按钮一致）；Ctrl/Cmd + 滚轮在任意位置缩放，触控板双指捏合也走这条分支。画布 `@wheel.prevent`，不会触发浏览器整页缩放（`onWheel`、`data-mm-view-controls`）。
- 画布右上角是 `− 100% +` 缩放胶囊：百分比实时显示当前缩放（`zoomPercent`），± 按 1.2 倍等比、围绕可见区中心缩放（右栏浮层盖住的宽度不算中心），点百分比回到 100%；范围与滚轮一致（0.15–2.5），落点走 `animateView` 缓动并写入 `mindmap-view:v2`（`zoomTo`、`zoomIn`、`zoomOut`、`resetZoom`）。
- 拖拽空白处或根节点平移；右下角目标按钮在全景与聚焦根节点之间切换（`viewMode`、`toggleViewMode`）。
- 全景与聚焦根节点是右下角同一个目标按钮的两档：全景整图带 48px 内边距、最大放大 1.25 倍（`fitView`）；聚焦根节点把根节点摆到可见区中央、缩放固定 100%，可见区更窄时按可用宽度缩小（`focusRoot`）。停在根节点档时按钮转绿，手动缩放/平移后回到自由视角，再点一次先回全景。
- 同一行最左侧的展开/收起全部按钮按四箭头图标区分方向：展开全部（四箭头向外）后自动回到全景，收起全部（四箭头向内）后只剩根节点并聚焦它（`expandArrows`、`collapseArrows`、`toggleAllCollapse`）。

### 节点

- 悬停是半透明绿色描边，选中是同色实线加淡绿底，两者同为 2px，只差透明度。
- 节点右侧常驻竖三点按钮（根节点没有），悬停只把图标加深、打开菜单时转绿；右键节点直接唤出菜单。菜单含完成任务树、设置日期、新建子任务、复制节点树、删除任务，靠近边缘自动翻转；「设置日期」把日期面板挂到菜单原位置展开，有截止时带出当前值（`MENU_ITEMS`、`openNodeMenuAt`、`openMenuDatePicker`）。
- 节点支持多选：Ctrl/⌘ 切换、Shift 以上一个选中节点为锚点连选同父兄弟（累加选择，跨父级只追加点击节点）、Ctrl/⌘ + 拖拽画矩形框选（边画边选，碰到即追加）；多选后在任一选中节点上右键，菜单换成「复制选中节点 / 删除选中任务」，Delete 与 Ctrl+C 也作用于整批（批量复制只复制选中节点本身，不含子节点）。多选与详情面板的单选相互独立，机制见[任务图节点多选](../dev/logic/graph-multi-select.md)。
- 未完成任务的勾选框描边按紧急度着色：一天内（含逾期）红、三天内橙、一周内黄，一周以外与无截止日期沿用中性灰；已完成仍是绿色实心勾。节点右区（三点按钮左侧）显示与任务行同款的截止胶囊：有截止就显示，文案沿用「今天 / 明天 / 3天后 / M月D日」，配色按剩余天数分级（逾期红、3 天内橙、7 天内黄、更远用蓝色）；点胶囊展开日期面板；悬停时左侧的时钟图标原地换成 ×，点击直接清除，面板里不再有「清除」。胶囊比列表里的略小（10px 字号、20px 高），宽度按文案量出，节点正文据此让位。节点更多菜单不再显示截止信息；根节点没有勾选框，也不显示胶囊（`deadlineChipClass`、`chipChrome`、`chipTextWidth`、`applyNodeDeadline`；节点数据由 `TodoGraph.vue` 的 `mapNode` 透传 `deadline`，写回走 `set-deadline`）。
- 出边一侧有圆形控件：有子任务时是折叠开关，叶子节点在指针接近时显示加号；按钮中心就是连线起点（`controlPointFor`、`updateLeafControlHover`、`LEAF_CONTROL_REVEAL`）。
- 原地编辑使用常驻 textarea：Enter 提交、Esc 取消、Shift+Enter 插入硬换行；节点随内容长高，不出现内部滚动条（`onEditKeydown`、`commitEdit`）。已完成节点编辑时按正常文字显示，不套完成态的变灰、删除线与淡出。
- 新建节点：Enter 建同级并落在当前节点之后；Tab、出边加号、菜单「新建子任务」建子级并追加到同级末尾，不受任务列表「新建置顶」影响（`TodoGraph.vue` 的 `createTask`，机制见[任务顺序](../dev/logic/task-order.md)）。
- 连续新建自动编号：同级新建续当前节点标题末尾的数字（`步骤 2` → `步骤 3`，已占用的编号跳过），当前标题没有数字则用 `新任务 1`、`新任务 2`；子级没有同级参考，按目标父级的子任务编号（`utils/taskTitle.js` 的 `nextTaskTitle`，机制见[任务创建逻辑](../dev/logic/task-create.md)「连续新建时的标题编号」）。

### 选中、编辑与右栏

- 选中只保证可见：图内单击不移动视口；从列表/侧栏选中或键盘导航时，节点完整可见就不动，出界才最小平移带回，节点比可见区还大时才缩小并居中（`ensureNodeVisible`、`utils/mindmapView.js` 的 `revealView`），机制见[任务图选中项的可见性修正](../dev/logic/mindmap-selection-visibility.md)。
- 任务行菜单「在任务图中查看」先选中该任务，再带 `?focus=<id>` 切到任务图；图挂载后按 `focus` 把节点居中并固定 100% 缩放（被折叠时先展开祖先链），定位完即清掉目标（`Todo.vue` `jumpToGraph`、`TodoGraph.vue` `focusTaskId`、`MindMapWrapper.vue` `pendingFocusId`、`centerNodeAtFullScale`）。
- 图内删除单个节点后焦点落到最近的兄弟：下一个优先、其次上一个、一个都没有就回到父任务（父级是根任务时取消选中）；批量删除仍清空选中（`TodoGraph.vue` 的 `deleteTask`、`utils/taskGraph.js` 的 `findDeleteFocusId`），机制见[任务图删除后的焦点落点](../dev/logic/graph-delete-focus.md)。
- 双击 / F2 进入编辑时会补到可读档位（`readableScale`，宽视口最多放大到 100%），以节点中心为锚点只放大不移动，见[任务图编辑时的缩放档位](../dev/logic/mindmap-edit-scale.md)。
- 详情右栏是浮层，不挤压画布；浮起时底色半透明并轻微模糊背后内容（面板传 `floating`，`bg-surface/80` + `backdrop-blur-sm`），宽屏停靠时保持实底；适应视图、选中项可见性修正与节点菜单按 `detailPanelInset` 避让，右下角视图控件与右上角缩放器随面板左移（`utils/detailPanelContext.js`）。
- 右栏内容按「详情 / 描述 / 子任务」三段折叠栈排列：详情按内容定高，描述占满剩余高度，子任务固定 192px；标题行带 chevron，点击折叠，状态存本地 `detail-sections`（`utils/sectionStack.js`、`components/SidebarSectionHeader.vue`）。

## 拖拽与连线

- 拖节点时被拖的节点以**实心卡片**跟着指针走（抓取点与原件保持同一相对位置），原位置的节点降到 0.3 透明度；只有从折叠/加号按钮拉线才画预览线。预览线复用正式连线的三次贝塞尔规则（`previewCurve`）：起点沿出边法线离开、终点水平收尾，箭头与正式连线进入节点时同向，拖动期间用强调色加粗高亮（`dragState.shadow`、`nodeOpacity`）。
- 拖节点的落点以**被拖实节点的中心**为准（不看鼠标位置），按影子与节点是否有纵向重叠分两类：中心落在节点**出边侧 1/3 带**（右展开是右侧，含该侧外侧）走拖入命中，成为它的子级（不设竖直重叠比例阈值）；中心落在其余位置（中间 1/3 与入边侧 1/3）走兄弟命中，插到它前/后（方向按中心在它上半/下半），归它父级的兄弟槽位；多父任务取视图里最近的那条父链（`nearestVisibleParentId`）。拖到自己的任一父节点上静默无操作，根节点不接受落点（`findVerticalDropTarget`、`childEdgeBand`、`dragState.parentIds`）。
- 中心在父级可见子级列的空隙里（首子级上缘到末子级下缘，首/末外侧各放宽一小段）命中父节点，按越过几个子级插到对应序号；没有子级的节点还可以从它的出边区（节点外一小段）命中它本身（`findChildGapTarget`、`findLeafEdgeTarget`、`dragState.childBand`）。
- 拖动刚起步、指针还在源节点自己身上时不判定落点；插回原位（插入前后兄弟顺序相同）也不预览、不提交（`keepsOriginalOrder`）。
- 命中时统一显示插入预览（拖进节点、插到前后、插到子级之间都一样）：落点父级高亮，槽位出现与被拖节点同尺寸的虚线空位（浅底在下、虚线轮廓画在实节点之上，重合时也看得见），兄弟节点真实让位，同时从父级到该槽位拉一条虚线链接；被拖的实节点始终跟着指针；落点父级折叠时保持折叠，只在出边方向放出虚节点，与落到叶子节点上的表现一致（`insertDropPlaceholder`、`dropPreviewLink`）。机制见[任务图拖拽命中与空隙预览](../dev/logic/graph-drag-hit.md)。
- 前后插序只重排落点所在父级的 `child_ids`；拖动时统一插入与被拖节点等高的虚节点让兄弟让位，不再单独画 20px 的前后插序小槽（`insertDropPlaceholder`、`TodoGraph.vue` 的 `insertIntoParent`）。
- 拖进节点按源任务的父级数量分派：单父直接移动且不弹提示；多父只追加链接，提示条可撤销，并提供「改为移动（断开旧连接）」（`TodoGraph.vue` 的 `findParentIds`）。
- 父级槽位落点提交锚点插入：已是该父级子任务就按锚点重排；单父任务移动到该序号；多父任务只在该序号加一条链接，提示与拖进节点一致（`TodoGraph.vue` 的 `insertIntoParent`）。
- 按钮拉线只建链接，不移动原父级；命中按指针点到节点矩形的距离判定，允许 24 屏幕像素误差（按缩放折算、上限 48 图内单位），多个候选取最近者（`linkTargetAtRect`）。
- 拖进节点或按钮拉线写入成功后，落点父节点若处于折叠状态会自动展开；同时把新边作为 `newEdge` 传给导图，走与点击连线相同的选中路径（`TodoGraph.vue` 的 `revealNewLink`、`MindMapWrapper.vue` 的 `newEdge` 监听），新连线带强调色、加粗与中点删除按钮。根任务发出的边不可删除，只高亮。
- 预览线终点就是指针位置，也就是新节点将出现的位置，不再向前出头。
- 目标已在源任务子树内会成环，直接拦截并提示；`isRef` 引用节点不能作为拖拽起点或落点。

## 键盘与剪贴板

- 主方向键进入子级或回到父级，交叉方向键在同级之间移动，方向随左右布局翻转；`Enter` 新建同级、`Tab` 新建子级、`F2` 或双击重命名、`Delete`/`Backspace` 删除、`Space` 切换完成、`Esc` 取消选中。
- 选中节点后 `Ctrl/Cmd+C` 把该节点及全部后代标题复制为 Markdown 列表，每层缩进两个空格；不受折叠影响，跳过引用节点并防环。剪贴板优先 `navigator.clipboard`，非安全上下文退回 `execCommand`。
- 选中节点后 `Ctrl/Cmd+V` 把剪贴板文本建成该节点的子任务：复制的 Markdown 列表还原成多层子树，其它纯文本建成单个子节点；粘贴组按剪贴板顺序接在原有子级之后，多选时取第一个选中节点作为父级，机制见[任务图粘贴为子任务](../dev/logic/graph-paste.md)。

## 任务表

- 行卡片使用 `rounded-lg` 与较轻阴影；选中行沿用侧栏激活样式：绿色浅底、绿色文字、左缘 2px 实线，选中态与普通行共用同一组阴影值，切换时不跳动。
- 完成状态为圆形勾选圈；未设截止时只显示日历按钮，已设时按剩余天数分级着色：逾期红、3 天内橙、7 天内黄、更远蓝色，与任务图紧急度同一色系（`deadlineChipClass`）。
- 截止时间入口直接展开自建月历面板：预设今天、明天、一周后与清除都在面板内，支持键盘与快捷时间点，替换了原生 `datetime-local`（`DateTimePicker.vue`，机制见[日期时间选择器](../dev/logic/date-time-picker.md)）。
- 行卡片最左侧的圆形槽位按子任务切换：有未完成子任务时显示 +/− 折叠开关，子任务全部完成或本来就是叶子时显示圆形勾选圈；整表展开/折叠按钮同样只统计还有未完成子任务的行（`TodoListItem.vue` `hasActiveChildren`、`TodoList.vue` `foldableTasks`）。
- 子任务按层级画树状连线：每层一条竖线，祖先层仍有后续兄弟时竖线贯穿整行，末位兄弟在行中心收成 └ 角并横接到卡片左缘；折叠或完成后连线随可见行重算（`visibleRows`、`guideLeft`、`itemGuideStyle`、`elbowStyle`，机制见[任务表树状连线](../dev/logic/task-list-tree-lines.md)）。
- 折叠开关收在卡片内、占据勾选圈的位置，圆心距卡片左缘 18px，正好与下一层竖线对齐，不再露在卡片外面；顶层行没有连线，圆钮仍按同一列对齐。已完成区使用同款卡片与圆形勾选（`TodoListItem.vue`、`TodoList.vue`、`Trash.vue`、`TodoHeap.vue`）。
- 单选待办任务后可用键盘新建：Tab 建子级（追加到同级末尾）、Enter 建兄弟（落在当前行之后）；焦点在输入框、按钮或菜单里时不抢键，多选与已完成行不触发。新建前会展开目标父级（折叠时新行本来就不可见），新任务自动选中并进入行内编辑（`TodoList.vue` `handleListKeydown`、`addSubtask`、`createSibling`、`pendingEdit`；`TodoListItem.vue` `editRequest`）。
- 行内竖三点「更多」菜单依次是「添加子任务 / 标记完成 / 完成任务树 / 在任务图中查看 / 脱离父任务 / 删除任务」；「完成任务树」沿 `child_ids` 把任务与全部后代中未完成的项一起完成，已完成的保留原完成时间，图标为叠加双勾（`AppIcon` 的 `checks`），见[完成任务树](../dev/logic/task-complete-tree.md)；「在任务图中查看」先选中该任务，再带 `focus` 查询切到任务图并居中到 100%（`TodoListItem.vue` `emitJumpToGraph`、`emitCompleteTree`、`TodoList.vue` `handleJumpToGraph`、`completeTaskTree`、`Todo.vue` `jumpToGraph`）。
- 「待办」标题栏右侧放整表操作：日期筛选按钮（只看带截止时间的任务，开启后整表变成按截止时间升/降序的无层级平铺列表）、升/降序箭头（筛选关闭时禁用），以及全部展开/折叠圆圈按钮（与任务行开关同尺寸；显示 + 表示当前全部收起、− 表示全部展开），一次作用于整张列表（`dateOnly`、`dateOrder`、`flattenTasksByDeadline`、`foldableTasks`、`allCollapsed`、`toggleAllCollapsed`）。
- 平铺筛选期间关闭层级写入：菜单「添加子任务」置灰，Tab/Enter 新建与拖拽都不响应（`TodoListItem.vue` 的 `disableAddSubtask`、`disableDrag`，`TodoList.vue` `handleListKeydown`），避免在看不到层级时改动父子关系与手动顺序。

## 侧栏分组

任务与日程的左侧栏和 AI 共用同一套折叠栈（机制见[侧栏开合与窗口宽度](../dev/logic/layout-sidebar.md)）：

- 任务只有「视图」一组，点击标题可折叠；展开时占满侧栏剩余高度。
- 日程有「概览」「说明」两组：都展开时「概览」占满剩余高度，「说明」固定 192px 并在内部滚动；全部折叠时两行标题贴顶。
- 展开与折叠有约 200ms 高度过渡，折叠状态保存在本地 `sidebar-sections`。

## 日程与堆视图

- 日程视图只展示 `schedules` 事件并按开始日期分组；堆视图按截止时间、完成进度、子任务复杂度打分排序（`utils/priorityCalculator.js`）。
