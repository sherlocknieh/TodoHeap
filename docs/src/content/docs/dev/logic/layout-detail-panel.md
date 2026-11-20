---
title: "详情右栏与任务图布局"
---
# 详情右栏与任务图布局

任务图要保住整块画布宽度，详情右栏因此始终浮在画布上；其他视图仍是宽屏挤压中栏、窄屏浮层。右栏宽度是两侧共用的布局数据，画布内的控件定位与导图视野都按它避让。

## 浮层结构

任务图下，页面外壳渲染一个 `absolute inset-0 flex` 的透明浮层：

- 左侧空白区只负责占位，本身不接收点击；
- 右侧放 `TodoDetailEditor`，`pointer-events-auto`，浮在画布上；
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
| 三栏聚焦 | 选中节点居中与三栏缩放按整宽 `focusWidth` 计算：选中节点在中间栏，不在右侧浮层下方，面板开合不移动画面 |
| 适应视图 | `fitView` 按避让宽度 `visibleWidth = 画布宽 - detailPanelInset` 计算，全图不被面板盖住 |
| 节点更多菜单 | `menuPosition` 的右侧夹紧改用 `visibleWidth`，菜单不会钻到面板下面 |

画布宽度本身不变，所以面板开合或拖宽只影响下次适应视图与菜单边界；只有窗口缩放、侧栏开合这类真实尺寸变化才经 `ResizeObserver` 重新贴合三栏。

## 为什么控件不 teleport

视图控件曾用 `Teleport defer` 挂到浮层空白区，想用 flex 自然让位。实际运行时目标节点始终为空，`MindMapWrapper` 每次更新都会在 Vue 内部抛出 `Cannot read properties of null (reading 'emitsOptions')`，更新被中断，节点更多菜单因此渲染不出来。

当前实现把控件留在画布内，只让它的右偏移跟随共享宽度。这样控件仍随导图一起更新，定位也只需一个 CSS 值；浮层本身继续用 flex 只承载右栏。

## 点击与收起

- 浮起的右栏在点击面板外时收起；窄屏与非任务图视图沿用同一套判断。
- 日程视图点列表项即展开右栏（`handleEventSelected` 不再按屏宽判断）；列表项与新建日程入口带 `data-keep-detail-panel`，避免同一次点击冒泡到文档层后又把刚展开的面板收起。
- 日程视图点非日程区域（空白、日期导航、月历、顶栏操作）会清掉选中并收起右栏，宽屏停靠时同样生效；面板本身、日程项、新建入口、面板开关与日期选择器面板（`data-date-picker-panel`）除外。
- 画布自行阻止点击冒泡，空白点击额外发 `background-click` 事件给页面外壳，补上“点画布等于点外部”。
- 任务图里点节点只切换详情内容并收起浮层导航，不收起右栏。

## 验证

1. 任务图打开右栏，画布宽度不变；右下角视图控件在面板左侧，拖宽面板时一起左移；
2. 选中节点后节点居中于画布整宽中心，开关右栏画面不移动；点节点三点能打开菜单，菜单不被面板遮挡；
3. 点画布空白收起右栏，点节点只切换详情；控制台无 Vue 更新错误；
4. 切到其他视图，宽屏右栏恢复挤压中栏、窄屏恢复浮层。
