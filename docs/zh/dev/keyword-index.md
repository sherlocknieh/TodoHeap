---
layout: doc
title: 关键词索引
outline: deep
---

# 关键词索引（用户说法 → 代码位置）

用户描述界面细节时通常只给现象，不给文件名，例如「节点垃圾桶上悬停时变红」。本索引把这类**用户原话**直接映射到代码位置，先查这里再打开目标文件，避免每次从头搜索。

## 使用与维护

- **查**：拿用户原话里的名词、动词、颜色、控件名在本文件里搜索（如 `grep -n "垃圾桶" docs/zh/dev/keyword-index.md`），命中后按「位置」直接打开。
- **记**：按用户原话定位到代码后，把「说法 → 位置」补进最贴近的分组。只记可复用的对象与位置，不抄实现细节。
- **并**：用户换了说法指同一个对象时，把新词追加到同一条的「用户可能说」列，用 ` / ` 分隔，不新增重复行。
- **位置写法**：`文件` + 锚点。锚点优先用模板注释原文、函数名或可直接搜索的 class，少用行号，避免代码一动就失效。

## 整体布局

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 活动栏 / 左侧图标条 / 最左边一竖条 | `pages/Todo.vue`「左侧活动栏」注释；`activeSection`、`activeView` | 清单、日程、AI、回收站的入口；收起后由底栏按钮开回 |
| 侧栏 / 左栏 / 导航栏 / 抽屉 | `components/LeftSidebar.vue`；`pages/Todo.vue`「宽屏侧栏是常驻栏」「窄屏侧栏是覆盖内容的抽屉」 | 宽屏常驻并可拖宽，窄屏是浮层抽屉，两套状态互不覆盖 |
| 侧栏拉宽 / 拖宽度 / 拖到收起 | `components/LeftSidebar.vue`「右缘拖拽条」、`useResizablePanel`；`utils/resizablePanel.js` | 拖过最小宽度（200px）继续拖一段即收起 |
| 技能区高度 / 上下拖动分隔条 | `components/LeftSidebar.vue`「技能区高度可拖拽调整」 | 分隔条在技能分组上缘 |
| 侧栏分组折叠 / 收起标题 | `components/LeftSidebar.vue` `collapsedSections` | 折叠选择本地保留 |
| 顶栏标题 / 主区域标题 / 当前视图名 | `pages/Todo.vue` `activeViewTitle` | 各视图统一在顶栏显示名称 |
| 顶栏右侧操作 / 页面操作按钮 | `pages/Todo.vue` `#main-topbar-actions`；各视图里的 `Teleport defer to="#main-topbar-actions"` | 视图把自己的操作注入统一顶栏 |
| 详情面板 / 右栏 / 任务详情 | `pages/Todo.vue`「右栏：窄屏浮在内容之上」；`components/TodoDetailEditor.vue` | 宽屏挤压中栏、窄屏浮层；AI 与日程视图复用同一位置 |
| 底栏 / 状态栏 / 底部统计 / 进度条 | `pages/Todo.vue`「底栏统计」「底栏：导航开关、统计与同步状态」 | 根任务不计入统计 |
| 同步状态 / 断线 / 待同步 | `pages/Todo.vue` `syncStatus`；`stores/syncQueue.js` | 优先级：断线 > 待同步 > 连接中 > 已同步 |
| 设置浮窗 / 设置弹窗 / 齿轮 | `pages/todo/Settings.vue`；`pages/Todo.vue`「设置浮窗」 | 地址栏 `tab` 参数控制，刷新可回到同一面板 |
| 轻提示 / toast / 撤销提示 | `pages/Todo.vue` `const toast = ref`、「轻提示：删除、完成、批量操作后」 | 删除等操作后可从提示里撤销；链接提示额外提供「改为移动」按钮 |
| 点空白关闭详情 / 点别处收起右栏 | `pages/Todo.vue`「点击中栏区域时关闭详情面板」 | 点在详情面板内或任务项上不关 |

## 任务列表

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 快速添加 / 顶部输入框 / 回车添加 | `pages/todo/TodoList.vue`「快速添加：整行可聚焦」 | 整行可聚焦，回车即存；新任务挂根任务末尾 |
| 缩进 / 层级 / 子任务往里缩 | `components/TodoListItem.vue` `paddingLeft: (4 + item._level * 22)` | 层级来自树展开，缩进是纯展示 |
| 折叠箭头 / 展开收起 / 小三角 | `components/TodoListItem.vue` `toggleExpand`；`utils/taskCollapse.js` | 折叠状态列表、图、回收站共享 |
| 复选框 / 打勾 / 完成 / 取消完成 | `components/TodoListItem.vue` `cycleStatus` | 完成判定看 `completed_at` 是否为空 |
| 两态完成 / 点了变完成又变灰 | `components/TodoListItem.vue` `statusMap` | 行内先给即时反馈，再落库 |
| 多选 / 批量操作 / 选择模式 | `pages/todo/TodoList.vue` `toggleSelectionMode`、`batchSetCompleted`；`components/TodoListItem.vue` `selectionMode` | 多选时复选框替换完成状态与行内操作 |
| 已完成区 / 已完成收在下面 / 清除已完成 | `pages/todo/TodoList.vue`「已完成：无内容时不占位」、`clearCompletedTodos` | 整棵已完成子树移入回收站，可整体撤销 |
| 排序 / 排序方式 / 按截止时间 | `pages/todo/TodoList.vue` `sortMode`、`LIST_SORT_OPTIONS` | 手动顺序仍以父级 `child_ids` 为准 |
| 行内菜单 / 三点 / 更多操作 | `components/TodoListItem.vue`「更多菜单相关」/ `currentMenuEl` | 与截止时间菜单互斥，点外部关闭 |
| 行内删除 / 删除任务 / 移入回收站 | `components/TodoListItem.vue` `emitDeleteTodo`；`pages/todo/TodoList.vue` 删除处理 | 软删除，进回收站 |
| 拖拽排序 / 拖成子任务 / 插到前后 | `components/TodoListItem.vue` `onDragStart`/`onDragOver`/`onDrop`；`utils/todoDrag.js` | 上四分位插前、下四分位插后、中间成为子任务 |
| 截止时间菜单 / 日期时间 | `components/TodoListItem.vue`「截止时间菜单与更多菜单互斥」 | 与更多菜单同一时间只开一个 |

## 任务图（思维导图）

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 节点垃圾桶 / 图上删除按钮 / 悬停绿圈 / 悬停变绿 | `components/MindMapWrapper.vue`「选中节点右侧的删除按钮」+ class `hover:stroke-accent-600` | 常态灰图标，悬停只让圆环描边转绿（与勾选框同理），图标保持中性；只有选中节点才显示，根节点没有 |
| 删除二次确认 / 再点一次 / 实心红底 | `components/MindMapWrapper.vue` `confirmDeleteId`、`deleteNode` | 第一次点进入待确认态（红底白图标），再点才删 |
| 连线删除 / 线中点叉号 / 断开父子关系 | `components/MindMapWrapper.vue` `confirmUnlink`、`onUnlinkClick`、`selectEdge` | 只从父任务 `child_ids` 移除引用；最后一个父级被摘掉时回顶层 |
| 加号 / 出边按钮 / 新建子任务 / 折叠计数 / 靠近就显示加号 / 拉线时加号消失 | `components/MindMapWrapper.vue`「出边按钮」、`onToggleClick`、`holdLeafControl`、`updateLeafControlHover`、`draggingLeafId` | 有子任务时是折叠开关；叶子节点指针靠近按钮位置即显示加号，从加号拉线期间保持可见，拖到别的节点建立链接 |
| 双击重命名 / F2 改名 / 原地编辑 | `components/MindMapWrapper.vue` `startEdit`、`commitEdit`、`onEditKeydown` | 节点文字常驻输入框，平时只读 |
| 键盘新建 / Enter 同级 / Tab 子级 | `components/MindMapWrapper.vue` `onKeydown` | 快捷键说明收在右下角帮助浮层 |
| 复制节点 / Ctrl+C / 复制成 Markdown | `components/MindMapWrapper.vue` `onKeydown` / `Ctrl+C` 分支 | 复制选中节点及其子节点为 Markdown 列表 |
| 滚轮缩放 / 拖拽平移 / 画布移动 | `components/MindMapWrapper.vue` `onWheel`、`onPointerDown`/`onPointerMove` | 选中节点或连线后滚轮缩放，空白处平移 |
| 布局方向 / 横向纵向 / 文字横竖排 | `components/MindMapWrapper.vue` `cycleDirection` | 阅读偏好本地保留 |
| 适应视图 / 缩放到刚好 / 操作提示 | `components/MindMapWrapper.vue` `fitView`、`helpOpen` | 视图控件在右下角，提示收进按钮浮层 |
| 选中高亮 / 祖先链 / 连线变色 | `components/MindMapWrapper.vue`「未选中的连线铺在节点下层」 | 选中节点的祖先链用强调色 |
| 拖拽落点 / 预览线 / 拖到节点上 / 影子节点 / 拖拽残影 / 拖动时没有连线 | `components/MindMapWrapper.vue` `dragState.shadow`、`dragState.preview`、`onNodePointerDown` | 拖节点时在指针处显示节点副本（原件淡出），不画线；只有从折叠/加号按钮建链接才画预览线 |
| 拖拽移动 / 拖节点换父级 / 单父节点拖动 / 移动后没提示 | `pages/todo/TodoGraph.vue` `dropTask`；`components/MindMapWrapper.vue` `onDragEnd` | 单父任务拖到节点上直接移动且不弹提示；多父任务拖节点只建链接，提示里可选「改为移动（断开旧连接）」；从折叠/加号按钮拉线只建链接 |
| 拖拽建链接 / 按钮拉线 / 拉到附近就命中 / 箭头被鼠标挡住 / 影子碰到就命中 / 不用把鼠标放到节点上 | `components/MindMapWrapper.vue` `linkTargetAtRect`、`LINK_HIT_PADDING`、`DRAG_ARROW_GAP` | 拖节点按影子矩形与节点是否接触判定，指针不必在节点上；从折叠/加号按钮拉线按指针点外扩屏幕像素判定，多节点取中心最近；预览线箭头再越过指针 18px，避免被光标遮住（仅按钮拉线） |

## 侧栏与 AI

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 会话列表 / 对话历史 / 新会话 | `components/LeftSidebar.vue`「对话会话：新建、切换、重命名、删除」 | 只显示时间与消息数 |
| 重命名会话 / 删除会话 | `components/LeftSidebar.vue` `startSessionRename`、`deleteSession` | 行内图标按钮 |
| 技能 / skill / 自定义指令 | `components/LeftSidebar.vue`「技能：常驻底部分组」、`startNewSkill`；`stores/agent.js` | 技能存 `user_settings.settings.skills`，只绑定工作模式 |
| 技能挂载 / 切模式 | `components/LeftSidebar.vue` `attachSkill`、`modeLabel`；`lib/agentModes.js` | 点技能会切到它绑定的模式，指令随该轮消息下发 |
| MCP 服务 / 外部工具 / 滴答清单连接 | `components/LeftSidebar.vue`「MCP 服务：常驻底部分组」、`startNewMcp`；`lib/mcpServers.js` | 令牌只在请求内使用，不落库 |
| 消息气泡 / 工具执行记录 / 请求详情 | `components/AgentChat.vue` `toolLabel`、`callSummary` | 请求详情保留系统提示与工具结果原文 |
| 破坏性操作确认 / 弹确认框 | `components/AgentChat.vue` `pending` 与确认文案计算属性 | 删任务、删日程、切模式、外部 MCP 写入都先确认 |
| 上下文构成 / 占比 / 这一轮用了什么 | `components/AgentContextPanel.vue` | AI 视图右栏复用详情面板位置 |
| 模型接入 / API Key / 测试连接 | `components/ProviderSettings.vue`；`stores/llm.js`；`lib/llmProvider.js` | 密钥只存浏览器本地 |
| ask_user / 让用户选一个 | `lib/agentTools.js` `ask_user` | Agent 工具内的选择面板 |

## 日程

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 日期切换 / 左右箭头 / 回到今天 | `pages/todo/ScheduleView.vue`「日期导航」、`goToDate` | 选中日期由路由 query 承载，刷新不丢 |
| 月历 / 圆点 / 有日程的日子 | `pages/todo/ScheduleView.vue`「月历总览」 | 只渲染选中日期所在月份，周一起头 |
| 按天分组 / 跨天事件算哪天 | `pages/todo/ScheduleView.vue`「跨天事件归入开始日」 | 与月历圆点口径一致 |
| 日程右栏 / 标题备注地点 / 编辑日程 | `components/ScheduleDetailPanel.vue` | 与任务选中互不干扰 |
| 删除日程 / 删日程确认 | `components/ScheduleDetailPanel.vue` `deleteSchedule` | 删除后收起面板并清掉选中项 |
| 日历导入导出 / ICS / 订阅链接 | `pages/todo/Settings.vue`「日历：ICS 导入导出与只读订阅链接」；`lib/ics.js`、`lib/calendarTransfer.js` | 订阅链接本身就是凭据，可重新生成或停用 |

## 回收站

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 恢复 / 恢复全部 / 撤销删除 | `pages/todo/Trash.vue` `handleRestoreWithCheck`、`restoreAllTrash` | 单条恢复会连带子任务 |
| 永久删除 / 彻底删除 / 清空回收站 | `pages/todo/Trash.vue` `handlePermanentDelete`；`stores/todos.js` | 不可恢复，操作前二次确认 |
| 无法恢复 / 父任务限制 / 越级删除 | `pages/todo/Trash.vue`「恢复限制提示」、`blockedParentId` | 父任务也在回收站时，先恢复父任务 |
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
| 子任务顺序 / 手动排序 / 新任务放哪 | `stores/todos.js` 树构建；父级 `child_ids` | 数组顺序是手动顺序的唯一来源，新任务追加到末尾 |
| 软删除 / 删除后还能找回 | `deleted_at`；`stores/todos.js` `trashTodos` | 删除是软删除，完成状态看 `completed_at` |
| 乐观更新 / 点了立即生效 | `stores/todos.optimistic.js` | 先改本地并入队，再写 Supabase |
| 失败回滚 / 操作失败恢复原样 | `stores/todos.rollback.js` | 与乐观更新成对出现 |
| 离线队列 / 断网后重试 / 待同步 | `stores/syncQueue.js` | localforage 持久化，带退避重试 |
| 临时 ID / id 替换 / 新建任务 ID | `stores/syncQueue.js` `generateTempId`、`id-replaced` 事件 | `client_key` 保证同一用户下创建幂等 |
| 实时同步 / 多端刷新 | `stores/todos.realtime.js` | Supabase Realtime 订阅与重连 |
| 递归删除 / 删父删子 | `stores/todos.optimistic.js`；`utils/taskGraph.js` `collectDescendantIds` | 级联范围由任务树决定 |

## 通用样式与图标

| 用户可能说 | 位置 | 说明 |
| --- | --- | --- |
| 主题色 / 绿色 / 强调色 / accent | `frontend/src/style.css` `@theme` 的 `--color-accent-*` | 绿色是唯一强调色，只出现在交互与状态上 |
| 危险色 / 红色 / 删除红 / danger | `frontend/src/style.css` `--color-danger-*` | 只用于删除等不可逆确认态 |
| 暗色模式 / 深色 / 跟随系统 | `frontend/src/style.css` `prefers-color-scheme`；组件里的 `dark:` 类 | 跟随系统切换 |
| 圆角 / 阴影 / 卡片 / 输入框样式 | `frontend/src/style.css` `@layer components` 的 `.panel` / `.field` / `.btn-*` / `.chip` / `.eyebrow` | 优先复用基元类，不另造样式 |
| 图标 / 加号 / 垃圾桶图标 / 改图标 | `components/AppIcon.vue` | 全站唯一图标来源，用 `name` + `size`；不要用 emoji |
| 字体 / 等宽数字 | `frontend/src/style.css` `--font-sans`、`--font-mono` | 统计数字用 `font-mono tabular-nums` |
