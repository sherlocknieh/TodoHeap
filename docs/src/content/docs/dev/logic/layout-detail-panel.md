---
title: "详情右栏与任务图布局"
---
# 详情右栏与任务图布局

任务图要保住整块画布宽度，详情右栏因此始终浮在画布上；其他视图仍是宽屏挤压中栏、窄屏浮层。右栏宽度是两侧共用的布局数据，画布内的控件定位与导图视野都按它避让。

## 浮层结构

任务图下，页面外壳渲染一个 `absolute inset-0 flex` 的透明浮层：

- 左侧空白区只负责占位，本身不接收点击；
- 右侧放 `TodoDetailEditor`，`pointer-events-auto`，浮在画布上；
- 浮层态的三个右栏（任务详情、日程详情、AI 上下文）传 `floating`，根节点用 `bg-surface/80 backdrop-blur-sm`（暗色 `dark:bg-surface-dark/80`）：底色留两成透明让下面的画布隐约透上来，背后内容只做轻微模糊，保证面板文字仍好读；宽屏停靠时保持实底 `bg-surface`；
- 画布保持整宽，铺在浮层下面。

空白区不参与画布的尺寸计算，所以右栏开合、拖宽都不会改变画布宽度。

## 共享宽度

宽度与占位状态都定义在 `frontend/src/utils/detailPanelContext.js`：

- `detailPanelWidth` 是持久化 ref（`detail-width`，默认 320，最小 260），`TodoDetailEditor` 与页面外壳 import 同一个对象，不再各建一份；
- `detailPanelInset` 是导图实际要避让的宽度，由 `Todo.vue` 的 `graphPanelInset` 写入：只在任务图且面板展开时非 0，并受 `85vw` 上限约束。

面板拖宽直接改写共享的 `detailPanelWidth`，导图与控件读到的值同步变化，不需要额外的 `ResizeObserver` 或跨实例同步。

## 谁按它避让

| 位置 | 用法 |
| --- | --- |
| 导图视图控件 | `MindMapWrapper` 的 `controlsStyle` 用 `right: calc(0.75rem + detailPanelInset)`，面板多宽就左移多少；面板收起时回到右下角 |
| 选中项可见性修正 | 按避让宽度 `visibleWidth` 计算：节点出界时最小平移，节点比可用区还大时才缩小；面板开合只影响之后的修正 |
| 适应视图 | `fitView` 按避让宽度 `visibleWidth = 画布宽 - detailPanelInset` 计算，全图不被面板盖住 |
| 节点更多菜单 | `menuPosition` 的右侧夹紧改用 `visibleWidth`，菜单不会钻到面板下面 |

画布宽度本身不变，所以面板开合或拖宽只影响下次适应视图、之后的选中项可见性修正与菜单边界；真实尺寸变化只有未交互过的首屏才会重新适配。

## 为什么控件不 teleport

视图控件曾用 `Teleport defer` 挂到浮层空白区，想用 flex 自然让位。实际运行时目标节点始终为空，`MindMapWrapper` 每次更新都会在 Vue 内部抛出 `Cannot read properties of null (reading 'emitsOptions')`，更新被中断，节点更多菜单因此渲染不出来。

当前实现把控件留在画布内，只让它的右偏移跟随共享宽度。这样控件仍随导图一起更新，定位也只需一个 CSS 值；浮层本身继续用 flex 只承载右栏。

## 右栏分区折叠栈

三个右栏（任务详情、日程详情、AI 上下文）共用 `utils/sectionStack.js` 的 `useSectionStack`，标题行统一由 `components/SidebarSectionHeader.vue` 渲染，交互沿用左侧栏：

| 右栏 | 分区（按顺序） | 默认折叠 |
| --- | --- | --- |
| 任务详情 | 详情（auto）、时间（auto）、描述（fill）、子任务（fixed） | 全部展开 |
| 日程详情 | 详情（fill）、更多选项（auto）、备注（auto） | 「更多选项」收起，字段有值时自动展开 |
| AI 上下文 | 请求参数（auto）、上下文构成（auto）、可用工具（fixed）、原始消息（fill）、完整请求体（auto） | 全部展开 |

- 三种高度：`auto` 取标题 + 内容自然高度；`fill` 吃掉扣掉其它分区后的剩余空间；`fixed` 统一 192px（`SECONDARY_SECTION_HEIGHT`）。剩余空间不足时 `fill` 至少保留标题行。
- 折叠只留标题行；内容始终挂载，折叠时加 `inert` 阻止键盘焦点；高度以像素写入并做 200ms 过渡。
- 高度由 `stack.clientHeight`、标题行 `offsetHeight` 与 `auto` 分区内容 `offsetHeight` 算出；`ResizeObserver` 观察容器与内容，选中项出现（栈节点后挂载）或分区出现/消失时补测。
- 折叠状态分别存 `detail-sections`、`schedule-detail-sections`、`ai-context-sections`。
- 任务描述仍把滚动交给 Milkdown 内部；子任务固定 192px，列表滚动、新建/链接固定在底部；日程详情与 AI 原始消息在自己的分区内滚动。

## 点击与收起

- 浮起的右栏在点击面板外时收起；窄屏与非任务图视图沿用同一套判断。
- 日程视图点列表项即展开右栏（`handleEventSelected` 不再按屏宽判断）；列表项与新建日程入口带 `data-keep-detail-panel`，避免同一次点击冒泡到文档层后又把刚展开的面板收起。
- 日程视图点非日程区域（空白、日期导航、月历、顶栏操作）会清掉选中并收起右栏，宽屏停靠时同样生效；面板本身、日程项、新建入口、面板开关与日期选择器面板（`data-date-picker-panel`）除外。
- 画布自行阻止点击冒泡，空白点击额外发 `background-click` 事件给页面外壳，补上“点画布等于点外部”。
- 任务图里点节点只切换详情内容并收起浮层导航，不收起右栏。

## 验证

1. 任务图打开右栏，画布宽度不变；右下角视图控件与右上角缩放器在面板左侧，拖宽面板时一起左移；
2. 从列表选中视口外的任务，修正按扣除面板后的宽度计算，节点不会被面板盖住；点节点三点能打开菜单，菜单不被面板遮挡；
3. 点画布空白收起右栏，点节点只切换详情；控制台无 Vue 更新错误；
4. 切到其他视图，宽屏右栏恢复挤压中栏、窄屏恢复浮层；
5. 右栏四个分区标题可折叠，标题随内容定高，时间分区单独放截止时间与耗时，描述占满、子任务固定 192px，展开/折叠有约 200ms 过渡；
6. 缩小窗口或缩短右栏高度后，任务详情自动收缩到标题行，超出部分由整栈滚动；刷新后折叠状态保持。
