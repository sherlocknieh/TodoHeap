<template>
  <!-- 自研思维导图：SVG 渲染，支持滚轮缩放、拖拽平移与键盘增删改 -->
  <div ref="container" tabindex="0"
    class="mindmap-canvas relative w-full h-full overflow-hidden outline-none select-none"
    :class="[panning || dragState.active ? 'cursor-grabbing' : 'cursor-grab', darkCanvas && 'mindmap-canvas--dark', dotGrid && 'mindmap-dots']"
    @wheel.prevent="onWheel" @pointerdown="onPointerDown" @pointermove="onPointerMove"
    @pointerup="endPan" @pointerleave="onCanvasLeave" @click.stop="onCanvasClick"
    @keydown="onKeydown">
    <svg class="block w-full h-full touch-none" :viewBox="`0 0 ${size.width} ${size.height}`">
      <defs>
        <!-- 箭头继承连线颜色；userSpaceOnUse 让箭头尺寸不随线宽变化 -->
        <marker id="mm-arrow" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="8" markerHeight="8"
          markerUnits="userSpaceOnUse" orient="auto-start-reverse">
          <path d="M1 2.6 L9 5 L1 7.4z" fill="context-stroke" />
        </marker>
      </defs>

      <!-- 坐标网格：铺在内容下层，线条与刻度按当前视口换算，跟随平移与缩放但线宽、字号不变 -->
      <g v-if="coordinateGrid" class="pointer-events-none select-none">
        <line v-for="(line, index) in gridLayer.minorLines" :key="`minor-${index}`" :x1="line.x1" :y1="line.y1"
          :x2="line.x2" :y2="line.y2" stroke-width="1" class="mindmap-grid-minor" />
        <line v-for="(line, index) in gridLayer.majorLines" :key="`major-${index}`" :x1="line.x1" :y1="line.y1"
          :x2="line.x2" :y2="line.y2" stroke-width="1" class="mindmap-grid-major" />
        <line v-if="gridLayer.xAxis" x1="0" :y1="gridLayer.xAxis.y" :x2="size.width" :y2="gridLayer.xAxis.y"
          stroke-width="1.4" class="mindmap-grid-axis" />
        <line v-if="gridLayer.yAxis" :x1="gridLayer.yAxis.x" y1="0" :x2="gridLayer.yAxis.x" :y2="size.height"
          stroke-width="1.4" class="mindmap-grid-axis" />
        <line v-for="(tick, index) in gridLayer.ticks" :key="`tick-${index}`" :x1="tick.x1" :y1="tick.y1"
          :x2="tick.x2" :y2="tick.y2" stroke-width="1.2" class="mindmap-grid-axis" />
        <text v-for="(label, index) in gridLayer.labels" :key="`label-${index}`" :x="label.x" :y="label.y"
          :text-anchor="label.anchor" :dominant-baseline="label.anchor === 'end' ? 'middle' : 'auto'"
          class="mindmap-grid-label">{{ label.text }}</text>
      </g>

      <g :transform="`translate(${view.x} ${view.y}) scale(${view.scale})`">
        <!-- 未选中的连线铺在节点下层，节点框可以压住线头；选中节点的祖先链用强调色 -->
        <path v-for="edge in baseEdges" :key="edge.key" :d="edge.d" fill="none" stroke-linecap="round"
          :class="highlightedEdges.has(edge.key)
            ? 'stroke-accent-500 dark:stroke-accent-400'
            : 'stroke-neutral-300 dark:stroke-neutral-600'"
          :stroke-width="highlightedEdges.has(edge.key) ? 1.8 : 1.2"
          marker-end="url(#mm-arrow)" />

        <!-- 连线热区：透明加宽描边，便于点中细线；data-mm-edge 供滚轮判断是否缩放 -->
        <path v-for="edge in layout.edges" :key="`hit-${edge.key}`" :d="edge.d" fill="none"
          stroke="transparent" stroke-width="14" stroke-linecap="round" :data-mm-edge="edge.key"
          :class="edge.deletable ? 'cursor-pointer' : 'cursor-default'"
          @pointerdown.stop @click.stop="selectEdge(edge)" />

        <!-- 拉线预览：只在从折叠/加号按钮建链接时画；曲线规则与正式连线一致，拖动期间用强调色 -->
        <path v-if="dragState.active && dragState.preview" :d="dragState.preview" fill="none"
          class="stroke-accent-600 dark:stroke-accent-400" stroke-width="2.4"
          stroke-linecap="round" marker-end="url(#mm-arrow)" />

        <!-- 节点 -->
        <g v-for="node in renderNodes" :key="node.id" :transform="`translate(${node.x} ${node.y})`"
          :opacity="nodeOpacity(node)" :data-mm-node="node.id"
          class="group cursor-pointer"
          @pointerdown.stop="onNodePointerDown($event, node)" @dblclick.stop="startEdit(node)"
          @pointerenter="onNodePointerEnter(node)" @pointerleave="onNodePointerLeave()"
          @contextmenu.stop="openNodeMenuAt(node, $event)"
          @click.stop="selectNode(node)">
          <!-- 悬停与选中用同一个绿色、同样粗细，只靠透明度分强弱：悬停是半透明绿框，选中是实绿框加淡底 -->
          <rect :width="nodeWidth" :height="node.height" rx="8"
            :fill-opacity="node.isRoot ? 0.9 : 0.72"
            class="transition-colors" :class="[
              isDropInside(node)
                ? 'stroke-2 stroke-accent-600 dark:stroke-accent-400'
                : node.selected
                  ? 'stroke-2 stroke-accent-600 dark:stroke-accent-400'
                  : 'stroke-1 stroke-neutral-200 group-hover:stroke-2 group-hover:stroke-accent-600/45 dark:stroke-neutral-700 dark:group-hover:stroke-accent-400/45',
              node.isRoot
                ? 'fill-accent-700 dark:fill-accent-500'
                : isDropInside(node)
                  ? 'fill-accent-100 dark:fill-accent-500/25'
                  : node.selected
                    ? 'fill-accent-50 dark:fill-neutral-800'
                    : 'fill-white dark:fill-neutral-900'
            ]" />
          <!-- 勾选框：点击切换完成状态，与列表视图的两态复选一致 -->
          <g v-if="node.hasCheckbox" :transform="`translate(${paddingX} ${paddingTop + fontSize - 1})`"
            @pointerdown.stop @click.stop="toggleDone(node)">
            <rect :width="checkboxSize" :height="checkboxSize" :y="-checkboxSize + 3" rx="3.5"
              stroke-width="1.2" class="cursor-pointer transition-colors" :class="node.completed_at
                ? 'fill-accent-600 stroke-accent-600 dark:fill-accent-500 dark:stroke-accent-500'
                : 'fill-white stroke-neutral-300 hover:stroke-accent-500 dark:fill-neutral-900 dark:stroke-neutral-600 dark:hover:stroke-accent-400'" />
            <path v-if="node.completed_at" :d="`M3.2 ${-checkboxSize + 9.8} L5.8 ${-checkboxSize + 12.6} L10.8 ${-checkboxSize + 7.4}`"
              fill="none" class="pointer-events-none stroke-white" stroke-width="1.5" stroke-linecap="round"
              stroke-linejoin="round" />
            <title>{{ node.completed_at ? '标记为未完成' : '标记为已完成' }}</title>
          </g>
          <!-- 节点文字：常驻输入框承载，平时只读，双击后原地编辑。
               高度与节点框同步取内容行数，编辑时随输入增长，不靠内部滚动 -->
          <foreignObject :x="node.textX" :y="paddingTop + 1" :width="node.textWidth"
            :height="node.lines.length * lineHeight">
            <textarea :ref="(el) => setEditInput(el, node)"
              :value="editingId === Number(node.id) ? editingText : node.lines.join('\n')"
              :readonly="editingId !== Number(node.id)"
              :tabindex="editingId === Number(node.id) ? 0 : -1"
              spellcheck="false" :style="editTextStyle(node)"
              class="block h-full w-full resize-none overflow-hidden border-0 bg-transparent p-0 font-medium outline-none"
              :class="[
                node.isRoot
                  ? 'text-white'
                  : node.completed_at
                    ? 'text-neutral-400 line-through dark:text-neutral-500'
                    : 'text-neutral-800 dark:text-neutral-100',
                editingId === Number(node.id) ? 'pointer-events-auto' : 'pointer-events-none'
              ]"
              @input="onEditInput($event)"
              @pointerdown.stop @click.stop @dblclick.stop @dragstart.prevent
              @keydown.stop="onEditKeydown" @blur="commitEdit" />
          </foreignObject>
          <!-- 根节点副标题：说明这张图代表什么，与参考图的「作品集导航」同位 -->
          <text v-if="node.subtitle" :x="node.textX"
            :y="paddingTop + node.lines.length * lineHeight + 12" class="text-[11px]"
            :class="node.isRoot ? 'fill-white/70' : 'fill-neutral-500 dark:fill-neutral-400'">
            {{ node.subtitle }}
          </text>

          <!-- 出边按钮：有子任务时是折叠开关（折叠显计数、展开显减号）；
               叶子节点悬停或选中时显示加号，离开后短暂保留，指针移向按钮时不会消失。
               单击折叠/新建子任务，拖到别的节点上则把那个任务挂成当前节点的子任务 -->
          <g v-if="node.childCount > 0 || (node.selected && !node.isRoot) || isLeafHovered(node)"
            :transform="`translate(${node.controlX} ${node.controlY})`"
            @pointerenter="holdLeafControl(node)" @pointerleave="releaseLeafControl()"
            @pointerdown.stop="onTogglePointerDown($event, node)" @click.stop="onToggleClick(node)">
            <!-- 透明热区：命中范围略大于可见圆，指针稍偏也能点到，又不至于抢走节点边缘的点击 -->
            <!-- 按钮挂在节点外侧的画布上，配色统一按画布底走，根节点也不跟着节点底色变化 -->
            <circle :r="toggleRadius + 3" class="cursor-pointer fill-transparent" />
            <circle :r="toggleRadius" stroke-width="1"
              class="cursor-pointer transition-colors fill-white stroke-neutral-300 hover:fill-neutral-50 dark:fill-neutral-900 dark:stroke-neutral-600 dark:hover:fill-neutral-800" />
            <template v-if="node.childCount > 0">
              <text v-if="node.collapsed" y="0" text-anchor="middle" dominant-baseline="central"
                class="pointer-events-none text-[10px] tabular-nums fill-neutral-500 dark:fill-neutral-400">{{ node.childCount }}</text>
              <path v-else d="M-3 0 H3" fill="none" stroke-width="1.3" stroke-linecap="round"
                class="pointer-events-none stroke-neutral-500 dark:stroke-neutral-300" />
              <title>{{ node.collapsed ? `展开此节点的 ${node.childCount} 条子链接` : `折叠此节点的 ${node.childCount} 条子链接` }}</title>
            </template>
            <template v-else>
              <path d="M-3 0 H3 M0 -3 V3" fill="none" stroke-width="1.3" stroke-linecap="round"
                class="pointer-events-none stroke-neutral-500 dark:stroke-neutral-300" />
              <title>新建子任务，或拖到其它节点建立链接</title>
            </template>
          </g>

          <!-- 节点更多操作按钮：竖三点，指针停在节点上即显示，选中或菜单打开时保持显示；
               透明热区承担点击与悬停判定，菜单打开时图标转绿表示激活 -->
          <g v-if="!node.isRoot && (node.selected || isNodeHovered(node) || menuNodeId === String(node.id))"
            data-mm-more-trigger
            :transform="`translate(${nodeWidth - paddingX - moreSize / 2} ${node.height / 2})`"
            class="cursor-pointer transition-colors"
            :class="menuNodeId === String(node.id)
              ? 'text-accent-600 dark:text-accent-400'
              : 'text-neutral-400 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200'"
            @pointerdown.stop @click.stop="toggleNodeMenu(node)">
            <circle r="9" class="fill-transparent" />
            <g transform="translate(-6 -6)" class="pointer-events-none">
              <AppIcon name="moreVertical" :size="12" />
            </g>
            <title>更多操作</title>
          </g>
        </g>

        <!-- 排序占位槽：拖到目标节点上下四分之一时，在兄弟序列里插入一条空位，兄弟节点真实让开 -->
        <g v-if="dropPlaceholderNode"
          :transform="`translate(${dropPlaceholderNode.x} ${dropPlaceholderNode.y})`"
          class="pointer-events-none">
          <rect :width="nodeWidth" :height="dropPlaceholderNode.height" rx="6"
            stroke-width="1.4" stroke-dasharray="6 4"
            class="fill-accent-100/80 stroke-accent-500 dark:fill-accent-500/20 dark:stroke-accent-400" />
          <rect :width="8" :height="dropPlaceholderNode.height" rx="4"
            class="fill-accent-500/60 dark:fill-accent-400/60" />
        </g>

        <!-- 选中连线：压在节点之上高亮，配合中点删除按钮 -->
        <path v-if="selectedEdge" :d="selectedEdge.d" fill="none" stroke-linecap="round"
          class="pointer-events-none stroke-accent-600 dark:stroke-accent-400" stroke-width="2.4"
          marker-end="url(#mm-arrow)" />

        <!-- 选中连线：在连线中点显示删除按钮，置于节点之上以免被遮挡；根任务的边不可删，只高亮 -->
        <g v-if="selectedEdge?.deletable && selectedEdge.midpoint"
          :transform="`translate(${selectedEdge.midpoint.x} ${selectedEdge.midpoint.y})`"
          @pointerdown.stop @click.stop="onUnlinkClick">
          <circle r="12" class="cursor-pointer fill-transparent stroke-transparent" />
          <circle r="6" class="cursor-pointer transition-colors" stroke-width="1.1" :class="confirmUnlink
            ? 'fill-danger-600 stroke-danger-600 dark:fill-danger-500 dark:stroke-danger-500'
            : 'fill-white stroke-accent-600 hover:fill-accent-50 dark:fill-neutral-900 dark:stroke-accent-400 dark:hover:fill-neutral-800'">
            <title>{{ confirmUnlink ? '再次点击删除连接线' : '删除连接线' }}</title>
          </circle>
          <path d="M-1.8 -1.8 L1.8 1.8 M1.8 -1.8 L-1.8 1.8" fill="none"
            class="pointer-events-none" stroke-width="1.3" stroke-linecap="round"
            :class="confirmUnlink ? 'stroke-white' : 'stroke-accent-600 dark:stroke-accent-400'" />
        </g>

        <!-- 拖拽影子：按住节点拖动时跟随指针的副本，抓取点与原件保持同一相对位置；
             原件同时淡出；拖进目标时目标仍按 targetId 高亮，前后插序则显示占位槽 -->
        <g v-if="dragState.shadow" :transform="`translate(${dragState.shadow.x} ${dragState.shadow.y})`"
          class="pointer-events-none">
          <rect :width="nodeWidth" :height="dragState.shadow.node.height" rx="8" fill-opacity="0.92"
            stroke-width="1.4" stroke-dasharray="6 4"
            class="fill-white stroke-accent-500 dark:fill-neutral-900 dark:stroke-accent-400" />
          <text v-for="(line, index) in dragState.shadow.node.lines" :key="index"
            :x="dragState.shadow.node.textX" :y="paddingTop + fontSize + index * lineHeight"
            :style="textStyle" class="fill-neutral-800 font-medium dark:fill-neutral-100">{{ line }}</text>
        </g>
      </g>
    </svg>

    <!-- 节点更多操作菜单：点三点按钮时贴在按钮下方，右键时从指针处展开，都按屏幕位置定位并随缩放平移跟随；
         菜单内点击不再冒泡到画布，避免刚打开就被当成点空白取消 -->
    <div v-if="menuNode" data-mm-more-menu
      class="absolute z-20 panel cursor-default py-1 shadow-lg"
      :style="{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px`, width: `${menuWidth}px` }"
      @pointerdown.stop @click.stop @contextmenu.prevent>
      <button v-for="item in MENU_ITEMS" :key="item.key" type="button"
        class="flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-sm transition-colors"
        :class="item.danger
          ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
          : 'text-neutral-700 hover:bg-accent-50 dark:text-neutral-300 dark:hover:bg-accent-500/10'"
        @click="runMenuAction(item.key)">
        <AppIcon :name="item.icon" :size="13" />
        <span class="flex-1">{{ item.label }}</span>
        <span class="text-[10px] text-neutral-400 dark:text-neutral-500">{{ item.hint }}</span>
      </button>
    </div>

    <!-- 视图控件：布局方向切换、适应视图与操作提示，提示收进按钮浮层以免遮挡画布；
         右栏浮起时按面板宽度左移，避免盖住按钮 -->
    <div class="absolute bottom-3 right-3 z-10 flex items-center gap-1" :style="controlsStyle" @pointerdown.stop
      @keydown.stop @keydown.escape.stop="helpOpen = false">
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        :title="allExpanded ? '收起全部' : '展开全部'" @click.stop="toggleAllCollapse">
        <AppIcon :name="allExpanded ? 'shrink' : 'expand'" :size="14" />
      </button>
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        :title="`布局方向：${currentDirection.label}（点击切换）`" @click.stop="cycleDirection">
        <AppIcon :name="currentDirection.icon" :size="14" />
      </button>
      <button
        class="bg-white dark:bg-neutral-900 border border-hairline dark:border-hairline-dark rounded p-1.5 text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors"
        title="适应视图" @click.stop="fitView">
        <AppIcon name="target" :size="14" />
      </button>
      <button type="button" :aria-pressed="darkCanvas" :aria-label="darkCanvas ? '切换浅色背景' : '切换深色背景'"
        :title="darkCanvas ? '浅色背景' : '深色背景'"
        class="flex rounded border p-1.5 transition-colors"
        :class="darkCanvas
          ? 'bg-accent-50 border-accent-300 text-accent-800 dark:bg-accent-500/15 dark:border-accent-500/40 dark:text-accent-200'
          : 'bg-white dark:bg-neutral-900 border-hairline dark:border-hairline-dark text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800'"
        @click.stop="darkCanvas = !darkCanvas">
        <AppIcon :name="darkCanvas ? 'moon' : 'sun'" :size="14" />
      </button>
      <button type="button" :aria-pressed="dotGrid" :aria-label="dotGrid ? '隐藏点阵背景' : '显示点阵背景'"
        :title="dotGrid ? '隐藏点阵背景' : '显示点阵背景'"
        class="flex rounded border p-1.5 transition-colors"
        :class="dotGrid
          ? 'bg-accent-50 border-accent-300 text-accent-800 dark:bg-accent-500/15 dark:border-accent-500/40 dark:text-accent-200'
          : 'bg-white dark:bg-neutral-900 border-hairline dark:border-hairline-dark text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800'"
        @click.stop="toggleDotGrid">
        <AppIcon name="grid" :size="14" />
      </button>
      <button type="button" :aria-pressed="coordinateGrid" :aria-label="coordinateGrid ? '隐藏坐标网格' : '显示坐标网格'"
        :title="coordinateGrid ? '隐藏坐标网格' : '显示坐标网格'"
        class="flex rounded border p-1.5 transition-colors"
        :class="coordinateGrid
          ? 'bg-accent-50 border-accent-300 text-accent-800 dark:bg-accent-500/15 dark:border-accent-500/40 dark:text-accent-200'
          : 'bg-white dark:bg-neutral-900 border-hairline dark:border-hairline-dark text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800'"
        @click.stop="toggleCoordinateGrid">
        <AppIcon name="axes" :size="14" />
      </button>
      <div ref="helpRef" class="relative">
        <button type="button" :aria-expanded="helpOpen" :aria-label="helpOpen ? '收起操作提示' : '操作提示'"
          :title="helpOpen ? '收起操作提示' : '操作提示'"
          class="flex rounded border p-1.5 transition-colors"
          :class="helpOpen
            ? 'bg-accent-50 border-accent-300 text-accent-800 dark:bg-accent-500/15 dark:border-accent-500/40 dark:text-accent-200'
            : 'bg-white dark:bg-neutral-900 border-hairline dark:border-hairline-dark text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-50 dark:hover:bg-neutral-800'"
          @click.stop="helpOpen = !helpOpen">
          <AppIcon name="info" :size="14" />
        </button>
        <Transition enter-active-class="transition ease-out duration-100"
          enter-from-class="opacity-0 scale-95" enter-to-class="opacity-100 scale-100"
          leave-active-class="transition ease-in duration-75" leave-from-class="opacity-100 scale-100"
          leave-to-class="opacity-0 scale-95">
          <div v-if="helpOpen"
            class="absolute bottom-full right-0 mb-2 w-max origin-bottom-right panel p-2.5 text-[11px] leading-5 text-neutral-600 shadow-lg dark:text-neutral-400"
            @keydown.escape.stop="helpOpen = false">
            <p class="mb-1.5 eyebrow">操作提示</p>
            <div class="grid grid-cols-[auto_1fr] gap-x-3">
              <span class="font-medium text-neutral-800 dark:text-neutral-200">Ctrl+滚轮</span>
              <span>缩放</span>
              <span class="font-medium text-neutral-800 dark:text-neutral-200">Enter</span>
              <span>新建同级节点</span>
              <span class="font-medium text-neutral-800 dark:text-neutral-200">Tab</span>
              <span>新建子节点</span>
            </div>
          </div>
        </Transition>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from 'vue'
import AppIcon from '@/components/AppIcon.vue'
import { persistedRef, readUiState, writeUiState } from '@/utils/uiState'
import { detailPanelInset } from '@/utils/detailPanelContext'
import { resolveEditRequest } from '@/utils/mindmapEdit'
import { buildCoordinateGrid } from '@/utils/canvasGrid'
import {
  collapsedTaskSet,
  isTaskCollapsed,
  pruneTaskCollapseTree,
  setTaskCollapsed,
  setTasksCollapsed
} from '@/utils/taskCollapse'

const props = defineProps({
  nodes: { type: Array, default: () => [] },
  selectedTaskId: { type: Number, default: null },
  // 新建任务后由父级指定要立即重命名的节点
  editTaskId: { type: Number, default: null },
  // 新建立的链接，形如 { parentId, childId }；引用变化即按点击连线选中它
  newEdge: { type: Object, default: null }
})

const emit = defineEmits(['task-selected', 'create-task', 'rename-task', 'delete-task', 'toggle-done', 'drop-task', 'unlink-task', 'notify', 'background-click'])

const nodeWidth = 216
const fontSize = 13
const lineHeight = 16
const paddingTop = 10
const paddingX = 10
const maxLines = 3
const crossGap = 24
const mainGap = 84
// 出边按钮：有子任务时是折叠开关（折叠显计数、展开显减号），叶子节点悬停时变为加号；
// 与出边一侧的节点边框外切：圆心外移半径，再让开两个半描边，使外边框贴合、互不压线
const toggleRadius = 8
const toggleStroke = 1
// 节点边框描边：选中时加粗到 2，出边按钮随之多让半像素
const nodeStroke = 1
const selectedNodeStroke = 2
const toggleOffset = (selected) =>
  toggleRadius + (toggleStroke + (selected ? selectedNodeStroke : nodeStroke)) / 2
// 勾选框：真实任务左侧的完成开关，根节点没有
const checkboxSize = 14
const checkboxGap = 8
const checkboxReserve = checkboxSize + checkboxGap
// 选中节点右侧的更多操作按钮，与折叠控件同排；预留宽度含两枚按钮之间的间隔
const moreSize = 16
const moreGap = 4
const moreReserve = moreSize + moreGap * 2
// 更多操作菜单的宽度与估算高度：贴住画布右/下边缘时据此翻到左侧或向上夹紧
const menuWidth = 168
const menuHeight = 140

const container = ref(null)
const size = reactive({ width: 0, height: 0 })
// 避让宽度：画布保持整宽，右侧浮层面板盖住的部分不算可用视野，供适应视图与菜单边界使用
const visibleWidth = computed(() => Math.max(160, size.width - detailPanelInset.value))
// 聚焦宽度：三栏聚焦把选中节点放在中间栏，中间栏位于整宽中心，不受右侧浮层影响
const focusWidth = computed(() => Math.max(160, size.width))
const view = reactive({ x: 0, y: 0, scale: 1 })
const panning = ref(false)

// 根节点是真实任务：它的 id 就是根任务的 id；根任务还没拉到时用合成根 'root' 占位
const rootNodeId = computed(() => {
  const root = (props.nodes || []).find((node) => node.isRoot)
  return root ? String(root.id) : null
})

// 节点 id 在图里都是字符串；合成根没有真实任务 id，新建时不带父级
const toTaskId = (id) => (id != null && Number.isFinite(Number(id)) ? Number(id) : null)

// 根节点选中状态只在图内维护：根任务不进入任务详情面板
const rootSelected = ref(false)

// 正在原地编辑的节点与其输入内容：布局测量要用它撑高节点，因此声明在布局之前
const editingId = ref(null)
const editingText = ref('')

// 叶子节点的加号在指针靠近按钮位置时出现，不必先进入节点；离开后短暂保留，
// 给「从节点移向它外侧的加号」留出余量，不必精准一次命中。
// 从加号拉线期间由 draggingLeafId 保持显示，指针移远也不消失。
const hoveredLeafId = ref(null)
const draggingLeafId = ref(null)
let leafHideTimer = null
// 邻近判定半径（屏幕像素）：按缩放折算到图内，保持不同缩放下手感一致
const LEAF_CONTROL_REVEAL = 32

// 指针真正停在节点上（含节点内的加号/三点按钮）时显示更多操作按钮；
// 与叶子加号的邻近判定分开，后者在指针靠近按钮位置时就提前亮出
const hoveredNodeId = ref(null)

const onNodePointerEnter = (node) => {
  holdLeafControl(node)
  if (!node.isRoot) hoveredNodeId.value = String(node.id)
}

const onNodePointerLeave = () => {
  releaseLeafControl()
  hoveredNodeId.value = null
}

const isNodeHovered = (node) => !dragState.active && hoveredNodeId.value === String(node.id)

const holdLeafControl = (node) => {
  clearTimeout(leafHideTimer)
  leafHideTimer = null
  if (!node.isRoot && node.childCount === 0) hoveredLeafId.value = String(node.id)
}

const releaseLeafControl = () => {
  clearTimeout(leafHideTimer)
  leafHideTimer = setTimeout(() => {
    leafHideTimer = null
    hoveredLeafId.value = null
  }, 260)
}

const clearLeafControlHover = () => {
  clearTimeout(leafHideTimer)
  leafHideTimer = null
  hoveredLeafId.value = null
}

const isLeafHovered = (node) => !node.isRoot && node.childCount === 0
  && (hoveredLeafId.value === String(node.id) || draggingLeafId.value === String(node.id))

// 操作提示浮层：点按钮开关，点浮层或画布之外收起
const helpOpen = ref(false)
const helpRef = ref(null)
const onHelpOutside = (event) => {
  if (!helpOpen.value || helpRef.value?.contains(event.target)) return
  helpOpen.value = false
}
watch(helpOpen, (open) => {
  if (open) document.addEventListener('pointerdown', onHelpOutside)
  else document.removeEventListener('pointerdown', onHelpOutside)
})

// 只有横向布局：根节点在左时向右展开，在右时向左展开
const directionOptions = [
  { value: 'right', icon: 'chevronRight', label: '从左到右' },
  { value: 'left', icon: 'chevronLeft', label: '从右到左' }
]

// 布局方向属于阅读偏好，刷新后沿用上次选择
const direction = persistedRef('mindmap-direction', 'right', {
  validate: (value) => directionOptions.some((option) => option.value === value)
})

// 点阵底纹同属阅读偏好：开关状态本地保存，默认开启
const dotGrid = persistedRef('mindmap-dot-grid', true, {
  validate: (value) => typeof value === 'boolean'
})

// 画布底色：首次进入跟随系统主题，之后按用户手动选择固定，点阵点色随底色切换
const systemPrefersDark = typeof window !== 'undefined'
  && !!window.matchMedia?.('(prefers-color-scheme: dark)').matches
const darkCanvas = persistedRef('mindmap-dark-canvas', systemPrefersDark, {
  validate: (value) => typeof value === 'boolean'
})

// 坐标网格带世界坐标刻度，和点阵底纹互斥：同时铺两层纹理太花，切换时关掉另一层
const coordinateGrid = persistedRef('mindmap-coordinate-grid', false, {
  validate: (value) => typeof value === 'boolean'
})

const toggleDotGrid = () => {
  dotGrid.value = !dotGrid.value
  if (dotGrid.value) coordinateGrid.value = false
}

const toggleCoordinateGrid = () => {
  coordinateGrid.value = !coordinateGrid.value
  if (coordinateGrid.value) dotGrid.value = false
}

// 坐标原点取根节点出边按钮的圆心：布局仍以根节点左上角为基准，只把网格读数平移到按钮中心
const gridOrigin = computed(() => {
  const root = layout.value.nodes.find((node) => node.isRoot)
  return root
    ? { x: root.x + root.controlX, y: root.y + root.controlY }
    : { x: 0, y: 0 }
})

// 网格几何随视口、缩放与原点重算；未测量出画布尺寸时为空，不渲染任何线条
const gridLayer = computed(() => buildCoordinateGrid({
  width: size.width,
  height: size.height,
  offsetX: view.x,
  offsetY: view.y,
  scale: view.scale,
  originX: gridOrigin.value.x,
  originY: gridOrigin.value.y
}))

const currentDirection = computed(() =>
  directionOptions.find((option) => option.value === direction.value) ?? directionOptions[0])

// 视图控件跟随浮层右栏左移：面板多宽就右偏多少，面板收起时回到常规右下角
const controlsStyle = computed(() => ({
  right: `calc(0.75rem + ${detailPanelInset.value}px)`
}))

// 折叠状态按任务 ID 与列表、回收站共享：折叠后只隐藏子节点，任务本身与其它父级链接不受影响
const collapsedSet = collapsedTaskSet

// 可折叠的任务：含根节点在内，凡是有子任务的节点
const collapsibleIds = computed(() => {
  const ids = []
  const walk = (node) => {
    if (node.isRef) return
    if ((node.children || []).length) ids.push(String(node.id))
    ;(node.children || []).forEach(walk)
  }
  ;(props.nodes || []).forEach(walk)
  return ids
})

// 当前图里的真实任务 ID 变化时清理已删除任务的折叠记录；空图跳过，避免数据未到时清空
watch(() => props.nodes, (nodes) => {
  pruneTaskCollapseTree(nodes, { keep: rootNodeId.value ? [rootNodeId.value] : [] })
}, { immediate: true })

const allExpanded = computed(() =>
  collapsibleIds.value.every((id) => !collapsedSet.value.has(id)))

// 工具栏的展开/收起全部：只改折叠标记，任务数据不受影响；
// 收起时连根节点一起折叠，画布上只剩根节点。根节点由布局钉在原点，切换后不会跳动
const toggleAllCollapse = () => {
  if (allExpanded.value) {
    setTasksCollapsed(collapsibleIds.value, true)
    // 选中任务被收起隐藏后，选中回到根节点，详情面板随之收起
    if (selectedId.value !== rootNodeId.value) {
      rootSelected.value = true
      localSelection = true
      emit('task-selected', null)
      nextTick(() => { localSelection = false })
    }
    return
  }
  setTasksCollapsed(collapsibleIds.value, false)
}

// 单个按钮在左右两个方向之间轮换
const cycleDirection = () => {
  const index = directionOptions.findIndex((option) => option.value === direction.value)
  direction.value = directionOptions[(index + 1) % directionOptions.length].value
}

// 主方向是层级展开方向（横向），交叉方向是同层节点的排列方向（纵向）
const isForward = computed(() => direction.value === 'right')

// 折叠按钮位置：沿出边方向外切于节点边框，正对连线起点，参考图形软件的挂点样式
const controlPointFor = (height, selected) => {
  const gap = toggleOffset(selected)
  return direction.value === 'left'
    ? { x: -gap, y: height / 2 }
    : { x: nodeWidth + gap, y: height / 2 }
}

// 文字可用宽度（像素）：右侧只让出更多操作按钮，折叠按钮挂在节点外不占正文
const textWidthFor = (hasCheckbox) => Math.max(fontSize * 4,
  nodeWidth - paddingX * 2 - (hasCheckbox ? checkboxReserve : 0) - moreReserve)

// 量宽用的 canvas：显示态由这里折行、编辑态由浏览器折行，两边必须用同一套字体与宽度，
// 断行位置才会一致。字体取容器（未挂载时退回 body）的计算值，与输入框的 font-medium 对应
let measureCtx = null
let measureFont = ''
const measureContext = () => {
  if (!measureCtx) measureCtx = document.createElement('canvas').getContext('2d')
  if (!measureFont) {
    const el = container.value ?? document.body
    measureFont = getComputedStyle(el).fontFamily
    measureCtx.font = `500 ${fontSize}px ${measureFont}`
    // 字体串无法解析时回退到通用无衬线，避免按默认 10px 量出偏小的宽度
    if (!measureCtx.font.includes(`${fontSize}px`)) {
      measureFont = 'sans-serif'
      measureCtx.font = `500 ${fontSize}px ${measureFont}`
    }
  }
  return measureCtx
}

// 单个词/字的宽度缓存：每次输入都要重排所有节点，按字符串缓存能省掉重复测量
const widthCache = new Map()
const widthOf = (text) => {
  const cached = widthCache.get(text)
  if (cached !== undefined) return cached
  const width = measureContext().measureText(text).width
  if (widthCache.size > 4000) widthCache.clear()
  widthCache.set(text, width)
  return width
}

// 按真实像素宽度折行，规则与输入框里的浏览器排版对齐：
// CJK 与全角逐字可断、西文按词断、手工换行（Shift+Enter）是硬换行，空白行也占一行
const wrapLines = (text, maxWidth, limit = maxLines) => {
  const source = String(text || '未命名任务')
  const tokens = (source.match(/[\u2e80-\u9fff\uff00-\uffef]|[^\s\u2e80-\u9fff\uff00-\uffef]+|[ ]+|\n/g) ?? [])
    // 比整行还长的词（链接、长串）按字拆开，对应输入框的 break-word 行为
    .flatMap((token) => (token !== '\n' && token.trim() && widthOf(token) > maxWidth
      ? [...token]
      : [token]))
  const lines = []
  let line = ''
  let width = 0
  const flush = () => {
    lines.push(line)
    line = ''
    width = 0
  }

  tokens.forEach((token) => {
    if (token === '\n') {
      flush()
      return
    }
    const tokenWidth = widthOf(token)
    // 行尾空白不触发换行，与浏览器行为一致
    if (line && width + tokenWidth > maxWidth && token.trim()) flush()
    line += token
    width += tokenWidth
  })
  if (line) lines.push(line)

  if (lines.length <= limit) return lines
  const visible = lines.slice(0, limit)
  visible[limit - 1] = `${visible[limit - 1].replace(/.$/, '')}…`
  return visible
}

// 节点文案与高度统一在这里计算，布局只负责摆放。
// 编辑中的节点按输入内容实时撑高、不做行数截断：节点框与输入框同步长高，布局跟着重排，
// 长标题不会挤成内部滚动条；编辑结束后再回到常规的截断显示
const measureNode = (raw) => {
  // 占位槽不显示文字与控件，只按固定高度参与布局，给被拖节点腾出等宽空位
  if (raw.isPlaceholder) {
    return {
      ...raw,
      lines: [],
      subtitle: '',
      hasCheckbox: false,
      completed: false,
      textX: paddingX,
      textWidth: 0,
      controlX: nodeWidth,
      controlY: dropPlaceholderHeight / 2,
      height: dropPlaceholderHeight,
      selected: false
    }
  }

  const hasCheckbox = !raw.isRoot
  const completed = Boolean(raw.completed_at)
  // 选中态决定是否显示更多操作按钮：根节点不是真实任务，选中也不给操作菜单
  const selected = String(raw.id) === String(props.selectedTaskId) || (raw.isRoot && rootSelected.value)
  // 文字可用宽度：右侧固定让出更多操作按钮，选中时不再重排
  const textWidth = textWidthFor(hasCheckbox)
  const lines = editingId.value === Number(raw.id)
    ? wrapLines(editingText.value, textWidth, Infinity)
    : wrapLines(raw.title, textWidth)
  const subtitle = raw.subtitle || ''
  const height = paddingTop + lines.length * lineHeight + 12 + (subtitle ? 14 : 0)
  const control = controlPointFor(height, selected)
  return {
    ...raw,
    lines,
    subtitle,
    hasCheckbox,
    completed,
    // 勾选框占位后文字整体右移，根节点保持原位
    textX: paddingX + (hasCheckbox ? checkboxReserve : 0),
    textWidth,
    // 折叠控件挂在出边一侧的节点外，压在连线起点上，不占正文宽度
    controlX: control.x,
    controlY: control.y,
    height,
    selected
  }
}

// 父节点出边从折叠按钮中心出发，子节点入边落在边框上
const outAnchor = (node) => {
  const x = node.x + node.controlX
  const y = node.y + node.controlY
  return direction.value === 'left'
    ? { x, y, dx: -1, dy: 0 }
    : { x, y, dx: 1, dy: 0 }
}

const inAnchor = (node) => (direction.value === 'left'
  ? { x: node.x + nodeWidth, y: node.y + node.height / 2, dx: 1, dy: 0 }
  : { x: node.x, y: node.y + node.height / 2, dx: -1, dy: 0 })

// 交叉方向恒为纵向：同层节点上下排开
const crossVector = () => ({ x: 0, y: 1 })

// 折线转圆角路径：拐点用二次曲线过渡，避免生硬直角
const roundedPath = (points, radius = 8) => {
  const dist = (a, b) => Math.hypot(b.x - a.x, b.y - a.y)
  let d = `M${points[0].x} ${points[0].y}`

  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1]
    const cur = points[i]
    const next = points[i + 1]
    const lenIn = dist(prev, cur) || 1
    const lenOut = dist(cur, next) || 1
    const r = Math.min(radius, lenIn / 2, lenOut / 2)
    const inX = cur.x + (prev.x - cur.x) / lenIn * r
    const inY = cur.y + (prev.y - cur.y) / lenIn * r
    const outX = cur.x + (next.x - cur.x) / lenOut * r
    const outY = cur.y + (next.y - cur.y) / lenOut * r
    d += ` L${inX} ${inY} Q${cur.x} ${cur.y} ${outX} ${outY}`
  }

  const last = points[points.length - 1]
  return `${d} L${last.x} ${last.y}`
}

// 箭头长度（userSpaceOnUse）：线止于箭头尾部，箭头尖端正好落在节点边缘
const arrowLength = 6.4

// 三次贝塞尔 t=0.5 处的点，用于把删除按钮放在连线正中
const cubicMidpoint = (p0, c1, c2, p3) => ({
  x: (p0.x + 3 * c1.x + 3 * c2.x + p3.x) / 8,
  y: (p0.y + 3 * c1.y + 3 * c2.y + p3.y) / 8
})

// 统一生成连线路径：正向走平滑曲线，逆向绕到内容外侧
const createEdge = (from, to, key, backward = false, laneCross = null) => {
  const start = outAnchor(from)
  const tip = inAnchor(to)
  // dx/dy 是节点向外的法线，线端沿法线后退一个箭头长度，箭头尖端正好落在节点边缘
  const end = {
    x: tip.x + tip.dx * arrowLength,
    y: tip.y + tip.dy * arrowLength,
    dx: tip.dx,
    dy: tip.dy
  }
  const cross = crossVector()
  let d
  let midpoint

  if (from.id === to.id) {
    const half = 18
    const bulge = 42
    const startX = start.x - cross.x * half
    const startY = start.y - cross.y * half
    const endX = start.x + cross.x * half
    const endY = start.y + cross.y * half
    const c1 = { x: startX + start.dx * bulge - cross.x * bulge, y: startY + start.dy * bulge - cross.y * bulge }
    const c2 = { x: endX + start.dx * bulge + cross.x * bulge, y: endY + start.dy * bulge + cross.y * bulge }
    d = `M${startX} ${startY} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${endX} ${endY}`
    midpoint = cubicMidpoint({ x: startX, y: startY }, c1, c2, { x: endX, y: endY })
  } else if (backward) {
    // 回边绕到内容外侧再折回，入线方向与箭头一致
    const lane = laneCross ?? 0
    const stub = 26
    const crossOf = (point) => point.x * cross.x + point.y * cross.y
    const at = (point, mainOffset, crossValue) => ({
      x: point.x + point.dx * mainOffset + cross.x * (crossValue - crossOf(point)),
      y: point.y + point.dy * mainOffset + cross.y * (crossValue - crossOf(point))
    })

    const laneStart = at(start, stub, lane)
    const laneEnd = at(end, stub, lane)
    d = roundedPath([
      start,
      at(start, stub, crossOf(start)),
      laneStart,
      laneEnd,
      at(end, stub, crossOf(end)),
      end
    ])
    // 外围通道段的中心，属于连线中最容易辨认的位置
    midpoint = { x: (laneStart.x + laneEnd.x) / 2, y: (laneStart.y + laneEnd.y) / 2 }
  } else {
    // 两端控制点都沿主方向，曲线在节点处水平进出，箭头与线自然同向
    const distance = Math.abs(end.x - start.x)
    const bend = Math.max(20, distance * 0.5)
    const c1 = { x: start.x + start.dx * bend, y: start.y + start.dy * bend }
    const c2 = { x: end.x + end.dx * bend, y: end.y + end.dy * bend }
    d = `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
    midpoint = cubicMidpoint(start, c1, c2, end)
  }

  return { key, d, midpoint, from: from.id, to: to.id, deletable: from.id !== rootNodeId.value }
}

// 从展开森林还原唯一节点与全部边：回边节点折叠成指向目标的边
// 多父节点只要还有一条未折叠的父链就保持可见
const buildGraphData = (forest, collapsed) => {
  const allNodes = new Map()
  const edges = []
  const roots = []

  // 先完整遍历森林收集节点与边，折叠只影响可见性判定，不参与收集
  const walk = (node, parentId) => {
    const id = String(node.id)
    const children = node.children || []
    if (!node.isRef && !allNodes.has(id)) {
      allNodes.set(id, { ...node, childCount: children.length, collapsed: collapsed.has(id) })
    }
    if (parentId === null) {
      if (!node.isRef) roots.push(id)
    } else {
      edges.push({ from: parentId, to: node.isRef ? String(node.targetId) : id, isRef: !!node.isRef })
    }
    if (!node.isRef) children.forEach((child) => walk(child, id))
  }

  ;(forest || []).forEach((root) => walk(root, null))

  // 从根沿未折叠的边扩散：任一父链展开即可见，避免多父节点被单支折叠隐藏
  const outgoing = new Map()
  edges.forEach((edge) => {
    if (!outgoing.has(edge.from)) outgoing.set(edge.from, [])
    outgoing.get(edge.from).push(edge.to)
  })

  const visible = new Set(roots)
  const queue = [...roots]
  while (queue.length) {
    const id = queue.shift()
    if (allNodes.get(id)?.collapsed) continue
    ;(outgoing.get(id) || []).forEach((to) => {
      if (visible.has(to)) return
      visible.add(to)
      queue.push(to)
    })
  }

  // 折叠父节点不再展开子节点：布局只吃可见节点，子节点才能贴着父节点排布；
  // 折叠节点的出边也一并去掉，避免共享子节点经由另一父级可见时仍被折叠支拉深、拉偏
  const nodeList = [...allNodes.values()].filter((node) => visible.has(node.id))
  const edgeList = edges.filter((edge) => visible.has(edge.from) && visible.has(edge.to)
    && !collapsed.has(edge.from))

  return { nodes: nodeList, edges: edgeList }
}

// 拖拽状态必须在布局计算之前声明：占位槽预览让布局依赖它，而 watch(layout) 在 setup 阶段就会求值。
// 两种起点——拖节点表示「它将成为落点节点的子任务或排到它前后」，
// 拖折叠/加号按钮表示「落点节点将成为它的子任务」，方向相反；
// 节点拖拽是移动、重排还是新增链接由调用方按落点与父级数量决定，按钮拖拽只建链接。
// shadow 是拖节点时跟随指针的影子副本，grab 记录按下点相对节点左上角的偏移
const dragState = reactive({
  active: false,
  sourceId: null,
  targetId: null,
  // 落点语义：inside 成为子任务；before/after 插到目标节点的兄弟序列前后
  dropPosition: 'inside',
  preview: null,
  shadow: null,
  grab: { x: 0, y: 0 },
  moved: false,
  fromToggle: false
})
let dragStart = { x: 0, y: 0 }
let lastDragEndAt = 0

// 拖拽排序的占位槽：在目标兄弟序列里临时插入一个假节点，让布局真正腾出空位。
// 只用于显示；拖拽命中检测仍用不含占位槽的布局，避免目标节点被顶走后反复抖动
const DROP_PLACEHOLDER_ID = '__drop-placeholder__'
const dropPlaceholderHeight = 20

const insertDropPlaceholder = (forest) => {
  if (!dragState.active || !dragState.moved || dragState.fromToggle) return forest
  if (!dragState.targetId || dragState.dropPosition === 'inside') return forest

  const placeholder = {
    id: DROP_PLACEHOLDER_ID,
    title: '',
    isPlaceholder: true,
    children: []
  }
  let inserted = false

  const walk = (nodes) => {
    if (inserted) return nodes
    const index = nodes.findIndex((node) => !node.isRef && String(node.id) === dragState.targetId)
    if (index !== -1) {
      inserted = true
      const next = nodes.slice()
      next.splice(dragState.dropPosition === 'before' ? index : index + 1, 0, placeholder)
      return next
    }

    let changed = false
    const next = nodes.map((node) => {
      if (inserted || node.isRef || !(node.children || []).length) return node
      const children = walk(node.children)
      if (children === node.children) return node
      changed = true
      return { ...node, children }
    })
    return changed ? next : nodes
  }

  return walk(forest || [])
}

const dropPreviewForest = computed(() => insertDropPlaceholder(props.nodes))

// 有向图：按强连通分量分层，环内节点顺序排列，回边绕行展示
// 只用可见节点参与布局：折叠后兄弟节点收拢到折叠父节点周围，展开后子节点重新贴回父节点
const computeGraphLayout = (forest) => {
  const { nodes: rawNodes, edges: rawEdges } = buildGraphData(forest, collapsedSet.value)
  if (rawNodes.length === 0) {
    return { nodes: [], edges: [], contentWidth: 0, contentHeight: 0, minX: 0, minY: 0 }
  }

  const nodes = rawNodes.map(measureNode)
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const adjacency = new Map(nodes.map((node) => [node.id, []]))

  rawEdges.forEach((edge) => {
    if (byId.has(edge.from) && byId.has(edge.to)) adjacency.get(edge.from).push(edge.to)
  })

  // Tarjan 求强连通分量
  let counter = 0
  const indices = new Map()
  const lowlinks = new Map()
  const stack = []
  const onStack = new Set()
  const components = []
  const componentOf = new Map()

  const connect = (id) => {
    indices.set(id, counter)
    lowlinks.set(id, counter)
    counter += 1
    stack.push(id)
    onStack.add(id)

    for (const next of adjacency.get(id)) {
      if (!indices.has(next)) {
        connect(next)
        lowlinks.set(id, Math.min(lowlinks.get(id), lowlinks.get(next)))
      } else if (onStack.has(next)) {
        lowlinks.set(id, Math.min(lowlinks.get(id), indices.get(next)))
      }
    }

    if (lowlinks.get(id) === indices.get(id)) {
      const component = []
      let member
      do {
        member = stack.pop()
        onStack.delete(member)
        component.push(member)
        componentOf.set(member, components.length)
      } while (member !== id)
      components.push(component)
    }
  }

  nodes.forEach((node) => {
    if (!indices.has(node.id)) connect(node.id)
  })

  // 分量缩点后做最长路径分层
  const componentEdges = Array.from({ length: components.length }, () => new Set())
  rawEdges.forEach((edge) => {
    const from = componentOf.get(edge.from)
    const to = componentOf.get(edge.to)
    if (from === undefined || to === undefined || from === to) return
    componentEdges[from].add(to)
  })

  const indegree = new Array(components.length).fill(0)
  componentEdges.forEach((targets) => targets.forEach((to) => { indegree[to] += 1 }))

  const queue = []
  indegree.forEach((count, index) => { if (count === 0) queue.push(index) })

  const componentLayer = new Array(components.length).fill(0)
  while (queue.length > 0) {
    const current = queue.shift()
    componentEdges[current].forEach((next) => {
      componentLayer[next] = Math.max(componentLayer[next], componentLayer[current] + 1)
      indegree[next] -= 1
      if (indegree[next] === 0) queue.push(next)
    })
  }

  // 环内节点按顺序占一层，让环方向仍然沿主方向可读
  const nodeLayer = new Map()
  components.forEach((component, index) => {
    const ordered = [...component].sort((a, b) => {
      const diff = Number(a) - Number(b)
      return Number.isFinite(diff) && diff !== 0 ? diff : String(a).localeCompare(String(b))
    })
    ordered.forEach((id, offset) => nodeLayer.set(id, componentLayer[index] + offset))
  })

  // 每层沿交叉方向排开，层与层沿主方向堆叠；节点等宽，层厚就是节点宽度
  const layerKeys = [...new Set(nodes.map((node) => nodeLayer.get(node.id) ?? 0))]
    .sort((a, b) => a - b)
  const layerMain = new Map()
  layerKeys.forEach((layer) => {
    layerMain.set(layer, nodeWidth)
  })

  let cursorMain = 0
  const layerStart = new Map()
  layerKeys.forEach((layer) => {
    layerStart.set(layer, cursorMain)
    cursorMain += layerMain.get(layer) + mainGap
  })
  const contentMain = Math.max(cursorMain - mainGap, 0)

  // 交叉方向：分层图布局。层内顺序按父节点位置（重心）排序，坐标由「贴近父节点 + 同层最小间距」求得
  const crossCenter = new Map()
  const crossSizeOf = (id) => byId.get(id).height

  // 只统计沿主方向向前的边；回边绕行展示，不参与交叉方向定位
  const parentsOf = new Map(nodes.map((node) => [node.id, []]))
  const childrenOf = new Map(nodes.map((node) => [node.id, []]))
  rawEdges.forEach((edge) => {
    if (edge.from === edge.to) return
    if (!parentsOf.has(edge.to) || !childrenOf.has(edge.from)) return
    const fromLayer = nodeLayer.get(edge.from) ?? 0
    const toLayer = nodeLayer.get(edge.to) ?? 0
    if (fromLayer >= toLayer) return
    parentsOf.get(edge.to).push(edge.from)
    childrenOf.get(edge.from).push(edge.to)
  })

  // 层内顺序：沿可见边（未折叠父节点的出边）做森林的深度优先序，兄弟仍按 child_ids 相邻，作为初始顺序。
  // 折叠父节点的出边已被剔除，共享子节点因此跟着仍然可见的父级排序，不会被折叠支的旧位置钉在层首。
  const order = new Map(layerKeys.map((layer) => [layer, []]))
  const dfsIndex = new Map()
  const visibleChildren = new Map(nodes.map((node) => [node.id, []]))
  rawEdges.forEach((edge) => {
    if (visibleChildren.has(edge.from)) visibleChildren.get(edge.from).push(edge.to)
  })
  let dfsCursor = 0
  const walkVisible = (id) => {
    if (dfsIndex.has(id)) return
    dfsIndex.set(id, dfsCursor)
    dfsCursor += 1
    ;(visibleChildren.get(id) || []).forEach(walkVisible)
  }
  ;(props.nodes || []).forEach((root) => {
    const id = String(root.id)
    if (byId.has(id)) walkVisible(id)
  })
  nodes.forEach((node) => {
    const layer = nodeLayer.get(node.id) ?? 0
    order.get(layer).push(node)
  })
  order.forEach((list) => list.sort((a, b) => (dfsIndex.get(a.id) ?? 0) - (dfsIndex.get(b.id) ?? 0)))

  // 子树块跨度：节点与相邻一列的子节点一起在交叉方向占用的空间。
  // 子节点只归第一个紧邻的父级，多父各占一份会把同列分支顶开；
  // 跨层链接的目标排在别的列，整棵子树不参与本列的留位
  const laneChildren = new Map(nodes.map((node) => [node.id, []]))
  const laneOwner = new Set()
  rawEdges.forEach((edge) => {
    const fromLayer = nodeLayer.get(edge.from)
    const toLayer = nodeLayer.get(edge.to)
    if (fromLayer === undefined || toLayer === undefined) return
    if (toLayer !== fromLayer + 1) return
    if (laneOwner.has(edge.to)) return
    laneOwner.add(edge.to)
    laneChildren.get(edge.from).push(edge.to)
  })

  const blockSize = new Map()
  const blockSizeOf = (id) => {
    const cached = blockSize.get(id)
    if (cached !== undefined) return cached
    let span = 0
    ;(laneChildren.get(id) || []).forEach((child, index) => {
      span += blockSizeOf(child) + (index > 0 ? crossGap : 0)
    })
    const value = Math.max(crossSizeOf(id), span)
    blockSize.set(id, value)
    return value
  }

  // 初始坐标：按层内顺序依次排开
  layerKeys.forEach((layer) => {
    let cursor = 0
    order.get(layer).forEach((node) => {
      const half = blockSizeOf(node.id) / 2
      crossCenter.set(node.id, cursor + half)
      cursor += blockSizeOf(node.id) + crossGap
    })
  })

  // 保序回归（PAVA）：把期望位置投影到「同层最小间距」约束上，得到该层的最优解
  const projectLayer = (layer) => {
    const list = order.get(layer)
    if (list.length === 0) return

    const offsets = [0]
    for (let i = 1; i < list.length; i += 1) {
      const gap = (blockSizeOf(list[i - 1].id) + blockSizeOf(list[i].id)) / 2 + crossGap
      offsets.push(offsets[i - 1] + gap)
    }

    // 相邻违例合并成块，块内取均值，保证结果单调不减
    const blocks = []
    list.forEach((node, index) => {
      blocks.push({ sum: crossCenter.get(node.id) - offsets[index], count: 1 })
      while (blocks.length > 1) {
        const last = blocks[blocks.length - 1]
        const prev = blocks[blocks.length - 2]
        if (prev.sum / prev.count <= last.sum / last.count) break
        prev.sum += last.sum
        prev.count += last.count
        blocks.pop()
      }
    })

    const desired = list.map((node) => crossCenter.get(node.id))
    let cursor = 0
    blocks.forEach((block) => {
      const value = block.sum / block.count
      for (let i = 0; i < block.count; i += 1) {
        crossCenter.set(list[cursor].id, value + offsets[cursor])
        cursor += 1
      }
    })

    // 投影会整体推移整层，按期望均值平移回来，避免逐层累积漂移
    const mean = (values) => values.reduce((a, b) => a + b, 0) / values.length
    const drift = mean(desired) - mean(list.map((node) => crossCenter.get(node.id)))
    list.forEach((node) => crossCenter.set(node.id, crossCenter.get(node.id) + drift))
  }

  const averageOf = (ids) => {
    const values = ids.map((id) => crossCenter.get(id)).filter((value) => value !== undefined)
    return values.length ? values.reduce((a, b) => a + b, 0) / values.length : null
  }

  // 每个节点连同其紧邻列后代组成一个块，间距回收时整块平移，子树内部相对位置不变
  const blockNodes = new Map()
  const collectBlock = (id, seen) => {
    if (seen.has(id)) return []
    seen.add(id)
    const ids = [id]
    ;(laneChildren.get(id) || []).forEach((child) => {
      ids.push(...collectBlock(child, seen))
    })
    return ids
  }
  nodes.forEach((node) => blockNodes.set(node.id, collectBlock(node.id, new Set())))

  // 块在交叉方向的实际可见范围，用于按边缘而不是块中心计算空白
  const blockBoundsCache = new Map()
  const blockBoundsOf = (id) => {
    const cached = blockBoundsCache.get(id)
    if (cached) return cached
    let top = crossCenter.get(id) - crossSizeOf(id) / 2
    let bottom = crossCenter.get(id) + crossSizeOf(id) / 2
    ;(laneChildren.get(id) || []).forEach((child) => {
      const bounds = blockBoundsOf(child)
      if (bounds.top < top) top = bounds.top
      if (bounds.bottom > bottom) bottom = bounds.bottom
    })
    const value = { top, bottom }
    blockBoundsCache.set(id, value)
    return value
  }

  // 只压缩同一父级下兄弟分支之间的异常空白，正常展开空间保持不变
  const shareParent = (a, b) => {
    const parents = new Set(parentsOf.get(b) || [])
    return (parentsOf.get(a) || []).some((id) => parents.has(id))
  }

  const shiftBlock = (id, shift, moved) => {
    ;(blockNodes.get(id) || [id]).forEach((member) => {
      if (moved.has(member)) return
      moved.add(member)
      crossCenter.set(member, crossCenter.get(member) + shift)
    })
  }

  const limitGaps = (layer, moved) => {
    const list = order.get(layer)
    // 兄弟分支之间保留两个间隔，既有展开后的呼吸空间，又不会留下异常大的空白
    const maxGap = crossGap * 2
    for (let i = list.length - 1; i > 0; i -= 1) {
      const prev = list[i - 1]
      const cur = list[i]
      if (moved.has(prev.id) || moved.has(cur.id)) continue
      if (!shareParent(prev.id, cur.id)) continue
      blockBoundsCache.clear()
      const gap = blockBoundsOf(cur.id).top - blockBoundsOf(prev.id).bottom
      if (gap <= maxGap) continue
      const shift = gap - maxGap
      for (let j = 0; j < i; j += 1) shiftBlock(list[j].id, shift, moved)
      blockBoundsCache.clear()
    }
  }

  // 逐层定位：down 让子节点贴近父节点（多父节点取各父节点位置的平均值），
  // up 让父节点居中于子节点带。每层定位后投影回间距约束，避免重叠。
  const relaxLayer = (layer, mode) => {
    order.get(layer).forEach((node) => {
      const parents = averageOf(parentsOf.get(node.id))
      const children = averageOf(childrenOf.get(node.id))
      // up 时叶子没有子节点，保持当前位置，由父节点向它靠拢
      const target = mode === 'down' ? (parents ?? children) : children
      if (target !== null) crossCenter.set(node.id, target)
    })
    // 层内顺序固定为初始顺序，只让坐标收敛；每轮重排会让折叠/展开后顺序漂移
    projectLayer(layer)
  }

  // 交替收敛：父节点先居中于子节点带，子节点再贴近父节点，最后以子节点贴近父节点收尾
  for (let round = 0; round < 3; round += 1) {
    ;[...layerKeys].reverse().forEach((layer) => relaxLayer(layer, 'up'))
    layerKeys.forEach((layer) => relaxLayer(layer, 'down'))
    // 自浅向深回收间距：上层块先整体下移，下层成员跟随块移动，不再单独压缩
    const moved = new Set()
    layerKeys.forEach((layer) => limitGaps(layer, moved))
  }

  let minCross = Infinity
  let maxCross = -Infinity
  crossCenter.forEach((center, id) => {
    const half = crossSizeOf(id) / 2
    minCross = Math.min(minCross, center - half)
    maxCross = Math.max(maxCross, center + half)
  })

  // 坐标原点钉在根节点的左上角：展开/折叠只改变其它节点的相对位置，根节点在图上不动
  const anchorNode = nodes.find((node) => node.isRoot) ?? nodes[0]
  const crossOrigin = crossCenter.get(anchorNode.id) - crossSizeOf(anchorNode.id) / 2
  const anchorLayer = nodeLayer.get(anchorNode.id) ?? 0
  const anchorMain = layerStart.get(anchorLayer)
    + (layerMain.get(anchorLayer) - nodeWidth) / 2
  const mainOrigin = isForward.value
    ? anchorMain
    : contentMain - anchorMain - nodeWidth

  nodes.forEach((node) => {
    const cross = crossCenter.get(node.id) - node.height / 2 - crossOrigin
    const layer = nodeLayer.get(node.id) ?? 0
    const mainOffset = layerStart.get(layer) + (layerMain.get(layer) - nodeWidth) / 2
    const main = (isForward.value ? mainOffset : contentMain - mainOffset - nodeWidth)
      - mainOrigin
    node.x = main
    node.y = cross
  })

  // 内容包围盒同样是相对根节点的偏移，可能为负值
  const crossMin = minCross - crossOrigin
  const crossMax = maxCross - crossOrigin
  const contentCross = crossMax - crossMin
  const mainMin = -mainOrigin

  // 占位槽只参与布局，不画连线
  const routedEdges = rawEdges
    .filter((edge) => edge.from !== DROP_PLACEHOLDER_ID && edge.to !== DROP_PLACEHOLDER_ID)
    .map((edge, index) => {
      const from = byId.get(edge.from)
      const to = byId.get(edge.to)
      if (!from || !to) return null
      const backward = (nodeLayer.get(to.id) ?? 0) <= (nodeLayer.get(from.id) ?? 0)
      // 回边绕到内容外侧，通道按边序号错开避免重叠
      const laneCross = backward
        ? crossMax + 24 + (index % 4) * 14
        : null
      return createEdge(from, to, `${edge.from}->${edge.to}-${index}`, backward, laneCross)
    }).filter(Boolean)

  // 只渲染可见节点与两端都可见的边
  return {
    nodes,
    edges: routedEdges,
    contentWidth: contentMain,
    contentHeight: contentCross,
    // 内容左上角在图坐标里的位置，供适应视图对齐
    minX: mainMin,
    minY: crossMin
  }
}

// 拖拽命中与键盘/选中判断都用不含占位槽的布局；渲染用带占位槽的布局
const hitLayout = computed(() => computeGraphLayout(props.nodes))
const layout = computed(() => computeGraphLayout(dropPreviewForest.value))
const renderNodes = computed(() => layout.value.nodes.filter((node) => !node.isPlaceholder))
const dropPlaceholderNode = computed(() =>
  layout.value.nodes.find((node) => node.isPlaceholder) ?? null)

let hasInteracted = false

// 上次离开时的平移与缩放：尺寸未变时直接沿用，不重新适配
const savedView = readUiState('mindmap-view:v2', null)
const restoredView = Boolean(savedView
  && Number.isFinite(savedView.x)
  && Number.isFinite(savedView.y)
  && Number.isFinite(savedView.scale)
  && savedView.scale > 0)
if (restoredView) {
  Object.assign(view, savedView)
  hasInteracted = true
}

// 平移缩放后记住视口；连续操作时合并成一次写入。
// 键名带 v2：布局坐标原点改到根节点，旧的平移量与新区间不通用
let saveViewTimer = null
watch(view, () => {
  if (!hasInteracted) return
  clearTimeout(saveViewTimer)
  saveViewTimer = setTimeout(() => writeUiState('mindmap-view:v2', { ...view }), 200)
}, { deep: true })

const fitView = () => {
  const el = container.value
  if (!el) return
  // 适应视图是显式离开三栏视野的手动操作
  columnFocus.value = false
  const { contentWidth, contentHeight, minX, minY } = layout.value
  if (!contentWidth || !size.width || !size.height) return

  const pad = 48
  const scale = Math.max(0.15, Math.min(
    (visibleWidth.value - pad * 2) / contentWidth,
    (size.height - pad * 2) / contentHeight,
    1.25
  ))
  animateView({
    scale,
    // 内容左上角不在原点：按 minX / minY 把包围盒摆到可见区中央
    x: (visibleWidth.value - contentWidth * scale) / 2 - minX * scale,
    y: (size.height - contentHeight * scale) / 2 - minY * scale
  })
}

// 折叠开关：只切换该节点的展开状态，子任务数据不受影响
const toggleCollapse = (node) => {
  const id = String(node.id)
  const collapsing = !isTaskCollapsed(id)
  const next = new Set(collapsedSet.value)
  if (collapsing) next.add(id)
  else next.delete(id)

  // 折叠后选中项确实被藏起来时，选中落到折叠节点上，避免详情面板指向看不见的任务；
  // 多父任务仍可经由其它父链显示，这种情况下保持选中不动
  const selected = selectedId.value
  if (collapsing && selected && selected !== id && selected !== rootNodeId.value) {
    const stillVisible = buildGraphData(props.nodes, next).nodes
      .some((node) => node.id === selected)
    if (!stillVisible) {
      if (id === rootNodeId.value) {
        // 折叠根节点后选中回到根节点自身，不把根任务交给详情面板
        rootSelected.value = true
        localSelection = true
        emit('task-selected', null)
        nextTick(() => { localSelection = false })
      } else {
        rootSelected.value = false
        emit('task-selected', Number(id))
      }
    }
  }

  // 布局以根节点为原点，重排不会带动视口，展开/折叠只改变其它节点的位置
  setTaskCollapsed(id, collapsing)
}

// 勾选框：切换完成状态，根节点不是真实任务，不参与
const toggleDone = (node) => {
  if (node.isRoot) return
  emit('toggle-done', Number(node.id))
}

// 图内删除的统一出口：菜单项与快捷键共用
const emitDelete = (id) => {
  emit('delete-task', Number(id))
}

// 选中节点的更多操作菜单：只给真实任务，位置跟着当前节点走
const menuNodeId = ref(null)
const menuNode = computed(() => menuNodeId.value == null
  ? null
  : layout.value.nodes.find((node) => String(node.id) === menuNodeId.value) ?? null)

// 右键唤出时的锚点，存图内坐标，缩放平移时菜单跟着指针位置一起走；为空表示从三点按钮展开
const menuAnchor = ref(null)

// 菜单项全部复用已有能力，右侧标注对应快捷键，方便用户之后直接用键盘
const MENU_ITEMS = [
  { key: 'rename', label: '重命名', hint: 'F2', icon: 'edit' },
  { key: 'child', label: '新建子任务', hint: 'Tab', icon: 'plus' },
  { key: 'copy', label: '复制为 Markdown', hint: 'Ctrl+C', icon: 'copy' },
  { key: 'delete', label: '删除任务', hint: 'Del', icon: 'trash', danger: true }
]

const closeNodeMenu = () => {
  menuNodeId.value = null
  menuAnchor.value = null
}

// 三点按钮开合菜单；锚点清空，菜单回到按钮下方
const toggleNodeMenu = (node) => {
  const id = String(node.id)
  menuAnchor.value = null
  menuNodeId.value = menuNodeId.value === id ? null : id
}

// 右键节点直接唤出菜单：不改变当前选中，避免顺带切换详情面板与视野；
// 锚点取指针在图内的坐标，菜单像系统右键菜单一样从这里展开
const openNodeMenuAt = (node, event) => {
  // 原地编辑保留浏览器右键菜单，选词与粘贴要用；根节点没有可操作的菜单，同样放行
  if (editingId.value != null || node.isRoot || !container.value) return
  event.preventDefault()
  const rect = container.value.getBoundingClientRect()
  menuAnchor.value = {
    x: (event.clientX - rect.left - view.x) / view.scale,
    y: (event.clientY - rect.top - view.y) / view.scale
  }
  menuNodeId.value = String(node.id)
}

// 菜单定位：右键从指针处展开，点按钮则贴在按钮正下方居中；
// 放不下时翻到上方，再夹进画布可见区域
const menuPosition = computed(() => {
  const node = menuNode.value
  if (!node) return { left: 0, top: 0 }
  const anchor = menuAnchor.value
  const anchorX = anchor
    ? view.x + anchor.x * view.scale
    : view.x + (node.x + nodeWidth - paddingX - moreSize / 2) * view.scale
  const anchorY = anchor
    ? view.y + anchor.y * view.scale
    : view.y + (node.y + node.height / 2) * view.scale
  const left = Math.max(8, Math.min(anchorX - (anchor ? 0 : menuWidth / 2), visibleWidth.value - menuWidth - 8))
  const gap = anchor ? 4 : 14
  const below = anchorY + gap
  const top = below + menuHeight > size.height - 8
    ? Math.max(8, anchorY - gap - menuHeight)
    : below
  return { left, top }
})

const runMenuAction = (key) => {
  const id = menuNodeId.value
  closeNodeMenu()
  if (id == null) return
  if (key === 'rename') startEditById(id)
  else if (key === 'child') createChild(id)
  else if (key === 'copy') copySubtreeAsMarkdown(id)
  else if (key === 'delete') emitDelete(id)
}

// 点菜单外任意位置收起；菜单与触发器自身的按下都不冒泡到文档，所以这里只处理外部点击
const onMenuOutside = () => {
  closeNodeMenu()
}

watch(menuNodeId, (id) => {
  if (id == null) document.removeEventListener('pointerdown', onMenuOutside)
  else document.addEventListener('pointerdown', onMenuOutside)
})

// 根节点「全部任务」不是真实任务，选中状态只在图内维护
const selectNode = (node) => {
  // 拖拽建链接后紧跟的 click 不应改变选中
  if (Date.now() - lastDragEndAt < 250) return
  closeNodeMenu()
  selectedEdgeKey.value = null
  container.value?.focus({ preventScroll: true })

  if (node.isRoot) {
    rootSelected.value = true
    // 图内点击自己负责居中，标记一下让 watch 跳过，避免重复启动动画
    localSelection = true
    emit('task-selected', null)
    scheduleCenter(node.id)
    nextTick(() => { localSelection = false })
    return
  }

  rootSelected.value = false
  // 图内点击自己负责居中，标记一下让 watch 跳过，避免重复启动动画
  localSelection = true
  emit('task-selected', Number(node.id))
  scheduleCenter(node.id)
  nextTick(() => { localSelection = false })
}

// 连线选中：与节点选中互斥，选中连线时收起任务详情
const selectedEdgeKey = ref(null)

// 当前选中的连线，用于定位中点上的删除按钮
const selectedEdge = computed(() =>
  layout.value.edges.find((edge) => edge.key === selectedEdgeKey.value) ?? null)

// 未选中的连线只铺在节点下层，选中的单独画在节点之上
const baseEdges = computed(() =>
  layout.value.edges.filter((edge) => edge.key !== selectedEdgeKey.value))

// 选中节点的祖先链：沿入边回溯到根，用强调色标出当前任务所在分支
const highlightedEdges = computed(() => {
  const id = selectedId.value
  const keys = new Set()
  if (!id) return keys

  const incoming = new Map()
  layout.value.edges.forEach((edge) => {
    if (!incoming.has(edge.to)) incoming.set(edge.to, [])
    incoming.get(edge.to).push(edge)
  })

  const visited = new Set([id])
  const queue = [id]
  while (queue.length > 0) {
    const current = queue.shift()
    ;(incoming.get(current) || []).forEach((edge) => {
      keys.add(edge.key)
      if (!visited.has(edge.from)) {
        visited.add(edge.from)
        queue.push(edge.from)
      }
    })
  }
  return keys
})

const selectEdge = (edge) => {
  if (!edge.deletable) return
  closeNodeMenu()
  container.value?.focus({ preventScroll: true })
  selectedEdgeKey.value = selectedEdgeKey.value === edge.key ? null : edge.key
  if (selectedEdgeKey.value) emit('task-selected', null)
}

// 新建立的链接直接走点击选线的同一条路径：强调色、加粗与中点删除按钮一起出现，
// 用户不必在一堆细灰线里找刚连上的那条。等布局更新完再找边，避免刚展开父节点时还看不到它
watch(() => props.newEdge, (link) => {
  if (!link) return
  const edge = layout.value.edges.find((item) =>
    item.from === String(link.parentId) && item.to === String(link.childId))
  if (!edge) return

  if (edge.deletable) {
    selectEdge(edge)
    return
  }
  // 根任务发出的边没有中点删除按钮，无法走点击路径，仍给出同款高亮
  selectedEdgeKey.value = edge.key
  emit('task-selected', null)
}, { flush: 'post' })

// 删除选中连线：只解除父子引用，任务本身保留
const deleteSelectedEdge = () => {
  const edge = selectedEdge.value
  if (!edge || !edge.deletable) return
  selectedEdgeKey.value = null
  emit('unlink-task', { parentId: Number(edge.from), childId: Number(edge.to) })
}

// 删除按钮两段式确认：首次点击变成待确认，再次点击才真正删除
const confirmUnlink = ref(false)

const onUnlinkClick = () => {
  if (!confirmUnlink.value) {
    confirmUnlink.value = true
    return
  }
  confirmUnlink.value = false
  deleteSelectedEdge()
}

// 切换到别的连线或取消选中时，收起待确认状态
watch(selectedEdgeKey, () => {
  confirmUnlink.value = false
})

// 布局变化后旧连线、旧节点可能已不存在，清掉悬空的选中与菜单
watch(layout, () => {
  if (selectedEdgeKey.value != null
    && !layout.value.edges.some((edge) => edge.key === selectedEdgeKey.value)) {
    selectedEdgeKey.value = null
  }
  if (menuNodeId.value != null && menuNode.value == null) closeNodeMenu()
})

// 森林索引：键盘导航与新建需要知道每个任务的父级与同级顺序
// 多父链接等价，引用节点也要计入父级的子列表，否则从第二个父级无法导航到该任务
const nodeIndex = computed(() => {
  const parentOf = new Map()
  const parentsOf = new Map()
  // null 键存放根层级任务，供同级导航使用
  const childrenOf = new Map([[null, []]])

  const walk = (node, parentId) => {
    const id = node.isRef ? String(node.targetId) : String(node.id)
    if (!childrenOf.has(id)) childrenOf.set(id, [])
    if (parentId !== null) {
      childrenOf.get(parentId)?.push(id)
      const parents = parentsOf.get(id) || []
      if (!parents.includes(parentId)) parents.push(parentId)
      parentsOf.set(id, parents)
    }
    if (node.isRef) return

    if (!parentOf.has(id)) parentOf.set(id, parentId)
    ;(node.children || []).forEach((child) => walk(child, id))
  }

  ;(props.nodes || []).forEach((root) => walk(root, null))
  return { parentOf, parentsOf, childrenOf }
})

// 多父任务在图上只画一份节点；交互优先选当前可见且展开的父级，避免跳回被折叠的分支
const visibleParentOf = (id) => {
  const parents = nodeIndex.value.parentsOf.get(String(id)) || []
  const visible = new Set(layout.value.nodes.map((node) => node.id))
  return parents.find((parentId) => visible.has(parentId) && !collapsedSet.value.has(parentId))
    ?? parents.find((parentId) => visible.has(parentId))
    ?? null
}

const selectedId = computed(() => {
  if (rootSelected.value) return rootNodeId.value
  return props.selectedTaskId == null ? null : String(props.selectedTaskId)
})

// 选中项变化时收起更多操作菜单，避免菜单残留在别的节点旁
watch(selectedId, () => {
  closeNodeMenu()
})

// 视口动画：居中与适应视图都走同一套缓动，避免画面瞬移
let viewAnimation = null

const stopViewAnimation = () => {
  if (viewAnimation == null) return
  cancelAnimationFrame(viewAnimation)
  viewAnimation = null
}

// 缓出曲线：起步快、收尾稳，长距离移动也不会显得拖沓
const easeOutCubic = (t) => 1 - (1 - t) ** 3

const animateView = (target, duration = 320) => {
  stopViewAnimation()
  const from = { x: view.x, y: view.y, scale: view.scale }
  const start = performance.now()

  const step = (now) => {
    const progress = Math.min(1, (now - start) / duration)
    const eased = easeOutCubic(progress)
    view.x = from.x + (target.x - from.x) * eased
    view.y = from.y + (target.y - from.y) * eased
    view.scale = from.scale + (target.scale - from.scale) * eased
    if (progress < 1) {
      viewAnimation = requestAnimationFrame(step)
    } else {
      viewAnimation = null
    }
  }

  viewAnimation = requestAnimationFrame(step)
}

// 选中节点时的标准观看档位：节点主体约占视口宽度的 1/5，
// 窄视口下退让到刚好放得下节点，避免被裁切
const FOCUS_SCALE = 1.1
const focusScale = () => Math.max(0.15, Math.min(
  FOCUS_SCALE,
  (focusWidth.value - 96) / nodeWidth
))

// 聚焦固定为三栏视野：父级层、当前层、子级层各占一栏，与真实父子关系无关。
// 多父、回边或子级落在远处时也不会把画面缩得过小；叶子还没子级时栏位照样留着
const focusMainSpan = () => nodeWidth * 3 + mainGap * 2

// 三栏视野状态：选中节点后进入；手动缩放/平移、适应视图或编辑时退出。
// 处于该状态时容器本身变宽变窄（窗口缩放、侧栏开合）要重新按三栏贴合，否则画面会错位；
// 右侧浮层开关不改画布宽度，因此不触发重排
const columnFocus = ref(false)

const columnFocusScale = () => {
  const pad = 48
  return Math.max(0.15, Math.min(
    FOCUS_SCALE,
    (focusWidth.value - pad * 2) / Math.max(focusMainSpan(), 1)
  ))
}

// 聚焦目标：横向把节点摆在画布水平中央，纵向沿用节点当前的屏幕位置，
// 只有掉出视口时才夹回可见范围
const focusTargetFor = (node) => {
  const scale = columnFocusScale()
  const centerY = node.y + node.height / 2
  const anchorY = view.y + centerY * view.scale
  const margin = (node.height * scale) / 2 + 24
  return {
    x: focusWidth.value / 2 - (node.x + nodeWidth / 2) * scale,
    y: Math.max(margin, Math.min(anchorY, size.height - margin)) - centerY * scale,
    scale
  }
}

// 把选中节点摆到聚焦目标位置
const centerOnNode = (id) => {
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (!node || !size.width || !size.height) return
  columnFocus.value = true
  const target = focusTargetFor(node)
  // 位置与缩放都已到位时不再启动动画，重复点击同一节点不会抖动
  const settled = Math.abs(target.x - view.x) < 0.5
    && Math.abs(target.y - view.y) < 0.5
    && Math.abs(target.scale - view.scale) < 0.001
  if (settled) return
  animateView(target)
}

// 画布尺寸变化时按三栏重新贴合：窗口缩放、侧栏开合会改画布宽度，跟随缩放才能保住三栏
const followColumnFocus = () => {
  if (!columnFocus.value) return
  const node = layout.value.nodes.find((item) => item.id === selectedId.value)
  if (!node || !size.width || !size.height) return
  const target = focusTargetFor(node)
  view.x = target.x
  view.y = target.y
  view.scale = target.scale
}

// 单击选中后稍等再居中：双击编辑时节点还没移走，可以原地改字
let pendingCenter = null

const scheduleCenter = (id) => {
  cancelPendingCenter()
  pendingCenter = setTimeout(() => {
    pendingCenter = null
    centerOnNode(id)
  }, 220)
}

const cancelPendingCenter = () => {
  if (pendingCenter == null) return
  clearTimeout(pendingCenter)
  pendingCenter = null
}

// 从别处选中任务时，若它被折叠隐藏，自动展开祖先链，保证选中项可见
// 图内点击已在 selectNode 里居中，这里只处理外部来源，避免重复启动动画
let localSelection = false

watch(selectedId, (id) => {
  if (!id) return
  // 选中项已被任一父链显示时不再展开，避免选中多父任务时把用户刚折叠的父级重新打开
  if (!layout.value.nodes.some((node) => node.id === id)) {
    const { parentOf } = nodeIndex.value
    const toExpand = []
    let current = parentOf.get(id)
    // 收起全部会把根节点也折叠，展开到选中项可见为止
    while (current != null) {
      if (isTaskCollapsed(current)) toExpand.push(String(current))
      current = parentOf.get(String(current))
    }
    if (toExpand.length > 0) setTasksCollapsed(toExpand, false)
  }
  if (localSelection) {
    localSelection = false
    return
  }
  // 展开后布局会重算，等节点落位再居中
  nextTick(() => centerOnNode(id))
})

// 主方向键沿层级深入/返回，交叉方向键在同级之间移动
const axisKeys = computed(() => (direction.value === 'left'
  ? { forward: 'ArrowLeft', backward: 'ArrowRight' }
  : { forward: 'ArrowRight', backward: 'ArrowLeft' }))

const focusTask = (id) => {
  if (id == null) return
  selectedEdgeKey.value = null
  rootSelected.value = false
  emit('task-selected', Number(id))
}

const navigate = (key) => {
  const id = selectedId.value
  if (!id) return
  const { parentOf, childrenOf } = nodeIndex.value
  const { forward, backward } = axisKeys.value

  if (key === forward) {
    const children = childrenOf.get(id) || []
    if (children.length === 0) return
    // 折叠状态下向前导航先展开，避免选中看不见的节点
    if (collapsedSet.value.has(id)) {
      const node = layout.value.nodes.find((item) => item.id === id)
      if (node) toggleCollapse(node)
    }
    focusTask(children[0])
    return
  }

  if (key === backward) {
    const parent = visibleParentOf(id)
    if (parent && parent !== rootNodeId.value) focusTask(parent)
    return
  }

  const siblingParent = visibleParentOf(id) ?? parentOf.get(id)
  const siblings = childrenOf.get(siblingParent) || []
  const index = siblings.indexOf(id)
  if (index === -1) return
  const step = key === 'ArrowUp' || key === 'ArrowLeft' ? -1 : 1
  focusTask(siblings[index + step])
}

// 新建任务：同级插到当前节点之后，子级挂到当前节点下
// 选中根节点时两者都落到顶层，父级就是根任务
const createSibling = () => {
  const id = selectedId.value
  const atRoot = id == null || id === rootNodeId.value
  const parent = atRoot
    ? rootNodeId.value
    : (visibleParentOf(id) ?? nodeIndex.value.parentOf.get(id))
  emit('create-task', {
    parentId: toTaskId(parent),
    afterId: atRoot ? null : toTaskId(id)
  })
}

// 新建子任务：默认挂在当前选中节点下，菜单从右键唤出时按菜单所属节点建
const createChild = (targetId = selectedId.value) => {
  if (!targetId) return
  emit('create-task', { parentId: toTaskId(targetId), afterId: null })
}

// 已消费的新建标记，避免提交后又被父级传入的 id 重新打开
let consumedEditId = null
// 节点文字输入框按节点 ID 收集，编辑时聚焦对应那个
const editInputs = new Map()
// 正在编辑的输入框本身：节点重建会换掉元素，结束时按它清选区比按 ID 查更可靠
let editEl = null
// 待恢复的选区：新建时全选、重建后沿用原光标位置
let editSelection = null
// 临时 ID 换成真实 ID 会让节点元素整体重建，这段窗口里的 blur 不算用户离开
let remapEdit = false
const setEditInput = (el, node) => {
  if (el) editInputs.set(String(node.id), el)
  else editInputs.delete(String(node.id))
  // 编辑中的输入框被重建后，新元素接管焦点与选区
  if (el && editingId.value === Number(node.id) && el !== editEl) {
    nextTick(() => focusEditInput(Number(node.id)))
  }
}

// 输入框与节点文字同字号同行高，随 SVG 一起缩放
const textStyle = {
  fontSize: `${fontSize}px`,
  lineHeight: `${lineHeight}px`
}

// 编辑态的行数由 measureNode 依据输入内容算出，节点与输入框一起长高，不再有行数上限
const onEditInput = (event) => {
  editingText.value = event.target.value
}

// 编辑态必须显式声明可选文本：画布容器是 select-none，继承下来会让拖选失效
const editTextStyle = (node) => ({
  ...textStyle,
  userSelect: editingId.value === Number(node.id) ? 'text' : 'none'
})

// 编辑前把过小的缩放提到阅读档位，避免原地编辑时字号看不清；
// 以节点中心为锚点只缩放不移动，编辑框仍贴在节点上
const ensureEditScale = (node) => {
  const target = focusScale()
  if (view.scale >= target) return
  // 编辑档位与三栏视野不是同一个缩放，先退出跟随，避免尺寸变化把编辑框拉走
  columnFocus.value = false
  const centerX = node.x + nodeWidth / 2
  const centerY = node.y + node.height / 2
  animateView({
    x: view.x + centerX * view.scale - centerX * target,
    y: view.y + centerY * view.scale - centerY * target,
    scale: target
  })
}

// 聚焦编辑中的输入框并恢复选区。延迟执行期间编辑可能已结束或换了目标，必须复核
const focusEditInput = (id) => {
  if (id == null || editingId.value !== id) return
  const input = editInputs.get(String(id))
  if (!input) return
  // 已经由这里聚焦过就不再重设选区，否则会覆盖刚应用的全选/光标位置
  if (input === editEl && document.activeElement === input) return
  editEl = input
  input.focus({ preventScroll: true })
  const end = input.value.length
  const [start, stop] = editSelection ?? [end, end]
  input.setSelectionRange(Math.min(start, end), Math.min(stop, end))
  editSelection = null
}

// selectText 只在预填占位文字（新建任务）时全选，直接输入即可覆盖；
// 编辑已有文字时保留内容、光标落在末尾，避免误输把原文冲掉
const startEdit = (node, { selectText = false } = {}) => {
  if (!node || node.isRoot || node.isRef) return
  // 双击编辑时取消待执行的居中，避免输入框刚出现就被移走
  cancelPendingCenter()
  stopViewAnimation()
  const id = Number(node.id)
  editingId.value = id
  editingText.value = node.title
  editSelection = selectText ? [0, node.title.length] : null
  ensureEditScale(node)
  nextTick(() => focusEditInput(id))
}

const startEditById = (id) => {
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (node) startEdit(node)
}

// 结束编辑时清掉输入框与文档残留的选区：blur 不会自动取消全选，
// 否则离开节点后文字仍显示成选中态
const releaseSelection = (el) => {
  try {
    el?.setSelectionRange(0, 0)
  } catch {
    // 少数浏览器在失焦后不允许改选区，忽略即可
  }
  window.getSelection()?.removeAllRanges()
}

const finishEdit = (el) => {
  const id = editingId.value
  editingId.value = null
  editEl = null
  editSelection = null
  releaseSelection(el)
  // 交还焦点，键盘操作可以继续
  container.value?.focus({ preventScroll: true })
  return id
}

const commitEdit = (event) => {
  // 节点重建期间旧输入框会失焦，编辑交给新元素继续
  if (remapEdit) return
  const el = event?.target ?? editEl
  if (editingId.value == null) {
    releaseSelection(el)
    return
  }
  // 行内空白压成单个空格，但保留 Shift+Enter 的手工换行；首尾空行丢弃
  const title = editingText.value
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/^\n+|\n+$/g, '')
  const id = finishEdit(el)
  if (!title) return
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (node && node.title === title) return
  emit('rename-task', { id, title })
}

const cancelEdit = () => {
  finishEdit(editEl)
}

const onEditKeydown = (event) => {
  if (event.key === 'Enter') {
    // Shift+Enter 插入手工换行，交给输入框默认行为；单独回车仍然提交
    if (event.shiftKey) return
    event.preventDefault()
    commitEdit(event)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    cancelEdit()
  }
}

// 新建任务的临时 ID → 真实 ID：sync:id-replaced 给出替换关系，
// 用来区分「同一次新建换号」与「又新建了一条」
const editIdAliases = new Map()
const handleEditIdReplaced = (event) => {
  const { tempId, realId } = event.detail || {}
  if (tempId == null || realId == null) return
  if (editIdAliases.size > 50) editIdAliases.clear()
  editIdAliases.set(String(tempId), String(realId))
}

// 新建后父级指定要重命名的任务，等它出现在布局里再打开输入框
watch([() => props.editTaskId, layout], ([id], [prevId]) => {
  const previousKey = prevId == null ? null : String(prevId)
  const aliasTarget = previousKey == null ? null : editIdAliases.get(previousKey)
  if (aliasTarget != null) editIdAliases.delete(previousKey)

  const { remap, consumedId, shouldStart } = resolveEditRequest({
    id,
    prevId,
    consumedId: consumedEditId,
    editingPrev: editingId.value === Number(prevId),
    replaced: aliasTarget != null && aliasTarget === String(id)
  })

  if (remap) {
    consumedEditId = consumedId
    // 把旧输入框当前的选区带到重建后的新元素上，全选与已输入内容都不丢
    const el = editEl
    editSelection = el && document.activeElement === el
      ? [el.selectionStart, el.selectionEnd]
      : null
    editingId.value = Number(id)
    remapEdit = true
    nextTick(() => { remapEdit = false })
  }
  if (!shouldStart) return
  // 新节点还没进布局时先不消费，等布局补齐后同一次请求再试
  const node = layout.value.nodes.find((item) => item.id === String(id))
  if (!node) return
  consumedEditId = id
  startEdit(node, { selectText: true })
})

// 剪辑板写入：优先异步剪贴板 API，局域网 http 等非安全上下文退回隐藏输入框 + execCommand，
// 避免复制功能在这些环境下静默失效；返回是否写入成功，供轻提示区分成功与失败
const writeClipboard = async (text) => {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // 权限被拒或被策略拦截时继续走兜底方案
  }
  const input = document.createElement('textarea')
  try {
    input.value = text
    input.setAttribute('readonly', '')
    input.style.cssText = 'position:fixed;top:0;left:0;opacity:0'
    document.body.appendChild(input)
    input.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    input.remove()
  }
}

// 复制为 Markdown 树状列表：选中节点连同全部后代，只取标题，不受折叠影响。
// 多父任务在图里只画一份、以引用节点出现在其它父级下，向下遍历时跳过引用，避免重复与成环
const copySubtreeAsMarkdown = async (id) => {
  const byId = new Map()
  const collect = (node) => {
    if (node.isRef) return
    const nodeId = String(node.id)
    if (!byId.has(nodeId)) byId.set(nodeId, node)
    ;(node.children || []).forEach(collect)
  }
  ;(props.nodes || []).forEach(collect)

  const start = byId.get(String(id))
  if (!start) return

  const lines = []
  const visited = new Set()
  const render = (node, depth) => {
    const nodeId = String(node.id)
    if (visited.has(nodeId)) return
    visited.add(nodeId)
    // 节点标题可能含手工换行，复制成 Markdown 时压成一行，避免打断列表结构
    lines.push(`${'  '.repeat(depth)}- ${(node.title || '未命名任务').replace(/\s*\n\s*/g, ' ')}`)
    ;(node.children || []).forEach((child) => {
      if (!child.isRef) render(child, depth + 1)
    })
  }
  render(start, 0)
  const copied = await writeClipboard(lines.join('\n'))
  emit('notify', {
    message: copied ? `已复制 ${lines.length} 个任务为 Markdown` : '复制失败，请检查浏览器剪贴板权限'
  })
}

// 画布快捷键：选中节点后按 Ctrl/Cmd+C 复制子树为 Markdown，其余组合键留给浏览器
const onKeydown = (event) => {
  const id = selectedId.value
  if ((event.ctrlKey || event.metaKey) && !event.altKey && event.key.toLowerCase() === 'c') {
    if (!id) return
    event.preventDefault()
    copySubtreeAsMarkdown(id)
    return
  }
  if (event.metaKey || event.ctrlKey || event.altKey) return

  switch (event.key) {
    case 'Enter':
      event.preventDefault()
      createSibling()
      return
    case 'Tab':
      event.preventDefault()
      createChild()
      return
    case 'F2':
      event.preventDefault()
      if (id && id !== rootNodeId.value) startEditById(id)
      return
    case 'Delete':
    case 'Backspace':
      // 选中连线时优先删除连线，否则删除任务
      if (selectedEdgeKey.value != null) {
        event.preventDefault()
        deleteSelectedEdge()
        return
      }
      if (!id || id === rootNodeId.value) return
      event.preventDefault()
      emitDelete(id)
      return
    case ' ':
      if (!id || id === rootNodeId.value) return
      event.preventDefault()
      emit('toggle-done', Number(id))
      return
    case 'Escape':
      if (selectedEdgeKey.value != null) {
        selectedEdgeKey.value = null
        return
      }
      rootSelected.value = false
      emit('task-selected', null)
      return
    case 'ArrowUp':
    case 'ArrowDown':
    case 'ArrowLeft':
    case 'ArrowRight':
      event.preventDefault()
      navigate(event.key)
      return
    default:
  }
}

// 点击空白画布取消选中：连线选中与节点选中一并清掉。
// 拖动平移松手后浏览器仍会补发 click，这里按位移与时间窗识别并忽略，避免拖动画布丢选中
const onCanvasClick = () => {
  if (Date.now() - lastPanEndAt < 250) return
  selectedEdgeKey.value = null
  rootSelected.value = false
  closeNodeMenu()
  if (selectedId.value != null) emit('task-selected', null)
  // 画布点击会 stop 冒泡，外部点击收起浮层侧栏需要这个事件来补
  emit('background-click')
}

// 滚轮模式在一次连续滚动序列内锁定：起始落在选中项上就缩放，否则平移，
// 中途指针扫过节点也不切换，避免滚动过程中画面突然变焦
let wheelMode = null
let wheelIdleTimer = null

const resetWheelMode = () => {
  wheelMode = null
  clearTimeout(wheelIdleTimer)
  wheelIdleTimer = null
}

// 指针是否落在当前选中项上：选中节点看节点本身，选中连线看连线热区
const isOnSelection = (target) => {
  if (!(target instanceof Element)) return false
  const nodeEl = target.closest('[data-mm-node]')
  if (nodeEl) return selectedId.value != null && nodeEl.dataset.mmNode === selectedId.value
  const edgeEl = target.closest('[data-mm-edge]')
  if (edgeEl) return selectedEdgeKey.value != null && edgeEl.dataset.mmEdge === selectedEdgeKey.value
  return false
}

// 滚轮：指针在选中项上时缩放，其余位置上下平移画布
const onWheel = (event) => {
  const el = container.value
  if (!el) return
  closeNodeMenu()
  hasInteracted = true
  // 手动缩放/平移即离开三栏视野，之后尺寸变化不再跟随
  columnFocus.value = false
  // 手动缩放/平移优先，打断正在进行的居中动画
  stopViewAnimation()

  // 行模式滚轮（部分鼠标/触控板）的 delta 单位是行，换算成像素
  const unit = event.deltaMode === 1 ? 16 : 1

  // Ctrl/Cmd + 滚轮在任意位置缩放（触控板双指捏合也会带上 ctrlKey），
  // 其余位置沿用「选中项上缩放、空白处平移」的既有手势
  if (event.ctrlKey || event.metaKey) {
    wheelMode = 'zoom'
  } else if (wheelMode === null) {
    wheelMode = isOnSelection(event.target) ? 'zoom' : 'pan'
  }

  // 停止滚动一小段时间后解锁，下一次滚动重新按落点判定
  clearTimeout(wheelIdleTimer)
  wheelIdleTimer = setTimeout(resetWheelMode, 220)

  if (wheelMode === 'pan') {
    view.x -= event.deltaX * unit
    view.y -= event.deltaY * unit
    return
  }

  // 以指针位置为中心缩放，避免缩放后视线漂移
  const rect = el.getBoundingClientRect()
  const pointerX = event.clientX - rect.left
  const pointerY = event.clientY - rect.top
  const nextScale = Math.min(2.5, Math.max(0.15, view.scale * Math.exp(-event.deltaY * unit * 0.0015)))
  const ratio = nextScale / view.scale

  view.x = pointerX - (pointerX - view.x) * ratio
  view.y = pointerY - (pointerY - view.y) * ratio
  view.scale = nextScale
}

let panStart = { x: 0, y: 0, originX: 0, originY: 0 }
let panMoved = false
// 本次平移是否从根节点按起：松手后按位移分派选中或平移
let panFromRoot = false
let lastPanEndAt = 0

// 只有 inside 才算「拖进节点」，前后插序时目标节点不高亮，改由占位槽提示落点
const isDropInside = (node) => dragState.targetId === node.id && dragState.dropPosition === 'inside'

// 与列表拖拽一致：上四分之一插入到目标之前，下四分之一插入到之后，其余区域成为子任务。
// 根节点没有兄弟序列，拖到它身上一律按拖进根层级处理
const dropPositionAt = (node, point) => {
  if (node.isRoot || dragState.fromToggle) return 'inside'
  const ratio = (point.y - node.y) / Math.max(node.height, 1)
  if (ratio < 0.25) return 'before'
  if (ratio > 0.75) return 'after'
  return 'inside'
}

// 拖拽中的源节点淡出，视线交给影子节点；拉线建链接时源节点保持原样
const nodeOpacity = (node) => {
  if (dragState.active && dragState.moved && !dragState.fromToggle && node.id === dragState.sourceId) return 0.3
  return node.completed_at ? 0.55 : 1
}

// 屏幕坐标换算成画布坐标，供命中检测、拉线与拖拽影子使用
const toGraphPoint = (event) => {
  const rect = container.value?.getBoundingClientRect()
  if (!rect) return { x: 0, y: 0 }
  return {
    x: (event.clientX - rect.left - view.x) / view.scale,
    y: (event.clientY - rect.top - view.y) / view.scale
  }
}

// 拖拽落点：以矩形到节点矩形的间距判定。拖节点时被测的是影子节点，
// 影子与目标接触（间距为 0）即命中，不看指针在哪；
// 从折叠/加号按钮拉线时被测矩形退化为指针点，并按屏幕像素外扩一圈，
// 指针不必精确压在目标上。多个节点同时进入范围时取中心最近的，避免在两者之间抖动。
// 余量按屏幕像素折算，缩小时仍保持手感，但设上限，防止缩小后跨到相邻节点。
const LINK_HIT_PADDING = 24
const LINK_HIT_PADDING_MAX = 48
const linkHitPadding = () => Math.min(LINK_HIT_PADDING / view.scale, LINK_HIT_PADDING_MAX)
const linkTargetAtRect = (rect) => {
  const padding = dragState.fromToggle ? linkHitPadding() : 0
  let nearest = null
  let nearestDistance = Infinity
  for (const node of hitLayout.value.nodes) {
    if (node.id === dragState.sourceId || node.isRef || node.isPlaceholder) continue
    // 两矩形之间的空隙：相交或接触时为 0，否则取横向/纵向最近的一段
    const gapX = Math.max(node.x - (rect.x + rect.width), rect.x - (node.x + nodeWidth), 0)
    const gapY = Math.max(node.y - (rect.y + rect.height), rect.y - (node.y + node.height), 0)
    if (Math.hypot(gapX, gapY) > padding) continue
    // 接触的节点可能不止一个（影子跨在两节点之间），取中心最近的
    const dx = node.x + nodeWidth / 2 - (rect.x + rect.width / 2)
    const dy = node.y + node.height / 2 - (rect.y + rect.height / 2)
    const distance = Math.hypot(dx, dy)
    if (distance >= nearestDistance) continue
    nearest = node
    nearestDistance = distance
  }
  return nearest
}

// 指针靠近叶子节点的加号位置就显示：按到控制点的屏幕距离判定，不必先进入节点。
// 指针仍在节点矩形内时沿用原来的悬停显示，避免停在节点中间反而把加号收掉。
// 平移或拖拽期间不参与判定，避免画布移动时按钮闪烁。
const updateLeafControlHover = (event) => {
  if (panning.value || dragState.active) return
  const point = toGraphPoint(event)
  const radius = LEAF_CONTROL_REVEAL / view.scale
  const radiusSq = radius * radius
  let inside = null
  let nearest = null
  let nearestDistance = Infinity
  for (const node of hitLayout.value.nodes) {
    if (node.isRoot || node.childCount > 0) continue
    if (point.x >= node.x && point.x <= node.x + nodeWidth
      && point.y >= node.y && point.y <= node.y + node.height) {
      inside = node
      continue
    }
    const dx = point.x - (node.x + node.controlX)
    const dy = point.y - (node.y + node.controlY)
    const distance = dx * dx + dy * dy
    if (distance > radiusSq || distance >= nearestDistance) continue
    nearest = node
    nearestDistance = distance
  }
  const target = inside || nearest
  if (target) holdLeafControl(target)
  else releaseLeafControl()
}

const onNodePointerDown = (event, node) => {
  if (event.button !== 0 || node.isRef) return
  // 根节点不参与建链接：按住它等同按住空白处，直接拖动整张图
  if (node.isRoot) {
    onPointerDown(event, true)
    return
  }
  // 编辑中不启动拖拽建链接，避免在节点内拖选文字时被拖走
  if (editingId.value != null) return
  startDrag(event, node.id, false)
}

// 出边按钮按下：可能是单击折叠/新建，也可能拖出链接，先按拖拽跟踪，移动超过阈值才算拖拽
const onTogglePointerDown = (event, node) => {
  if (event.button !== 0 || node.isRoot) return
  startDrag(event, node.id, true)
}

// 拖拽结束后的 click 不再触发折叠或新建，避免拖完顺手多建一个任务
// 有子任务时是折叠开关，叶子节点上用来新建子任务
const onToggleClick = (node) => {
  if (Date.now() - lastDragEndAt < 250) return
  if (node.childCount > 0) {
    toggleCollapse(node)
    return
  }
  emit('create-task', { parentId: Number(node.id), afterId: null })
}

const startDrag = (event, sourceId, fromToggle) => {
  closeNodeMenu()
  hasInteracted = true
  draggingLeafId.value = fromToggle ? String(sourceId) : null
  dragStart = { x: event.clientX, y: event.clientY }
  // 记录按下点在源节点内的位置，影子节点全程保持这个偏移，指针就像捏着原件在拖
  const source = layout.value.nodes.find((node) => node.id === sourceId)
  const origin = source ? toGraphPoint(event) : null
  dragState.grab = origin ? { x: origin.x - source.x, y: origin.y - source.y } : { x: 0, y: 0 }
  dragState.active = true
  dragState.sourceId = sourceId
  dragState.targetId = null
  dragState.dropPosition = 'inside'
  dragState.preview = null
  dragState.shadow = null
  dragState.moved = false
  dragState.fromToggle = fromToggle
  // 不用 pointer capture：它会把 click 改派到画布，节点自身的选中与双击会失效
  window.addEventListener('pointermove', onDragMove)
  window.addEventListener('pointerup', onDragEnd)
  window.addEventListener('pointercancel', onDragEnd)
}

// 拉线预览复用正式连线的三次贝塞尔规则：起点沿出边法线离开，终点水平收尾，
// 与真实连线进入子节点的方向一致；控制点与终点同高，箭头因此始终水平
const previewCurve = (start, end) => {
  const bend = Math.max(20, Math.abs(end.x - start.x) * 0.5)
  const c1 = { x: start.x + start.dx * bend, y: start.y + start.dy * bend }
  // 终点切线朝指针一侧的水平方向，控制点落在终点后方
  const approach = Math.sign(end.x - start.x) || start.dx
  const c2 = { x: end.x - approach * bend, y: end.y }
  return `M${start.x} ${start.y} C${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${end.x} ${end.y}`
}

// 拖拽中的实时反馈：拉线只用于从折叠/加号按钮建链接，从按钮连向指针；
// 拖节点改为影子副本跟随指针，不再画线
const updateDrag = (event) => {
  const source = layout.value.nodes.find((node) => node.id === dragState.sourceId)
  if (!source) return
  const point = toGraphPoint(event)
  // 被测矩形的宽高：拖节点用影子，按钮拉线退化为一个点
  let hitRect
  if (dragState.fromToggle) {
    const tip = outAnchor(source)
    // 终点就是指针位置，也是新节点将出现的位置，不再向前出头
    dragState.preview = previewCurve(tip, point)
    hitRect = { x: point.x, y: point.y, width: 0, height: 0 }
  } else {
    // 拖节点不画线：影子副本跟随指针，影子与目标接触就算命中
    dragState.preview = null
    dragState.shadow = {
      node: source,
      x: point.x - dragState.grab.x,
      y: point.y - dragState.grab.y
    }
    hitRect = { x: dragState.shadow.x, y: dragState.shadow.y, width: nodeWidth, height: source.height }
  }

  const hit = linkTargetAtRect(hitRect)
  dragState.targetId = hit ? hit.id : null
  dragState.dropPosition = hit ? dropPositionAt(hit, point) : 'inside'
}

const onDragMove = (event) => {
  if (!dragState.active) return
  if (!dragState.moved) {
    const distance = Math.hypot(event.clientX - dragStart.x, event.clientY - dragStart.y)
    if (distance < 4) return
    dragState.moved = true
  }
  updateDrag(event)
}

const onDragEnd = (event) => {
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)

  const { active, sourceId, targetId, dropPosition, moved, fromToggle } = dragState
  const dragged = active && moved
  dragState.active = false
  dragState.sourceId = null
  dragState.targetId = null
  dragState.dropPosition = 'inside'
  dragState.preview = null
  dragState.shadow = null
  dragState.moved = false
  dragState.fromToggle = false
  draggingLeafId.value = null
  // 松手后按指针位置重新判定加号，避免拉线结束时按钮状态停在源节点上
  if (event?.type === 'pointerup') updateLeafControlHover(event)
  if (!dragged) return

  // 拖拽结束后紧跟的 click 不应再改变选中或触发折叠
  lastDragEndAt = Date.now()
  if (!targetId) return
  // 拖节点：落点成为父或兄弟；拖折叠/加号按钮：源节点成为父，且只建立链接。
  // 带出两侧父级，前后插序才能落在用户看到的那条兄弟序列里
  const source = layout.value.nodes.find((node) => node.id === sourceId)
  const target = layout.value.nodes.find((node) => node.id === targetId)
  emit('drop-task', fromToggle
    ? { parentId: Number(sourceId), childId: Number(targetId), linkOnly: true }
    : {
      parentId: Number(targetId),
      childId: Number(sourceId),
      position: dropPosition,
      sourceParentId: source?.parent_id ?? null,
      targetParentId: target?.parent_id ?? null
    })
}

const onPointerDown = (event, fromRoot = false) => {
  if (event.button !== 0) return
  // 平移画布时收起更多操作菜单，避免菜单悬在原地
  closeNodeMenu()
  confirmUnlink.value = false
  hasInteracted = true
  // 拖拽平移会改变视口，三栏视野不再成立
  columnFocus.value = false
  // 拖拽平移优先，打断正在进行的居中动画
  stopViewAnimation()
  panning.value = true
  panMoved = false
  panFromRoot = fromRoot
  panStart = { x: event.clientX, y: event.clientY, originX: view.x, originY: view.y }
  container.value?.setPointerCapture(event.pointerId)
}

const onPointerMove = (event) => {
  updateLeafControlHover(event)
  if (!panning.value) return
  if (!panMoved) {
    const distance = Math.hypot(event.clientX - panStart.x, event.clientY - panStart.y)
    if (distance < 4) return
    panMoved = true
  }
  view.x = panStart.originX + (event.clientX - panStart.x)
  view.y = panStart.originY + (event.clientY - panStart.y)
}

const endPan = () => {
  if (!panning.value) return
  panning.value = false
  if (panMoved) {
    // 真正发生过平移才记录时间，纯点击仍按点击处理
    lastPanEndAt = Date.now()
  } else if (panFromRoot) {
    // 指针捕获会把 click 改派到画布，按在根节点上的点击在这里补成选中
    lastPanEndAt = Date.now()
    const root = layout.value.nodes.find((node) => node.isRoot)
    if (root) selectNode(root)
  }
  panMoved = false
  panFromRoot = false
}

// 指针离开画布：结束平移并清掉加号；拖拽中由 window 监听延续，不移除拉线源
const onCanvasLeave = () => {
  endPan()
  if (!dragState.active) clearLeafControlHover()
}

let resizeObserver = null

onMounted(() => {
  resizeObserver = new ResizeObserver((entries) => {
    const box = entries[0]?.contentRect
    if (!box) return
    size.width = box.width
    size.height = box.height
    // 三栏视野跟随画布宽度重新贴合；其余情况只有未交互过的首屏才自动适配
    if (columnFocus.value) followColumnFocus()
    else if (!hasInteracted) fitView()
  })
  if (container.value) resizeObserver.observe(container.value)
  if (!restoredView) nextTick(fitView)
  window.addEventListener('sync:id-replaced', handleEditIdReplaced)
})

onBeforeUnmount(() => {
  resizeObserver?.disconnect()
  document.removeEventListener('pointerdown', onHelpOutside)
  document.removeEventListener('pointerdown', onMenuOutside)
  window.removeEventListener('sync:id-replaced', handleEditIdReplaced)
  clearTimeout(leafHideTimer)
  stopViewAnimation()
  cancelPendingCenter()
  if (saveViewTimer) clearTimeout(saveViewTimer)
  clearTimeout(wheelIdleTimer)
  window.removeEventListener('pointermove', onDragMove)
  window.removeEventListener('pointerup', onDragEnd)
  window.removeEventListener('pointercancel', onDragEnd)
})

// 只有布局方向切换会整体重排、需要重新适配；任务增删与折叠都是局部重排，
// 保持当前视口，避免新建或删除一个任务就把画面拉回全景
watch(direction, () => nextTick(fitView))
</script>

<style scoped>
/* 画布底色：默认亮色，与点阵一样由开关决定；深色沿用应用的画布深色令牌 */
.mindmap-canvas {
  background-color: #fafafa;
}

.mindmap-canvas.mindmap-canvas--dark {
  background-color: var(--color-canvas-dark);
}

/* 点阵底纹：开关打开后铺一层固定网格点，作为画布上的静态纹理，不随平移与缩放变化 */
.mindmap-canvas.mindmap-dots {
  background-image: radial-gradient(circle, rgba(20, 20, 40, 0.10) 1px, transparent 1px);
  background-size: 24px 24px;
  /* 点画在每块瓦片中心，回退半个点距 */
  background-position: -12px -12px;
}

/* 深色画布上点色反相，否则点阵沉进底色看不出来 */
.mindmap-canvas.mindmap-canvas--dark.mindmap-dots {
  background-image: radial-gradient(circle, rgba(255, 255, 255, 0.16) 1px, transparent 1px);
}

/* 坐标网格：细线托底、主刻度略深、坐标轴与刻度最醒目，标签保持弱化 */
.mindmap-grid-minor {
  stroke: rgba(20, 20, 40, 0.07);
}

.mindmap-grid-major {
  stroke: rgba(20, 20, 40, 0.14);
}

.mindmap-grid-axis {
  stroke: rgba(20, 20, 40, 0.32);
}

.mindmap-grid-label {
  fill: rgba(20, 20, 40, 0.5);
  font-size: 10px;
  font-variant-numeric: tabular-nums;
}

/* 深色画布上线条与标签反相，保持同样的层次 */
.mindmap-canvas--dark .mindmap-grid-minor {
  stroke: rgba(255, 255, 255, 0.07);
}

.mindmap-canvas--dark .mindmap-grid-major {
  stroke: rgba(255, 255, 255, 0.13);
}

.mindmap-canvas--dark .mindmap-grid-axis {
  stroke: rgba(255, 255, 255, 0.35);
}

.mindmap-canvas--dark .mindmap-grid-label {
  fill: rgba(255, 255, 255, 0.5);
}
</style>
