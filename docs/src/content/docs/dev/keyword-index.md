---
title: 关键词索引
---

# 关键词索引（用户说法 → 代码位置）

用户描述界面细节时通常只给现象，不给文件名，例如「节点垃圾桶上悬停时变红」。本索引把这类**用户原话**直接映射到代码位置，先查这里再打开目标文件，避免每次从头搜索。

## 使用与维护

- **查**：拿用户原话里的名词、动词、颜色、控件名在本文件里搜索（如 `grep -n "垃圾桶" docs/src/content/docs/dev/keyword-index.md`），命中后按「位置」直接打开。
- **记**：按用户原话定位到代码后，把「说法 → 位置」补进最贴近的分组。只记可复用的对象与位置，不抄实现细节。
- **并**：用户换了说法指同一个对象时，把新词追加到同一条的「用户可能说」列，用 ` / ` 分隔，不新增重复行。
- **位置写法**：`文件` + 锚点。锚点优先用模板注释原文、函数名或可直接搜索的 class，少用行号，避免代码一动就失效。
- **校验**：`nub run check:keywords` 逐条检查「位置」列里 `代码路径`「锚点」与 `[文档](x.md)`「锚点」。锚点必须逐字照抄代码注释原文，不能意译；代码注释改了，索引同一轮改掉，否则校验报错。

## 整体布局

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 活动栏 / 左侧图标条 / 最左边一竖条 | `pages/Todo.vue`「左侧活动栏」注释；`activeSection`、`activeView` | 清单、日程、AI、回收站的入口；收起后由底栏按钮开回 |
| 侧栏 / 左栏 / 导航栏 / 抽屉 | `components/LeftSidebar.vue`；`pages/Todo.vue`「宽屏侧栏是常驻栏」「窄屏侧栏是覆盖内容的抽屉」 | 宽屏常驻并可拖宽，窄屏与任务图是浮层抽屉，两套状态互不覆盖；浮层时点外部（含画布空白）收起 |
| 侧栏拉宽 / 拖宽度 / 拖到收起 | `components/LeftSidebar.vue`「右缘拖拽条」、`useResizablePanel`；`utils/resizablePanel.js` | 拖过最小宽度（200px）继续拖一段即收起 |
| 技能区高度 / 上下拖动分隔条 / 技能栏太矮 | `components/LeftSidebar.vue`「技能：非首位展开时可拖拽调高」 | 分隔条在技能分组上缘；技能区排首位展开时占满高度，不显示分隔条 |
| 地址栏 / 网址 / URL / 路由地址 / # 后面的路径 | `router/index.ts`「应用页：静态基路径已由 vite base 提供」；`frontend/vite.config.ts`「应用挂在文档站点的 /app/ 子路径」；[应用地址与路由前缀](./logic/app-url.md)「两段前缀各管一层」 | 静态前缀 `/TodoHeap/app/` + hash 视图名，如 `#/graph` |
| 侧栏分组折叠 / 收起标题 / 视图分组 / 日程概览 / 日程说明 / 全部折叠贴顶 / 单栏展开占满 / 多栏统一高度 / 展开动画 / 展开过渡 | `components/LeftSidebar.vue` `collapsedSections`、`SIDEBAR_SECTIONS`、`sectionClass`、`sectionStyle`、`measureSectionHeights`、`openSectionHeight` | 任务、日程、AI 共用一套：全部折叠时标题贴顶；首个展开分区占满剩余高度，其余展开分区统一 192px，技能区沿用可拖拽高度；空间不足时首个分区至少保留标题行；高度以像素写入并做 200ms 过渡 |
| 顶栏标题 / 主区域标题 / 当前视图名 | `pages/Todo.vue` `activeViewTitle` | 各视图统一在顶栏显示名称 |
| 顶栏右侧操作 / 页面操作按钮 | `pages/Todo.vue` `#main-topbar-actions`；各视图里的 `Teleport defer to="#main-topbar-actions"` | 视图把自己的操作注入统一顶栏；主题与详情面板开关常驻在这一行，不随视图操作让位 |
| 详情面板 / 右栏 / 任务详情 | `pages/Todo.vue`「任务图：画布保持整宽」；`components/TodoDetailEditor.vue`；`utils/detailPanelContext.js` | 任务图始终浮层、不挤压画布，导图让适应视图、选中项可见性修正与节点菜单按 `detailPanelInset` 避开面板；其他视图宽屏挤压中栏、窄屏浮层；AI 与日程视图复用同一位置 |
| 空引用块 / 引用块删不掉 / 引用删不掉 / 删不掉的引用 / blockquote | `components/MilkdownEditor.vue` `liftEmptyBlockquote` | Backspace/Delete 把空引用块里的空段落抬出，引用块随之消失；机制见[Markdown 编辑器的空引用块](./logic/milkdown-empty-blockquote.md) |
| 底栏 / 状态栏 / 底部统计 / 进度条 | `pages/Todo.vue`「底栏统计」「底栏：导航开关、统计与同步状态」 | 根任务不计入统计 |
| 同步状态 / 断线 / 待同步 / 已同步 | `pages/Todo.vue` `syncState`；`components/SyncStatusIndicator.vue`；`stores/schedules.js` `syncStatus` | 底栏常驻；日程右栏只在写入失败时显示，写入期间只置灰「保存」；优先级：断线 > 日程写入失败 > 待同步 > 同步中 > 已同步 |
| 设置浮窗 / 设置弹窗 / 齿轮 | `pages/todo/Settings.vue`；`pages/Todo.vue`「设置浮窗」 | 地址栏 `tab` 参数控制，刷新可回到同一面板 |
| 轻提示 / toast / 撤销提示 | `pages/Todo.vue` `const toast = ref`、「轻提示：删除、完成、批量操作后」 | 删除等操作后可从提示里撤销；链接提示额外提供「改为移动」按钮 |
| 点空白关闭详情 / 点别处收起右栏 / 点画布收起侧栏 | `pages/Todo.vue`「点击中栏区域时关闭详情面板」、`handleCanvasBackgroundClick` | 浮起的侧栏与右栏点外部收起；画布自行阻止冒泡，空白点击由 `background-click` 事件补上，选中节点也会收起浮层导航 |

## 任务列表

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 快速添加 / 顶部输入框 / 回车添加 / 搜索任务 / 列表搜索 / 添加框搜索 / 模式切换 / 圆钮切搜索 / 放大镜 / 搜索高亮 / 命中文字标色 / 搜索框高度 / 搜索框变矮 / 添加框高度不一致 | `pages/todo/TodoList.vue`「快速添加 / 搜索：同一个输入框复用」「模式切换」「搜索结果数」、`addMode`、`isSearching`、`displayTree`、`toggleAddMode`、`handleAddEnter`、`handleAddEsc`；`utils/taskGraph.js` `filterTasksByTitle`；`components/MiddleEllipsis.vue` `highlight`、`segments` | 外观是一行任务，`min-h-[42px]` 保证新建与搜索两种模式同高：左侧圆钮在新建（+）与搜索（放大镜）之间切换，右侧新建时是日历与提交按钮；新建模式回车即存，任务挂根任务首位并自动选中进入行内编辑；搜索模式按标题过滤，命中任务连同祖先链显示、忽略折叠、不重复列回边行，标题里的命中片段加底色，回车选中第一条命中，Esc 先清空再退出搜索 |
| 添加任务按钮 / 待办条右边的加号 / 待办标题栏的加号 / 快速跳到添加框 | `pages/todo/TodoList.vue`「任务添加按钮」、`focusAddInput` | 点「待办」标题栏右侧的 + 回到顶部添加栏并把焦点放进输入框；搜索态先切回新建模式 |
| 新建任务排最上面 / 新任务在首位 / 最近添加先看到 | `stores/todos.optimistic.js` 的 `addTodo`；`supabase/migrations/20261118000200_create_todo_prepend.sql` | 列表入口本地与服务端都头插到父级 `child_ids`，机制与成本见[任务顺序](./logic/task-order.md) |
| 连续添加 / 标题自动编号 / 新任务 1 / 新任务重名 / 步骤 2 变步骤 3 / (新任务) 1 / 新建子任务标题 | `pages/todo/TodoGraph.vue` `createTask`；`pages/todo/TodoList.vue` `addSubtask`；`pages/Todo.vue` `createNewTask`；`utils/taskTitle.js` `nextTaskTitle`、`childTitlesOf` | 连续新建同级任务时续参考标题末尾数字；没有数字或没有同级参考时统一用默认标题 `新任务 N`（列表子任务、任务图子级、顶栏新建一致）；机制见[任务创建逻辑](./logic/task-create.md)「连续新建时的标题编号」 |
| 一键展开 / 一键折叠 / 全部展开全部折叠 / 没有可折叠的子任务 | `pages/todo/TodoList.vue` `foldableTasks`、`allCollapsed`、`toggleAllCollapsed` | 「待办」标题栏右侧的圆圈按钮，折叠的是整张列表；只统计还有未完成子任务的行，子任务全完成的任务按叶子处理，不参与整表展开/折叠 |
| 折叠开关 / 加号减号 / 展开按钮 / 展开按钮露在外面 / 展开按钮收进卡片 / 子任务都完成 / 叶子任务 | `components/TodoListItem.vue` `hasActiveChildren`、`isTaskDone`、`toggleExpand` | 任务行卡片最左侧的圆形槽位：有未完成子任务时显示 +/− 折叠开关，子任务全部完成或叶子任务显示圆形勾选圈；开关与勾选圈同尺寸同位置，圆心距卡片左缘 18px |
| 添加时设截止时间 / 先选日期再添加 | `pages/todo/TodoList.vue` `newTaskDeadline`、`toggleAddDeadlineMenu` | 选中后变成任务行同款截止标签，随任务一起创建 |
| 缩进 / 层级 / 子任务往里缩 | `components/TodoListItem.vue` `rowPaddingLeft`、`LEVEL_INDENT` | 层级来自树展开，缩进是纯展示；每层 28px（横线 10 + 卡片内圆钮圆心内距 18） |
| 折叠按钮 / 圆圈加减号 / 按钮在任务前面 / 开关对准树线交叉点 / 开关在勾选圈位置 | `components/TodoListItem.vue` `hasActiveChildren`、`toggleExpand`；`utils/taskCollapse.js` | 开关收在卡片内、占据勾选圈的位置，圆心距卡片左缘 18px，与下一层竖线对齐；圆圈内 +/−，折叠状态列表、图、回收站共享 |
| 复选框 / 打勾 / 完成 / 取消完成 | `components/TodoListItem.vue` `cycleStatus` | 完成判定看 `completed_at` 是否为空 |
| 圆形勾选圈 / 完成圈变圆 | `components/TodoListItem.vue` 模板内完成按钮 | 圆形表示完成状态，点击在完成/未完成之间切换 |
| 缩进引导线 / 层级竖线 / 子任务连到父级 / 树状连线 / 分支线 / 末位收角 / 竖线没对准勾选圈 / 连线应该从勾选圈下来 | `components/TodoListItem.vue`「树状连线」、`visibleRows`、`guideLeft`、`itemGuideStyle`、`elbowStyle` | 每层一条竖线，`LEVEL_INDENT = 28`：竖线 x 正好是上一级勾选圈圆心，横线再从竖线接到卡片左缘；祖先有后续兄弟时贯穿整行，末位兄弟在行中心收成 └ 角。只为看清层级，不参与拖拽；机制见[任务表树状连线](./logic/task-list-tree-lines.md) |
| 截止标签变色 / 逾期红 / 3 天内橙 / 7 天内黄 / 有日期蓝色 | `components/TodoListItem.vue` `deadlineChipClass`；`utils/deadline.js` `deadlineChipClass` | 逾期红、3 天内橙、7 天内黄、更远蓝色（有日期就着色），与任务图紧急度同色系；未设截止时只显示日历图标按钮 |
| 两态完成 / 点了变完成又变灰 | `components/TodoListItem.vue` `statusMap` | 行内先给即时反馈，再落库 |
| 已完成区 / 已完成收在下面 / 清除已完成 / 已完成卡片偏左 / 卡片左边缘没对齐 / 已完成按天分隔 / 完成日期分隔 / 按完成日分组 / 点日期收起 / 折叠某天已完成 / 删除单条已完成 / 已完成条目删除按钮 / 完成时间 / 几点完成的 | `pages/todo/TodoList.vue`「已完成：无内容时不占位」「[已完成按天分隔]」「「日期分隔可点」」「「完成时间」」「「已完成行删除」」、`clearCompletedTodos`、`completedGroups`、`toggleCompletedDay`、`deleteTodo`；`utils/completedGroups.js` `groupCompletedByDay`、`formatCompletionTime` | 已完成列表带 `pl-[22px]`，卡片左缘与待办行同一竖线；按 `completed_at` 的本地自然日分组，标题「今天 / 昨天 / M月D日（跨年补年份）+ 当天数量 + 分隔线」，最新的一天在最上面；行内右侧显示完成时分；点整行日期或分隔线收起/展开当天任务；每条右侧有删除按钮，单条软删除并可撤销 |
| 筛选 / 只看有日期 / 有日期的任务 / 按截止时间排序 / 升序降序 / 排序方向 / 筛选后没有层级 / 筛选里不能加子任务 | `pages/todo/TodoList.vue`「筛选」、`dateOnly`、`dateOrder`、`toggleDateOnly`、`toggleDateOrder`、`handleListKeydown`；`utils/todoSort.js` `flattenTasksByDeadline`；`components/TodoListItem.vue` `disableAddSubtask`、`disableDrag` | 「待办」标题栏右侧两个按钮：日历筛选只看带截止时间的任务，结果是无层级平铺列表并按截止时间升/降序，箭头切换方向（仅筛选开启时可用）；平铺期间菜单「添加子任务」置灰，Tab/Enter 新建与拖拽不响应；未筛选时保持手动顺序 |
| 多选 / Ctrl 多选 / ⌘ 多选 / Shift 连选 / Shift 多选无效 / 多选选中文字 / Shift 选到文字 / 批量删除任务 / 选中多个任务 / 多选按钮在哪 | `pages/todo/TodoList.vue`「待办/已完成标题栏的多选操作」、`handleRowClickCapture`、`handleRowMouseDownCapture`、`deleteSelectedTodos`、`removeSelection`；`utils/taskSelection.js` | Ctrl/⌘ 切换单个任务，Shift 在本分区内按可见行连选；组合键的 mousedown 被阻止，不会选中文字；普通点击会清空选择但记住锚点，下一次 Shift 从该行连选。选中后操作出现在各自分区的标题栏，机制见[任务多选](./logic/task-multi-select.md) |
| 行内菜单 / 三点 / 竖三点 / 竖向三点 / 更多操作 / 标记完成 / 完成任务及全部子任务 / 完成整棵子树 / 子任务一起完成 / 菜单里勾选任务 / 节点视图 / 从任务表跳到任务图 / 在图中看这条任务 / 跳转后居中 / 取消链接 / 断开父链接 / 取消链接后选中 / 断开后跳到另一个位置 / 多父节点 / 同一个任务出现两处 / 回边行 / 引用行 / 任务出现两次样式不一样 | `components/TodoListItem.vue`「更多菜单相关」/ `currentMenuEl` / `emitJumpToGraph` / `emitUnlink` / `selectableIdOf`；`pages/todo/TodoList.vue` `handleJumpToGraph`、`unlinkTask`；`pages/Todo.vue` `jumpToGraph`；`AppIcon` 的 `moreVertical` / `graph` / `unlink` / `check` | 任务行右侧常驻竖三点按钮，点外部关闭，与截止时间选择器互不遮挡；菜单含「标记完成 / 完成任务及全部子任务 / 节点视图 / 添加子任务 / 取消链接 / 删除任务」，「标记完成」勾选单条任务，「完成任务及全部子任务」沿 `child_ids` 把整棵子树里未完成的任务一起完成（已完成的保留原完成时间），完成后的行移出待办区，取消链接只在挂在父级下的行出现，断开本行所在的父链接，随后选中该任务让另一个父级下的那一行高亮。回边行与实体行同一套卡片外观（勾选圈、文字颜色、实线边框、行内操作一致），写操作都落到真实任务 ID。跳转先选中该任务再切到任务图，带 `?focus=<id>`，图挂载后把节点居中并固定 100% 缩放，机制见[任务图选中项的可见性修正](./logic/mindmap-selection-visibility.md) |
| 行内删除 / 删除任务 / 移入回收站 | `components/TodoListItem.vue` `emitDeleteTodo`；`pages/todo/TodoList.vue` 删除处理 | 软删除，进回收站 |
| 拖拽排序 / 拖成子任务 / 插到前后 | `components/TodoListItem.vue` `onDragStart`/`onDragOver`/`onDrop`；`utils/todoDrag.js` | 上四分位插前、下四分位插后、中间成为子任务 |
| 截止时间菜单 / 日期时间 / 时间选择器 / 月历 / 一周后 / 截止标签上的 × / 药丸上的叉 / 清除截止时间 | `components/DateTimePicker.vue`「时间选择器触发器」「胶囊上的清除」；`components/TodoListItem.vue` `applyDeadline`；`pages/todo/TodoList.vue` `applyAddDeadline`；`utils/datePicker.js` `buildMonthGrid` | 点日历按钮或截止标签直接展开月历面板，今天/明天/一周后与确定在面板内，没有上级菜单；截止标签有值时悬停把左侧时钟图标换成 ×，点击即清除（面板内不再出「清除」），机制见[日期时间选择器](./logic/date-time-picker.md) |

## 任务图（思维导图）

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 节点三点 / 图上更多操作 / 节点操作菜单 / 三点按钮被右侧面板挡住 / 更多操作点不开 / 右键菜单 / 图里完成整棵树 / 节点整棵树完成 | `components/MindMapWrapper.vue`「节点更多操作按钮」+ `MENU_ITEMS`、`toggleNodeMenu`、`openNodeMenuAt`、`menuAnchor`、`menuPosition`、`visibleWidth` | 竖三点常驻在节点右侧（根节点没有），悬停只把图标加深、打开菜单时图标转绿；点按钮菜单在按钮正下方居中，右键节点则从指针处展开，空间不足翻到上方、右侧夹进可见宽度，项为「完成任务及全部子任务 / 设置日期 / 新建子任务 / 复制节点树 / 删除任务」；「完成任务及全部子任务」把节点与全部后代中未完成的任务一起完成，已完成的保留原完成时间；多选后右键选中节点时菜单换成「复制选中节点 / 删除选中任务」 |
| 节点多选 / 图里多选 / Ctrl 选多个节点 / Shift 连选节点 / 框选 / Ctrl 拖拽框选 / 矩形多选 / 右键批量删除 / 批量复制选中节点 | `components/MindMapWrapper.vue`「节点多选」、`selectNode`、`multiSelectedKeys`、`menuBatch`、`BATCH_MENU_ITEMS`、`deleteSelectedNodes`、`copySelectedAsMarkdown`；`pages/todo/TodoGraph.vue` `deleteTasks` | Ctrl/⌘ 切换；Shift 累加选择，以上一个选中节点为锚点连选同父兄弟、跨父级只追加点击节点；Ctrl/⌘ + 拖拽矩形框选，边画边选、碰到即追加；多选复制只含选中节点本身、不含子节点；多选起点会自动带上当前单选节点，避免只看得到两个高亮但集合只有一个；多选与详情单选相互独立；右键选中节点出现批量菜单，Delete 批量删除、Ctrl+C 批量复制，机制见[任务图节点多选](./logic/graph-multi-select.md) |
| 图内删除任务 / 菜单里删除 / 删除后选中谁 / 删完焦点跑哪 | `components/MindMapWrapper.vue` `MENU_ITEMS` 的 `delete` 项、`emitDelete`；`pages/todo/TodoGraph.vue` `deleteTask`、`findDisplayedParentId`；`utils/taskGraph.js` `findDeleteFocusId` | 菜单项直接删除（软删除进回收站），键盘 Delete 走同一出口；删除后焦点落到下一个兄弟，没有就上一个，再没有落到父任务，机制见[任务图删除后的焦点落点](./logic/graph-delete-focus.md) |
| 连线删除 / 线中点叉号 / 断开父子关系 | `components/MindMapWrapper.vue` `confirmUnlink`、`onUnlinkClick`、`selectEdge` | 只从父任务 `child_ids` 移除引用；最后一个父级被摘掉时回顶层 |
| 加号 / 出边按钮 / 新建子任务 / 折叠计数 / 靠近就显示加号 / 拉线时加号消失 / 加号是绿色 / 新建按钮和展开按钮区分 / 绿色实心圆 / 鼠标移开就消失 | `components/MindMapWrapper.vue`「出边按钮」、`onToggleClick`、`holdLeafControl`、`updateLeafControlHover`、`draggingLeafId` | 有子任务时是中性灰的折叠开关；叶子节点指针靠近按钮位置即显示绿色实心圆 + 白色加号（与折叠开关区分），指针离开节点与邻近半径后立即消失，从加号拉线期间保持可见，拖到别的节点建立链接 |
| 双击重命名 / F2 改名 / 原地编辑 / Shift+Enter 换行 / 节点里打多行 / 编辑时节点撑高 / 编辑框出现滚动条 / 编辑已完成节点变灰 / 编辑时还有删除线 / 双击后变大 / 编辑时突然放大 / 编辑放大到 100% / 不要放到 110% / 编辑时缩放变了 | `components/MindMapWrapper.vue` `startEdit`、`commitEdit`、`onEditKeydown`、`measureNode`、`wrapLines`、`ensureEditScale`、`readableScale` | 节点文字常驻输入框，平时只读；编辑中节点随行数长高、不出现内部滚动条，Shift+Enter 插入手工换行，单回车提交；编辑态按正常文字显示，不套完成态的变灰与删除线；当前缩放小于可读档位时以节点中心为锚点抬到 `min(1, (可用宽−96)/节点宽)`（最多 100%），已放大则不缩小，见[任务图编辑时的缩放档位](./logic/mindmap-edit-scale.md) |
| 任务表键盘新建 / 列表按 Tab / 列表按 Enter / 选中任务后新建子任务 / 选中任务后建兄弟 | `pages/todo/TodoList.vue` `handleListKeydown`、`addSubtask`、`createSibling`、`moveNewTaskTo`、`pendingEdit`；`components/TodoListItem.vue` `editRequest`、`startEdit` | 单选待办任务且焦点不在输入框/按钮/菜单时，Tab 建子级（追加到同级末尾）、Enter 建兄弟（落在当前行之后）；新建后选中并进入行内编辑；多选、已完成行与修饰键不触发；插入规则见[任务顺序](./logic/task-order.md) |
| 键盘新建 / Enter 同级 / Tab 子级 / 新节点排第几 / Enter 新建插哪 / 新节点在末尾 | `components/MindMapWrapper.vue` `onKeydown`、`createSibling`、`createChild`；`pages/todo/TodoGraph.vue` 的 `createTask` | Enter 建同级落在当前节点之后；Tab、出边加号、菜单「新建子任务」追加到同级末尾，插入规则见[任务顺序](./logic/task-order.md) |
| 复制节点树 / 复制节点 / Ctrl+C / 复制成 Markdown | `components/MindMapWrapper.vue` `onKeydown` / `Ctrl+C` 分支、`copySubtreeAsMarkdown` | 单节点复制会连同子节点，输出 Markdown 列表 |
| 滚轮缩放 / 拖拽平移 / 画布移动 | `components/MindMapWrapper.vue` `onWheel`、`onPointerDown`/`onPointerMove` | 选中节点或连线后滚轮缩放，空白处平移 |
| 点节点画面会跳 / 选中后自动居中 / 三栏视野 / 选中就放大 / 节点跑出屏幕 / 键盘导航看不到选中项 | `components/MindMapWrapper.vue` `ensureNodeVisible`、`localSelection`；`utils/mindmapView.js` `revealView` | 选中只修正可见性：完整可见时视口不动，出界时最小平移、绝不放大，节点比可见区还大时才缩小并居中；图内点击不移动，只有图外选中与键盘导航会修正，见[任务图选中项的可见性修正](./logic/mindmap-selection-visibility.md) |
| 缩放控件 / 百分比 / 右上角加减号 / 100% 按钮 / 放大缩小按钮 / 重置缩放 / 控件上滚轮缩放 | `components/MindMapWrapper.vue`「缩放控件/百分比」、`zoomTo`、`zoomPercent`、`onWheel`、`data-mm-view-controls`；`controlsStyle` | 画布右上角的 `− 100% +` 分段胶囊，百分比实时读 `view.scale`；± 按 1.2 倍等比、围绕可见区中心缩放（右栏盖住的部分不算），范围 0.15–2.5，点数字回到 100%，新视口写入 `mindmap-view:v2`；指针停在缩放器或右下角视图控件上时滚轮也走缩放分支，同样围绕可见区中心；右栏浮起时按面板宽度左移 |
| 紧急程度 / 勾选框变色 / 红橙黄框 / 截止提示 / 截止胶囊 / 节点上的小字 / 倒数日 / 文字被挤窄 | `components/MindMapWrapper.vue`「勾选框」「截止胶囊」、`URGENCY_CHECK_CLASS`、`chipChrome`、`chipTextWidth`、`applyNodeDeadline`；`utils/deadline.js` 的 `deadlineUrgency`、`deadlineChipClass`、`formatDeadlineLabel` | 未完成任务的勾选框描边按紧急度着色：一天内（含逾期）红、三天内橙、一周内黄，一周以外/无截止/已完成沿用原样；节点右区（三点按钮左侧）是与任务行同款的截止胶囊，有截止就显示，文案「今天 / 明天 / 3天后 / M月D日」，配色按剩余天数分级，点开日期面板、悬停时左侧时钟图标换成 × 直接清除；胶囊比任务行略小（10px 字号、20px 高），宽度按文案量出并从正文宽度里扣除。根节点不显示 |
| 展开子节点 / 兄弟被推开 / 子树重叠 / 多父展开后空白 / 节点重叠 / 上下节点叠在一起 / 中间大段空白 / 两条分支隔得很远 / 图中间空一块 | `components/MindMapWrapper.vue` `computeGraphLayout` 的 `laneChildren`、`blockSizeOf`、`blockBoundsOf`、`shareParent`、`limitGaps`、`separateLayer` | 同层按子树块跨度推开兄弟；多父节点取全部前向父级平均定位；`limitGaps` 每层独立、自下而上把同父级兄弟超过 `2 × crossGap` 的可见边缘空白压回；`separateLayer` 再按节点真实边缘兜底，重叠时把下方块整体下移，避免压到别的父级分支 |
| 布局方向 / 左右翻转 | `components/MindMapWrapper.vue` `cycleDirection` | 阅读偏好本地保留，只有左右两向 |
| 紧凑布局 / 标准布局 / 平衡布局 / 布局模式 / 布局切换 / 排版模式 | `components/MindMapWrapper.vue` `layoutModeOptions`；`utils/mindmapLayout.js`；[任务图布局逻辑](./logic/mindmap-layout.md) | 右下角视图控件轮换两种模式，选择存本地；紧凑布局先按树排版、再多父归中、最后回收空白 |
| 连线弯绕 / 长线绕远 / 多父节点不居中 / 节点偏心 / 分支空白太大 / 父节点没居中 | [任务图布局逻辑](./logic/mindmap-layout.md) | 标准布局父节点严格居中、多父节点取平均；紧凑布局按真实节点边缘收敛，归中在邻居冲突时会被夹住 |
| 点阵背景 / 画布底纹 / 背景不动 / 点阵跟着画布走 / 背景太花 / 点太密 / 底纹按钮 / 点阵和坐标合并 | `components/MindMapWrapper.vue` `dotGrid`、`dotGridStyle`、`cycleBackground`、`backgroundLabel`、`mindmap-dots` 样式 | 右下角同一个底纹按钮循环切换 点阵 → 坐标网格 → 关闭，默认点阵开启、状态本地保存；点阵点距按当前缩放倍率放大、整层随视口平移，与内容同步移动缩放；缩到屏幕点距不足 16px 时把世界点距按 2 的幂翻倍抽稀，放大变稀疏则不再调整 |
| 坐标网格 / 坐标轴 / 刻度标签 / 图上有数字 / 网格跟着画布走 / 底纹按钮 | `components/MindMapWrapper.vue` `coordinateGrid`、`gridLayer`、`cycleBackground`、`mindmap-grid-*` 样式；`utils/canvasGrid.js` | 与点阵共用右下角同一个底纹按钮，循环到坐标网格时显示；默认关闭、状态本地保存；细线与主刻度跟随平移缩放，原点在根节点出边按钮圆心（`gridOrigin`），轴标签显示世界坐标，主刻度按 1/2/5 自适应，屏幕间距不小于 100px |
| 深色背景 / 暗色画布 / 背景颜色 / 想用深色底 / 画布底色跟随主题 | `components/MindMapWrapper.vue` 画布样式 `html[data-theme='dark'] .mindmap-canvas` | 任务图画布与页面画布同色（`--color-canvas` / `--color-canvas-dark`），深浅完全跟随全局主题，没有独立的画布背景按钮；深色下点阵与网格线条转白 |
| 适应视图 / 缩放到刚好 / 全景视图 / 聚焦根节点 / 目标按钮 / 右下角圆点按钮 | `components/MindMapWrapper.vue` `fitView`、`focusRoot`、`toggleViewMode`、`viewMode`、`helpOpen`、`controlsStyle`；`utils/detailPanelContext.js` 的 `detailPanelInset` | 右下角目标按钮在两档间切换：全景（`fitView`，整图 48px 内边距、最大 1.25 倍）与聚焦根节点（`focusRoot`，根节点居中、固定 100%，可见区更窄时按可用宽度缩小）；停在根节点时按钮转绿，点一次回全景；视图控件在右下角，提示收进按钮浮层；右栏浮起时按共享宽度左移，面板拖宽时跟随 |
| 全部展开 / 收起全部 / 四箭头图标 / 展开后全景 / 收起后只剩根节点 / 收起后聚焦根节点 | `components/MindMapWrapper.vue` `toggleAllCollapse`、`allExpanded`；`components/AppIcon.vue` `expandArrows`、`collapseArrows` | 工具栏的展开/收起全部按钮：展开全部用四箭头向外的图标，收起全部用四箭头向内；展开后 `nextTick` 里调 `fitView` 回到全景，收起后只剩根节点并调 `focusRoot` 聚焦它 |
| 选中高亮 / 祖先链 / 连线变色 / 选中连线盖住展开按钮 / 连接线压住折叠按钮 | `components/MindMapWrapper.vue`「连线铺在节点下层」「选中连线：与普通连线同层」 | 选中节点的祖先链用强调色；选中连线与普通连线同层铺在节点下层，不盖住节点外侧的折叠/展开按钮，只有中点删除按钮画在节点之上 |
| 节点悬停 / 鼠标移到节点上 / 悬停高亮弱一档 / 已完成节点悬停 / 完成节点文字太灰看不清 | `components/MindMapWrapper.vue` 节点 `g` 的 `group` + rect 的 `group-hover:stroke-accent-600/45`；完成态文字 `group-hover:text-neutral-800` | 悬停与选中同一个绿色、同样 2px 粗细，只靠透明度分强弱：悬停是半透明绿框、不改底色，选中是实绿框加淡底；已完成节点悬停时文字从灰恢复常色（删除线保留），便于看清内容 |
| 拖拽落点 / 预览线 / 拖到节点上 / 影子节点 / 拖拽残影 / 拖动时没有连线 / 插入占位槽 / 拖动时腾出空位 / 拖到子节点之间 / 子级空隙 / 空隙预览 / 等尺寸虚节点 / 虚线预览没出现 / 实节点跟鼠标 / 被拖节点不是实体 | `components/MindMapWrapper.vue` `dragState.shadow`、`dragState.preview`、`dragState.dropPosition`、`dragState.childBand`、`insertDropPlaceholder`、`dropPreviewLink`、`nodeAtPoint`、`onNodePointerDown`；`utils/mindmapDrag.js` `findChildGapTarget` | 拖节点时被拖的实节点卡片跟着指针走（原位节点淡出），不画线；指针落在父级可见子级列的空隙里（首子级上缘到末子级下缘，列外不算）时命中父节点：插入槽位出现与被拖节点同尺寸的虚线空位（虚线轮廓画在实节点之上）并真实让位，父级到该槽位拉一条虚线链接；其它位置没有落点，不再按影子接触判定；空隙按指针纵向位置判定，影子压到相邻子节点也不会被前后插序抢先；指针在节点内仍按上/下四分之一插序、中间拖进；只有从折叠/加号按钮建链接才画指针预览线，机制见[任务图拖拽命中与空隙预览](./logic/graph-drag-hit.md) |
| 拖拽排序 / 拖拽调整顺序 / 拖到前面 / 拖到后面 / 插到兄弟之间 / 插到子级中间 / 拖拽移动 / 拖节点换父级 / 单父节点拖动 / 移动后没提示 / 旧排序槽 / 绿色小槽 | `pages/todo/TodoGraph.vue` `dropTask`、`insertIntoParent`；`components/MindMapWrapper.vue` `dropPositionAt`、`childEdgeBand`、`insertDropPlaceholder`、`onDragEnd` | 拖节点落在目标中间成为子任务：单父任务直接移动且不弹提示，多父任务只建链接、提示里可选「改为移动（断开旧连接）」；落在节点内的上半/下半归目标所在父级的兄弟槽位（插到目标前/后），统一用与被拖节点等高的虚节点预览，不再画 20px 前后插序小槽，节点内也没有「拖进」区域；只重排目标所在父级的 `child_ids`；空隙落点按锚点插到对应子级序号，已在父级下只重排、单父移动、多父只加该序号的链接；根节点只接受拖进；从折叠/加号按钮拉线只建链接 |
| 拖拽建链接 / 按钮拉线 / 拉到附近就命中 / 影子碰到就命中 / 不用把鼠标放到节点上 | `components/MindMapWrapper.vue` `linkTargetAtRect`、`LINK_HIT_PADDING` | 拖节点不再按影子接触判定，只按指针位置（在节点内或子级列空隙）；从折叠/加号按钮拉线按指针点外扩 24 屏幕像素判定，多节点取中心最近；预览线终点就是指针位置，不再向前出头（仅按钮拉线） |
| 建链接后看不见连线 / 链接被折叠藏住 / 链接后自动展开 / 折叠父节点自动展开 / 新链接像被点击一样高亮 | `pages/todo/TodoGraph.vue` `revealNewLink`；`components/MindMapWrapper.vue` `newEdge` 监听、`selectEdge`；`utils/taskCollapse.js` `setTaskCollapsed` | 拖进节点或按钮拉线写入成功后展开折叠的落点，并把新边按点击选线处理：强调色、加粗与中点删除按钮一起出现；根任务的边不可删，只高亮 |

## 侧栏与 AI

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 会话列表 / 对话历史 / 新会话 | `components/LeftSidebar.vue`「对话会话：新建、切换、重命名、删除」 | 只显示时间与消息数 |
| 重命名会话 / 删除会话 | `components/LeftSidebar.vue` `startSessionRename`、`deleteSession` | 行内图标按钮 |
| 技能 / skill / 自定义指令 | `components/LeftSidebar.vue`「技能：非首位展开时可拖拽调高」、`startNewSkill`；`stores/agent.js` | 技能存 `user_settings.settings.skills`，只绑定工作模式 |
| 技能挂载 / 切模式 | `components/LeftSidebar.vue` `attachSkill`、`modeLabel`；`lib/agentModes.js` | 点技能会切到它绑定的模式，指令随该轮消息下发 |
| MCP 服务 / 外部工具 / 滴答清单连接 | `components/LeftSidebar.vue`「MCP 服务：非首位展开时使用统一高度」、`startNewMcp`；`lib/mcpServers.js` | 令牌只在请求内使用，不落库 |
| 消息气泡 / 工具执行记录 / 请求详情 | `components/AgentChat.vue` `toolLabel`、`callSummary` | 请求详情保留系统提示与工具结果原文 |
| 破坏性操作确认 / 弹确认框 | `components/AgentChat.vue` `pending` 与确认文案计算属性 | 删任务、删日程、切模式、外部 MCP 写入都先确认 |
| 上下文构成 / 占比 / 这一轮用了什么 / JSON 自动换行 / 字段太长看不到 | `components/AgentContextPanel.vue` | AI 视图右栏复用详情面板位置；头部换行图标切换源码块折行，偏好存 `ai-context-wrap` |
| 模型接入 / API Key / 测试连接 | `components/ProviderSettings.vue`；`stores/llm.js`；`lib/llmProvider.js` | 密钥只存浏览器本地 |
| ask_user / 让用户选一个 | `lib/agentTools.js` `ask_user` | Agent 工具内的选择面板 |

## 日程

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 日期切换 / 左右箭头 / 回到今天 | `pages/todo/ScheduleView.vue`「日期导航」、`goToDate` | 选中日期由路由 query 承载，刷新不丢 |
| 新建日程 / 加日程 / 添加日程 / 新建要等一下 / 新建中的停顿 | `pages/todo/ScheduleView.vue` `createSchedule`；`stores/schedules.js` `createSchedule`；`utils/scheduleRange.js` `defaultScheduleRange` | 顶栏「新建」与空状态按钮都走这里，按选中日期落「新日程」即开右栏，写库在后台完成，机制见[日程新建与临时 ID](./logic/schedule-optimistic-create.md) |
| 月历 / 圆点 / 有日程的日子 | `pages/todo/ScheduleView.vue`「月历总览」 | 只渲染选中日期所在月份，周一起头 |
| 按天分组 / 跨天事件算哪天 | `pages/todo/ScheduleView.vue`「跨天事件归入开始日」 | 与月历圆点口径一致 |
| 日程右栏 / 标题备注地点 / 编辑日程 | `components/ScheduleDetailPanel.vue` | 与任务选中互不干扰 |
| 时长 / 持续时间 / 结束时间 | `components/ScheduleDetailPanel.vue` `applyDuration` | 改时长按开始时间算出结束，快捷项 30 分钟 / 1 / 2 / 3 小时 |
| 更多选项 / 折叠字段 / 链接和提醒在哪 | `components/ScheduleDetailPanel.vue`「更多选项」 | 链接、状态、颜色、提醒默认收起，字段有值时自动展开 |
| 自动同步 / 默默同步 / 改完就存 | `components/ScheduleDetailPanel.vue`「自动同步：字段改动防抖写入」 | 改动 500ms 后静默写入；网络状态复用底栏同一枚徽章，非法草稿在本地提示 |
| 保存日程 / 保存后收起 / 关闭面板 | `components/ScheduleDetailPanel.vue`「立即同步当前草稿」 | 立即冲刷并收起右栏、清掉选中；同步失败留在面板显示原因 |
| 点击日程 / 展开右栏 / 日程详情 | `pages/Todo.vue`「浮层右栏点击面板外收起」`data-keep-detail-panel` | 选中即展开右栏，窄屏浮在内容上；同一次点击不会把它收起 |
| 点击空白 / 非日程区域 / 清除选中 / 收起日程详情 | `pages/Todo.vue`「日程视图：点非日程区域」`data-date-picker-panel` | 宽屏停靠时也清掉选中并收起右栏；面板、日程项、新建入口与日期选择器除外 |
| 删除日程 / 删日程确认 | `components/ScheduleDetailPanel.vue` `deleteSchedule` | 删除后收起面板并清掉选中项 |
| 日历导入导出 / ICS / 订阅链接 | `pages/todo/Settings.vue`「日历：ICS 导入导出与只读订阅链接」；`lib/ics.js`、`lib/calendarTransfer.js` | 订阅链接本身就是凭据，可重新生成或停用 |

## 回收站

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 恢复 / 撤销删除 / 批量恢复 | `pages/todo/Trash.vue` `handleRestoreWithCheck`、`restoreSelectedTodos` | 顶栏没有「恢复全部」，恢复入口随单选或多选出现；单条恢复会连带子任务 |
| 永久删除 / 彻底删除 / 清空回收站 | `pages/todo/Trash.vue` `handlePermanentDelete`；`stores/todos.js` | 不可恢复，操作前二次确认 |
| 无法恢复 / 父任务限制 / 越级删除 / 恢复到根节点 | `pages/todo/Trash.vue`「恢复限制提示」、`blockedParentId`；`stores/todos.optimistic.js` `restoreTodoToRoot` | 单条恢复遇到父任务也在回收站时先提示恢复父任务；批量恢复则自动把该任务恢复到根节点 |
| 回收站多选 / 批量恢复 / 批量永久删除 / 回收站 Ctrl 选择 | `pages/todo/Trash.vue`「回收站多选操作」、`handleRowClickCapture`、`restoreSelectedTodos`、`handlePermanentDeleteSelected`；`utils/taskSelection.js` | Ctrl/⌘ 切换、Shift 按可见行连选，操作出现在顶栏；批量恢复按树的从上到下顺序，父任务先恢复；批量永久删除先二次确认，机制见[任务多选](./logic/task-multi-select.md) |
| 回收站卡片样式 / 卡片比列表高 / 回收站缩进 / 回收站折叠按钮 / 删除时间不要胶囊 | `pages/todo/Trash.vue`「任务列表：卡片几何与任务表一致」 | 与任务表同款内距 `py-1.5`、行距 `space-y-1.5`；根行 22px、每层 28px；圆形 +/− 折叠，删除时间为纯文本，行内按钮常显 |
| 回收站分组 / 按删除日期分组 / 回收站日期分隔 / 回收站按天 | `pages/todo/Trash.vue`「回收站按天分隔」、`trashGroups`；`utils/trashGroups.js` `groupTrashByDay` | 按子树根的 `deleted_at` 本地自然日分组，子任务跟随父任务；日期倒序、未知时间最后；点标题行收起/展开，机制见[回收站按天分组](./logic/trash-day-groups.md) |
| 已删除任务的详情 / 灰掉只读 | `components/TodoDetailEditor.vue`「已删除任务时整个面板显示禁用光标」 | 已删除内容不可编辑 |

## 设置

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 账户 / 改密码 / 删除账户 | `pages/todo/Settings.vue` `activeTab === 'account'`、「修改密码」弹窗 | 删除账户走确认流程 |
| 模型设置 / 第三方模型 / 内置模型 | `pages/todo/Settings.vue`「模型接入」；`components/ProviderSettings.vue` | 支持 byok 直连与 builtin 网关两档 |
| 滴答清单导入 / 从 MCP 拉取任务 | `pages/todo/Settings.vue`「从滴答清单导入」；`lib/ticktickImport.js`、`lib/didaMcp.js` | 按外部任务 ID 更新，重复读取不产生重复条目 |
| 旧版备份导入 / CSV / JSON | `pages/todo/Settings.vue`「或导入旧版备份文件」；`lib/ticktickImport.js` | 预览确认后按清单分组写入 |

## 数据与同步

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 根任务 / 全部任务 / 顶层任务挂哪 | `utils/rootTask.js` `isRootTodo`、`findRootTodo` | 根任务不出现在列表、统计、回收站、Agent 输出里 |
| 子任务顺序 / 手动排序 / 新任务放哪 / 新节点排第几 | `stores/todos.js` 树构建；父级 `child_ids`；`pages/todo/TodoGraph.vue` 的 `createTask` | 数组顺序是手动顺序的唯一来源；列表新建插首位，节点图 Enter 落在当前节点之后、子级追加到同级末尾，机制见[任务顺序](./logic/task-order.md) |
| 插首位会不会变慢 / 顺序影响性能 / child_ids 是数组 | [任务顺序](./logic/task-order.md)「性能」 | 每次新建或重排都重写父级整个 `child_ids`，头插与尾插成本相同，当前规模可忽略 |
| 软删除 / 删除后还能找回 | `deleted_at`；`stores/todos.js` `trashTodos` | 删除是软删除，完成状态看 `completed_at` |
| 乐观更新 / 点了立即生效 | `stores/todos.optimistic.js` | 先改本地并入队，再写 Supabase |
| 失败回滚 / 操作失败恢复原样 | `stores/todos.rollback.js` | 与乐观更新成对出现 |
| 离线队列 / 断网后重试 / 待同步 | `stores/syncQueue.js` | localforage 持久化，带退避重试 |
| 临时 ID / id 替换 / 新建任务 ID | `stores/syncQueue.js` `generateTempId`、`id-replaced` 事件 | `client_key` 保证同一用户下创建幂等 |
| 新建后多出一条根链接 / 新任务先连到根节点 / 刷新后正常 | [任务创建逻辑](./logic/task-create.md)「父级 child_ids 更新的顺序约束」 | 父级 `UPDATE` 若与 `ADD` 并行，会写入负数临时 ID 并用旧快照覆盖父级；任务失去父链接后导图把孤儿挂到根节点 |
| 幽灵链接 / 新任务多出一条无关父链接 / 挂在旧任务下 | [任务创建逻辑](./logic/task-create.md)「临时 ID 编号与残留清理」 | 父级 `child_ids` 里的历史负数临时 ID 与本次临时 ID 撞号，ID 替换时被一起改成了新任务 |
| 新建后打字被打断 / 编辑框突然失焦 / 同步后输入中断 / 已输入内容被覆盖 | [任务创建逻辑](./logic/task-create.md)「换号时保持编辑态」；`components/TodoListItem.vue` `ignoreBlurAfterReplace` | 节点与任务行按 `client_key` 稳定渲染，换号不重建输入框；任务表换号后恢复原选区而不是全选，并忽略换号补发的失焦直到用户再次操作 |
| 实时同步 / 多端刷新 | `stores/todos.realtime.js` | Supabase Realtime 订阅与重连 |
| 递归删除 / 删父删子 | `stores/todos.optimistic.js`；`utils/taskGraph.js` `collectDescendantIds` | 级联范围由任务树决定 |

## 通用样式与图标

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 主题色 / 绿色 / 强调色 / accent | `frontend/src/style.css` `@theme` 的 `--color-accent-*` | 绿色是唯一强调色，只出现在交互与状态上 |
| 危险色 / 红色 / 删除红 / danger | `frontend/src/style.css` `--color-danger-*` | 只用于删除等不可逆确认态 |
| 暗色模式 / 深色 / 自动 / 跟随系统 / 主题切换 / 顶栏主题按钮 / 顶栏主题菜单 / 右上角日/月图标 | `pages/Todo.vue`「顶栏主题按钮」`selectTheme`、`cycleTheme`；`frontend/src/utils/theme.js` 的 `nextThemeMode`；`frontend/src/style.css` 的 `data-theme`；组件里的 `dark:` 类 | 顶栏右侧图标按钮显示当前模式，悬停展开下拉菜单按浅色/深色/自动排列，鼠标移出/点外部/Esc 收起；点击按钮按 浅色→深色→自动 循环且面板保持展开（触屏与键盘点击仍展开菜单）；偏好存 `theme`，auto 时随系统解析成 light/dark，Agent 也可改同一个键 |
| 圆角 / 阴影 / 卡片 / 输入框样式 | `frontend/src/style.css` `@layer components` 的 `.panel` / `.field` / `.btn-*` / `.chip` / `.eyebrow` | 优先复用基元类，不另造样式 |
| 菜单 / 下拉面板 / 选中项背景戳出卡片 / 高亮方角超出圆角 | `components/TodoListItem.vue`（截止时间、更多菜单）、`pages/todo/TodoList.vue`（添加栏截止菜单）、`components/MindMapWrapper.vue`（节点菜单） | 面板用 `panel py-1 overflow-hidden`、菜单项通栏矩形不加圆角：高亮左右顶到边框，尖角由面板的 12px 圆角自然裁掉 |
| 图标 / 加号 / 垃圾桶图标 / 改图标 | `components/AppIcon.vue` | 全站唯一图标来源，用 `name` + `size`；不要用 emoji |
| 字体 / 等宽数字 | `frontend/src/style.css` `--font-sans`、`--font-mono` | 统计数字用 `font-mono tabular-nums` |
