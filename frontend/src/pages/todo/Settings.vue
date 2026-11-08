<template>
  <!-- 设置：整页铺满视口，浮窗则以卡片形式覆盖在当前页面上 -->
  <Teleport to="body" :disabled="!floating">
    <div :class="floating
      ? 'fixed inset-0 z-[80] flex items-center justify-center bg-neutral-950/45 p-4 backdrop-blur-sm'
      : 'min-h-screen'" @click.self="floating && handleClose()">
      <div :class="floating
        ? 'panel w-full max-w-4xl max-h-[85vh] overflow-y-auto p-6 shadow-xl'
        : 'w-full px-6 md:px-10 lg:px-16 py-8'">
        <!-- 顶栏 -->
        <header class="flex items-start justify-between mb-6">
          <div>
            <h1 class="text-lg font-semibold text-neutral-900 dark:text-neutral-100">设置</h1>
            <p class="mt-0.5 text-xs text-neutral-500">账户与 AI 偏好</p>
          </div>
          <div class="flex items-center gap-1 -mr-2">
            <button v-if="floating"
              class="p-2 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
              @click="handleExpand" title="在整页打开" aria-label="在整页打开">
              <AppIcon name="expand" :size="16" />
            </button>
            <button v-else
              class="p-2 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
              @click="handleFloat" title="切换为浮窗" aria-label="切换为浮窗">
              <AppIcon name="shrink" :size="16" />
            </button>
            <button class="p-2 rounded text-neutral-500 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
              @click="handleClose" aria-label="关闭设置">
              <AppIcon name="close" :size="16" />
            </button>
          </div>
        </header>

        <div class="grid md:grid-cols-[168px_1fr] grid-cols-1 gap-6">
          <!-- 标签 -->
          <nav class="flex md:flex-col gap-1" role="tablist">
            <button v-for="tab in tabs" :key="tab.id" :class="[
              'flex items-center gap-2 px-2.5 py-1.5 text-sm rounded border-l-2 transition-colors text-left',
              activeTab === tab.id
                ? 'bg-accent-50 text-accent-800 dark:bg-accent-500/10 dark:text-accent-100 font-medium border-accent-600 dark:border-accent-400'
                : 'border-transparent text-neutral-500 dark:text-neutral-400 hover:bg-accent-50/70 dark:hover:bg-accent-500/[0.06] hover:text-accent-800 dark:hover:text-accent-200'
            ]" role="tab" :aria-selected="activeTab === tab.id" @click="activeTab = tab.id">
              <AppIcon :name="tab.icon" :size="15" class="opacity-70" />
              <span>{{ tab.label }}</span>
            </button>
          </nav>

          <!-- 内容 -->
          <div class="panel min-h-[25rem] p-6">
            <!-- 账户 -->
            <section v-if="activeTab === 'account'" class="space-y-8">
              <div>
                <p class="eyebrow mb-2">账户信息</p>
                <dl class="divide-y divide-neutral-100 dark:divide-neutral-800 text-sm">
                  <div class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">邮箱</dt>
                    <dd class="text-neutral-900 dark:text-neutral-100 break-all">{{ userEmail }}</dd>
                  </div>
                  <div class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">创建时间</dt>
                    <dd class="text-neutral-900 dark:text-neutral-100">{{ userCreatedAt }}</dd>
                  </div>
                  <div v-if="userEmailVerified" class="flex items-baseline gap-4 py-2">
                    <dt class="w-20 shrink-0 text-neutral-500">验证状态</dt>
                    <dd class="flex items-center gap-1.5 text-accent-700 dark:text-accent-400">
                      <AppIcon name="check" :size="13" />
                      <span>已验证</span>
                    </dd>
                  </div>
                </dl>
              </div>

              <div>
                <p class="eyebrow mb-2">安全</p>
                <button class="btn-outline" @click="showPasswordModal = true">
                  <AppIcon name="lock" :size="14" />
                  <span>修改密码</span>
                </button>
              </div>

              <div>
                <p class="eyebrow mb-2">账户操作</p>
                <button
                  class="btn border border-rose-200 text-rose-600 hover:bg-rose-50 dark:border-rose-900 dark:text-rose-400 dark:hover:bg-rose-950/30"
                  @click="handleDeleteAccount" :disabled="isDeletingAccount">
                  <AppIcon name="trash" :size="14" />
                  <span>{{ isDeletingAccount ? '删除中…' : '删除账户' }}</span>
                </button>
              </div>
            </section>

            <!-- 偏好 -->
            <section v-else-if="activeTab === 'preferences'" class="space-y-4">
              <p class="eyebrow">AI 偏好</p>

              <div class="flex items-start justify-between gap-6">
                <div>
                  <p class="text-sm text-neutral-900 dark:text-neutral-100">AI 分解后自动添加任务</p>
                  <p class="mt-0.5 text-xs text-neutral-500">开启后，分解结果直接写入任务列表，不再进入待确认状态。</p>
                </div>
                <label class="relative inline-flex items-center cursor-pointer shrink-0">
                  <input v-model="settingsForm.autoApplyAITasks" type="checkbox" class="sr-only peer" />
                  <div class="w-9 h-5 rounded-full bg-neutral-300 dark:bg-neutral-700 peer-checked:bg-accent-600 transition-colors"></div>
                  <div class="absolute left-0.5 top-0.5 w-4 h-4 bg-white rounded-full transition-transform peer-checked:translate-x-4"></div>
                </label>
              </div>

              <p v-if="settingsError" class="text-xs text-rose-600 dark:text-rose-400">{{ settingsError }}</p>
              <p v-if="settingsSuccess" class="text-xs text-accent-700 dark:text-accent-400">{{ settingsSuccess }}</p>

              <div class="flex items-center justify-end gap-3 pt-3 border-t border-neutral-100 dark:border-neutral-800">
                <span v-if="settingsLoading" class="text-xs text-neutral-500">读取中…</span>
                <button class="btn-primary" :disabled="settingsLoading || settingsSaving" @click="handleSaveSettings">
                  {{ settingsSaving ? '保存中…' : '保存' }}
                </button>
              </div>
            </section>

            <!-- 导入：先预览文件内容，再按清单分组写入任务树 -->
            <section v-else-if="activeTab === 'import'" class="space-y-5">
              <div>
                <p class="eyebrow mb-2">从滴答清单导入</p>
                <p class="text-xs leading-relaxed text-neutral-500">
                  在滴答清单「设置 → 备份」导出 CSV 或 JSON 后上传。JSON 导出带任务来源标识，同一文件重复导入只会更新已有任务；CSV 没有稳定标识，请勿重复导入。
                </p>
              </div>

              <!-- 文件选择：点击或拖入，读取后进入预览 -->
              <label
                class="flex cursor-pointer flex-col items-center rounded-md border border-dashed px-4 py-7 text-center transition-colors"
                :class="isImportDragging
                  ? 'border-accent-500 bg-accent-50/70 dark:bg-accent-500/10'
                  : 'border-neutral-300 hover:border-accent-400 dark:border-neutral-700'"
                @dragover.prevent="isImportDragging = true"
                @dragleave.prevent="isImportDragging = false"
                @drop.prevent="handleImportDrop"
              >
                <input
                  ref="importFileInput"
                  type="file"
                  accept=".csv,.json,text/csv,application/json"
                  class="sr-only"
                  @change="handleImportFileChange"
                />
                <AppIcon name="upload" :size="20" class="mb-2 text-neutral-400" />
                <span class="text-sm text-neutral-800 dark:text-neutral-200">选择或拖入导出文件</span>
                <span class="mt-1 text-xs text-neutral-500">CSV / JSON，最大 5 MB</span>
              </label>

              <p v-if="importError" class="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                <AppIcon name="alert" :size="12" />
                <span>{{ importError }}</span>
              </p>

              <!-- 预览：确认数量与分组方式后再写入 -->
              <div v-if="importTasks.length" class="space-y-4">
                <div class="flex flex-wrap items-center gap-2">
                  <span class="chip">{{ importFileName }}</span>
                  <span class="chip">{{ importSummary.taskCount }} 个任务</span>
                  <span v-if="importSummary.listCount" class="chip">{{ importSummary.listCount }} 个清单</span>
                  <span v-if="importSummary.completedCount" class="chip">{{ importSummary.completedCount }} 个已完成</span>
                </div>

                <div class="space-y-2 text-sm text-neutral-700 dark:text-neutral-300">
                  <label class="flex items-center gap-2">
                    <input v-model="importGroupByList" type="checkbox" class="accent-accent-600" />
                    <span>每个清单生成一个顶层任务</span>
                  </label>
                  <label class="flex items-center gap-2">
                    <input v-model="importIncludeCompleted" type="checkbox" class="accent-accent-600" />
                    <span>包含已完成任务</span>
                  </label>
                </div>

                <ul v-if="importWarningList.length" class="space-y-1 text-xs text-amber-600 dark:text-amber-400">
                  <li v-for="warning in importWarningList.slice(0, 3)" :key="warning" class="flex items-start gap-1.5">
                    <AppIcon name="alert" :size="12" class="mt-0.5" />
                    <span>{{ warning }}</span>
                  </li>
                </ul>

                <!-- 进度：逐条写入，父任务失败时子任务会跳过 -->
                <div v-if="isImporting" class="space-y-1.5">
                  <div class="flex items-center justify-between text-xs text-neutral-500">
                    <span>正在写入 {{ importProgress.done }} / {{ importProgress.total }}</span>
                    <span>{{ importPercent }}%</span>
                  </div>
                  <div class="h-1.5 overflow-hidden rounded-full bg-neutral-200 dark:bg-neutral-800">
                    <div class="h-full rounded-full bg-accent-600 transition-all" :style="{ width: `${importPercent}%` }"></div>
                  </div>
                  <p class="truncate text-xs text-neutral-500">{{ importProgress.title }}</p>
                </div>

                <div class="flex items-center gap-2">
                  <button
                    class="btn-primary"
                    :disabled="isImporting || importDone || !importPlan.nodes.length"
                    @click="handleImportStart"
                  >
                    <AppIcon name="upload" :size="14" />
                    <span>{{ isImporting ? '导入中…' : (importDone ? '已完成' : '开始导入') }}</span>
                  </button>
                  <button v-if="isImporting" class="btn-outline" @click="handleImportCancel">取消</button>
                  <button v-else class="btn-outline" @click="resetImport">重新选择</button>
                </div>

                <!-- 结果 -->
                <div
                  v-if="importResult"
                  class="rounded-md border px-3 py-2.5 text-xs"
                  :class="importResult.failed || importResult.skipped
                    ? 'border-amber-200 bg-amber-50/60 text-amber-800 dark:border-amber-900 dark:bg-amber-950/20 dark:text-amber-300'
                    : 'border-accent-200 bg-accent-50/60 text-accent-800 dark:border-accent-900 dark:bg-accent-500/10 dark:text-accent-300'"
                >
                  <p class="flex items-center gap-1.5">
                    <AppIcon :name="importResult.failed || importResult.skipped ? 'alert' : 'check'" :size="12" />
                    <span>
                      新建 {{ importResult.imported }} 个
                      <template v-if="importResult.updated">，更新 {{ importResult.updated }} 个</template>
                      <template v-if="importResult.unchanged">，无变化 {{ importResult.unchanged }} 个</template>
                      <template v-if="importResult.failed">，失败 {{ importResult.failed }} 个</template>
                      <template v-if="importResult.skipped">，跳过 {{ importResult.skipped }} 个</template>
                      <template v-if="importResult.cancelled">（已取消）</template>
                    </span>
                  </p>
                  <ul v-if="importResult.errors.length" class="mt-1.5 space-y-0.5">
                    <li
                      v-for="error in importResult.errors.slice(0, 5)"
                      :key="`${error.title}-${error.message}`"
                      class="truncate"
                    >
                      {{ error.title }}：{{ error.message }}
                    </li>
                  </ul>
                </div>
              </div>
            </section>

            <!-- 日历：ICS 导入导出与只读订阅链接 -->
            <section v-else-if="activeTab === 'calendar'" class="space-y-6">
              <div>
                <p class="eyebrow mb-2">导出日程</p>
                <p class="text-xs leading-relaxed text-neutral-500">
                  把全部日程导出为 .ics 文件，可导入系统日历、Google 日历等支持 ICS 的应用。
                </p>
                <div class="mt-3 flex items-center gap-2">
                  <button class="btn-outline" :disabled="isExportingCalendar" @click="handleCalendarExport">
                    <AppIcon name="download" :size="14" />
                    <span>{{ isExportingCalendar ? '导出中…' : '导出 .ics' }}</span>
                  </button>
                  <span v-if="calendarExportMessage" class="text-xs text-neutral-500">{{ calendarExportMessage }}</span>
                </div>
                <p v-if="calendarExportError" class="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AppIcon name="alert" :size="12" />
                  <span>{{ calendarExportError }}</span>
                </p>
              </div>

              <div class="border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <p class="eyebrow mb-2">导入日程</p>
                <p class="text-xs leading-relaxed text-neutral-500">
                  上传 .ics 文件，事件会写入日程。重复日程会展开为未来一年内的实例；导入只新增，不会去重。
                </p>

                <label
                  class="mt-3 flex cursor-pointer flex-col items-center rounded-md border border-dashed px-4 py-7 text-center transition-colors"
                  :class="isCalendarDragging
                    ? 'border-accent-500 bg-accent-50/70 dark:bg-accent-500/10'
                    : 'border-neutral-300 hover:border-accent-400 dark:border-neutral-700'"
                  @dragover.prevent="isCalendarDragging = true"
                  @dragleave.prevent="isCalendarDragging = false"
                  @drop.prevent="handleCalendarDrop"
                >
                  <input
                    ref="calendarFileInput"
                    type="file"
                    accept=".ics,text/calendar"
                    class="sr-only"
                    @change="handleCalendarFileChange"
                  />
                  <AppIcon name="upload" :size="20" class="mb-2 text-neutral-400" />
                  <span class="text-sm text-neutral-800 dark:text-neutral-200">选择或拖入 .ics 文件</span>
                  <span class="mt-1 text-xs text-neutral-500">最大 5 MB</span>
                </label>

                <p v-if="calendarImportError" class="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AppIcon name="alert" :size="12" />
                  <span>{{ calendarImportError }}</span>
                </p>

                <div v-if="calendarEvents.length" class="mt-4 space-y-3">
                  <div class="flex flex-wrap items-center gap-2">
                    <span class="chip">{{ calendarFileName }}</span>
                    <span class="chip">{{ calendarEvents.length }} 个事件</span>
                    <span v-if="calendarSkipped" class="chip">{{ calendarSkipped }} 个无法解析</span>
                  </div>
                  <ul class="space-y-1 text-xs text-neutral-600 dark:text-neutral-400">
                    <li v-for="event in calendarEvents.slice(0, 5)" :key="`${event.start_at}-${event.title}`" class="flex items-center gap-2">
                      <span class="font-mono text-neutral-400">{{ formatCalendarTime(event.start_at) }}</span>
                      <span class="truncate">{{ event.title }}</span>
                    </li>
                    <li v-if="calendarEvents.length > 5" class="text-neutral-400">等 {{ calendarEvents.length }} 个事件</li>
                  </ul>
                  <div class="flex items-center gap-2">
                    <button class="btn-primary" :disabled="isCalendarImporting || calendarImportDone" @click="handleCalendarImport">
                      <AppIcon name="upload" :size="14" />
                      <span>{{ isCalendarImporting ? '导入中…' : (calendarImportDone ? '已导入' : '开始导入') }}</span>
                    </button>
                    <button class="btn-outline" @click="resetCalendarImport">重新选择</button>
                  </div>
                  <p v-if="calendarImportResult" class="flex items-center gap-1.5 text-xs text-accent-700 dark:text-accent-400">
                    <AppIcon name="check" :size="12" />
                    <span>{{ calendarImportResult }}</span>
                  </p>
                </div>
              </div>

              <div class="border-t border-neutral-100 pt-5 dark:border-neutral-800">
                <p class="eyebrow mb-2">日历订阅</p>
                <p class="text-xs leading-relaxed text-neutral-500">
                  生成只读订阅链接，粘贴到系统日历的“添加日历订阅”，日程变化会自动同步。链接本身就是凭据，请勿公开分享。
                </p>

                <button v-if="!calendarFeedToken" class="btn-primary mt-3" :disabled="isTokenBusy || settingsLoading" @click="handleGenerateFeed">
                  <AppIcon name="link" :size="14" />
                  <span>{{ isTokenBusy ? '生成中…' : (settingsLoading ? '读取设置…' : '生成订阅链接') }}</span>
                </button>

                <div v-else class="mt-3 space-y-2">
                  <input
                    class="field font-mono text-xs"
                    :value="calendarFeedUrl"
                    readonly
                    @focus="$event.target.select()"
                  />
                  <div class="flex flex-wrap items-center gap-2">
                    <button class="btn-outline" @click="handleCopyFeed">
                      <AppIcon :name="feedCopied ? 'check' : 'copy'" :size="14" />
                      <span>{{ feedCopied ? '已复制' : '复制链接' }}</span>
                    </button>
                    <button class="btn-outline" :disabled="isTokenBusy || settingsLoading" @click="handleRotateFeed">重新生成</button>
                    <button class="btn-outline" :disabled="isTokenBusy || settingsLoading" @click="handleDisableFeed">停用</button>
                  </div>
                  <p class="text-[11px] leading-relaxed text-neutral-500">
                    重新生成或停用后，旧链接会立即失效，需要在日历软件里重新添加。
                  </p>
                </div>
                <p v-if="calendarTokenError" class="mt-2 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
                  <AppIcon name="alert" :size="12" />
                  <span>{{ calendarTokenError }}</span>
                </p>
              </div>
            </section>
          </div>
        </div>
      </div>

      <!-- 修改密码 -->
      <Transition enter-active-class="transition ease-out duration-150" enter-from-class="opacity-0"
        leave-active-class="transition ease-in duration-100" leave-to-class="opacity-0">
        <div v-if="showPasswordModal" class="modal-overlay" @click.self="closePasswordModal">
          <div class="panel w-11/12 max-w-sm p-5 shadow-xl">
            <div class="flex items-start justify-between mb-4">
              <h2 class="text-sm font-semibold text-neutral-900 dark:text-neutral-100">修改密码</h2>
              <button class="p-1 -mr-1 rounded text-neutral-400 hover:bg-accent-50 hover:text-accent-800 dark:hover:bg-accent-500/10 dark:hover:text-accent-200 transition-colors"
                @click="closePasswordModal" aria-label="关闭">
                <AppIcon name="close" :size="14" />
              </button>
            </div>

            <div class="space-y-3">
              <label class="block">
                <span class="text-[11px] text-neutral-500">新密码</span>
                <input id="new-password" v-model="newPassword" type="password" placeholder="至少 6 个字符"
                  autocomplete="new-password" class="field mt-1" />
              </label>
              <label class="block">
                <span class="text-[11px] text-neutral-500">确认新密码</span>
                <input id="confirm-password" v-model="confirmPassword" type="password" placeholder="再次输入新密码"
                  autocomplete="new-password" class="field mt-1" />
              </label>
            </div>

            <p v-if="passwordError" class="mt-3 flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
              <AppIcon name="alert" :size="12" />
              <span>{{ passwordError }}</span>
            </p>
            <p v-if="passwordSuccess" class="mt-3 flex items-center gap-1.5 text-xs text-accent-700 dark:text-accent-400">
              <AppIcon name="check" :size="12" />
              <span>{{ passwordSuccess }}</span>
            </p>

            <div class="mt-5 flex justify-end gap-2">
              <button class="btn-outline" @click="closePasswordModal">取消</button>
              <button class="btn-primary" @click="handleChangePassword" :disabled="isChangingPassword">
                {{ isChangingPassword ? '处理中…' : '修改密码' }}
              </button>
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
}
</style>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useTodoStore } from '@/stores/todos'
import { useScheduleStore } from '@/stores/schedules'
import { supabase } from '@/lib/supabase'
import { DEFAULT_USER_SETTINGS, fetchUserSettings, saveUserSettings } from '@/lib/userSettings'
import {
  buildCalendarFeedUrl,
  disableCalendarFeed,
  ensureCalendarFeedToken,
  exportSchedulesIcs,
  readIcsFile,
  rotateCalendarFeedToken
} from '@/lib/calendarTransfer'
import { settingsPanelOpen } from '@/utils/settingsPanel'
import {
  TICKTICK_IMPORT_MAX_BYTES,
  parseTickTickFile,
  buildImportPlan,
  summarizeTickTickTasks,
  executeTickTickImport
} from '@/lib/ticktickImport'
import AppIcon from '@/components/AppIcon.vue'

const props = defineProps({
  floating: { type: Boolean, default: false }
})

const emit = defineEmits(['close'])

const router = useRouter()
const route = useRoute()
const authStore = useAuthStore()
const todoStore = useTodoStore()
const scheduleStore = useScheduleStore()

// 关闭设置：浮窗回到当前页面，整页返回上一页
const handleClose = () => {
  if (props.floating) {
    emit('close')
    return
  }
  router.back()
}

// 从整页收为浮窗：回到应用页由它承载浮窗，保留原来的视图
const handleFloat = () => {
  settingsPanelOpen.value = true
  const previous = window.history.state?.back
  if (typeof previous === 'string' && previous.includes('/app')) {
    router.back()
  } else {
    router.push({ name: 'app' })
  }
}

// 从浮窗展开为整页，沿用当前页面的查询参数
const handleExpand = () => {
  emit('close')
  router.push({ name: 'settings', query: route.query })
}

// 浮窗下按 Esc 关闭
const handleKeydown = (event) => {
  if (event.key === 'Escape' && props.floating) {
    emit('close')
  }
}

// 标签配置
const tabs = [
  { id: 'account', label: '账户安全', icon: 'lock' },
  { id: 'preferences', label: '偏好设置', icon: 'sliders' },
  { id: 'calendar', label: '日历', icon: 'calendar' },
  { id: 'import', label: '导入数据', icon: 'upload' }
]

// 标签切换；支持 /settings?tab=calendar 这类直达链接
const activeTab = ref(tabs.some((tab) => tab.id === route.query.tab) ? route.query.tab : 'account')

// 账户设置
const showPasswordModal = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const passwordError = ref('')
const passwordSuccess = ref('')
const isChangingPassword = ref(false)
const isDeletingAccount = ref(false)
const settingsLoading = ref(false)
const settingsSaving = ref(false)
const settingsError = ref('')
const settingsSuccess = ref('')
const settingsForm = ref({ ...DEFAULT_USER_SETTINGS })

// 导入数据：文件解析结果、预览选项与逐条写入进度
const importFileInput = ref(null)
const importFileName = ref('')
const importTasks = ref([])
const importWarnings = ref([])
const importError = ref('')
const importGroupByList = ref(true)
const importIncludeCompleted = ref(true)
const isImportDragging = ref(false)
const isImporting = ref(false)
const importDone = ref(false)
const importCancelRequested = ref(false)
const importProgress = ref({ done: 0, total: 0, title: '' })
const importResult = ref(null)

// 日历：ICS 文件解析结果、导入导出状态与订阅令牌
const calendarFileInput = ref(null)
const calendarFileName = ref('')
const calendarEvents = ref([])
const calendarSkipped = ref(0)
const calendarImportError = ref('')
const isCalendarDragging = ref(false)
const isCalendarImporting = ref(false)
const calendarImportDone = ref(false)
const calendarImportResult = ref('')
const isExportingCalendar = ref(false)
const calendarExportMessage = ref('')
const calendarExportError = ref('')
const isTokenBusy = ref(false)
const calendarTokenError = ref('')
const feedCopied = ref(false)

const calendarFeedToken = computed(() => settingsForm.value.calendarFeedToken || '')
const calendarFeedUrl = computed(() => calendarFeedToken.value ? buildCalendarFeedUrl(calendarFeedToken.value) : '')

const formatCalendarTime = (value) => new Date(value).toLocaleString('zh-CN', {
  month: 'numeric',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
})

// 只把用户勾选的已完成任务纳入计划，关闭后它们不会写入
const importCandidateTasks = computed(() => importIncludeCompleted.value
  ? importTasks.value
  : importTasks.value.filter((task) => !task.completedAt))

// 预览统计与写入计划都随选项实时重算
const importSummary = computed(() => summarizeTickTickTasks(importCandidateTasks.value))
const importPlan = computed(() => buildImportPlan(importCandidateTasks.value, {
  groupByList: importGroupByList.value
}))
const importWarningList = computed(() => [...new Set([...importWarnings.value, ...importPlan.value.warnings])])
const importPercent = computed(() => {
  if (!importProgress.value.total) return 0
  return Math.round((importProgress.value.done / importProgress.value.total) * 100)
})

// 用户信息
const userEmail = computed(() => authStore.user?.email || '未知')
const userEmailVerified = computed(() => authStore.user?.email_confirmed_at !== null)
const userCreatedAt = computed(() => {
  if (authStore.user?.created_at) {
    const date = new Date(authStore.user.created_at)
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    })
  }
  return '未知'
})

// 关闭密码修改弹窗
const closePasswordModal = () => {
  showPasswordModal.value = false
  passwordError.value = ''
  passwordSuccess.value = ''
  newPassword.value = ''
  confirmPassword.value = ''
}

const loadSettings = async () => {
  settingsError.value = ''
  settingsSuccess.value = ''
  settingsLoading.value = true

  try {
    await authStore.initAuth()
    const userId = authStore.user?.id
    const result = await fetchUserSettings(userId)
    if (!result.success) {
      settingsError.value = result.error?.message || '读取设置失败'
      return
    }
    settingsForm.value = { ...result.data }
  } catch (err) {
    settingsError.value = '读取设置失败'
  } finally {
    settingsLoading.value = false
  }
}

const handleSaveSettings = async () => {
  settingsError.value = ''
  settingsSuccess.value = ''
  settingsSaving.value = true

  try {
    const userId = authStore.user?.id
    const result = await saveUserSettings(userId, settingsForm.value)
    if (!result.success) {
      settingsError.value = result.error?.message || '保存设置失败'
      return
    }
    settingsForm.value = { ...result.data }
    settingsSuccess.value = '设置已保存'
    setTimeout(() => {
      settingsSuccess.value = ''
    }, 1800)
  } catch (err) {
    settingsError.value = '保存设置失败'
  } finally {
    settingsSaving.value = false
  }
}

// 读取并解析文件：只做预览，不写数据库
const loadImportFile = async (file) => {
  if (!file) return

  importError.value = ''
  importResult.value = null
  importDone.value = false
  importTasks.value = []
  importWarnings.value = []
  importFileName.value = file.name

  if (file.size > TICKTICK_IMPORT_MAX_BYTES) {
    importError.value = '文件超过 5 MB，请先在滴答清单中分批导出'
    importFileName.value = ''
    return
  }

  try {
    const text = await file.text()
    if (!text.trim()) throw new Error('文件为空')
    const parsed = parseTickTickFile(file.name, text)
    importTasks.value = parsed.tasks
    importWarnings.value = parsed.warnings
  } catch (err) {
    importError.value = err instanceof Error ? err.message : '解析文件失败'
    importFileName.value = ''
  }
}

// 选择文件后允许再次选择同一个文件
const handleImportFileChange = (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  loadImportFile(file)
}

// 拖入文件与点击选择走同一条解析流程
const handleImportDrop = (event) => {
  isImportDragging.value = false
  loadImportFile(event.dataTransfer?.files?.[0])
}

// 按计划逐条写入；父任务失败时子任务会被跳过
const handleImportStart = async () => {
  if (isImporting.value || importDone.value) return

  if (!navigator.onLine) {
    importError.value = '当前离线，恢复网络后再导入'
    return
  }

  const plan = importPlan.value
  if (!plan.nodes.length) {
    importError.value = '没有可导入的任务'
    return
  }

  importError.value = ''
  importResult.value = null
  isImporting.value = true
  importCancelRequested.value = false
  importProgress.value = { done: 0, total: plan.nodes.length, title: '' }

  try {
    importResult.value = await executeTickTickImport({
      supabase,
      nodes: plan.nodes,
      onProgress: (done, total, title) => {
        importProgress.value = { done, total, title }
      },
      isCancelled: () => importCancelRequested.value
    })
    // 只要写过数据就禁止重复点击，避免同一文件二次导入
    importDone.value = importResult.value.imported > 0
      || importResult.value.updated > 0
      || importResult.value.failed > 0
      || importResult.value.skipped > 0
    await todoStore.fetchTodos()
  } catch (err) {
    // 写入中途异常可能已产生部分数据，强制重置文件后再导入
    importDone.value = true
    importError.value = err instanceof Error ? err.message : '导入失败'
  } finally {
    isImporting.value = false
  }
}

// 取消只阻止后续写入，已创建的任务保留
const handleImportCancel = () => {
  importCancelRequested.value = true
}

// 清空预览，换一个文件或重新导入
const resetImport = () => {
  if (importFileInput.value) importFileInput.value.value = ''
  importFileName.value = ''
  importTasks.value = []
  importWarnings.value = []
  importError.value = ''
  importResult.value = null
  importDone.value = false
  isImporting.value = false
  importCancelRequested.value = false
  importProgress.value = { done: 0, total: 0, title: '' }
}

// 读取 ICS 只做预览；确认后才批量写入日程
const loadCalendarFile = async (file) => {
  if (!file) return

  calendarImportError.value = ''
  calendarImportResult.value = ''
  calendarImportDone.value = false
  calendarEvents.value = []
  calendarSkipped.value = 0
  calendarFileName.value = file.name

  try {
    const { events, skipped } = await readIcsFile(file)
    calendarEvents.value = events
    calendarSkipped.value = skipped
  } catch (err) {
    calendarImportError.value = err instanceof Error ? err.message : '解析日历失败'
    calendarFileName.value = ''
  }
}

const handleCalendarFileChange = (event) => {
  const file = event.target.files?.[0]
  event.target.value = ''
  loadCalendarFile(file)
}

const handleCalendarDrop = (event) => {
  isCalendarDragging.value = false
  loadCalendarFile(event.dataTransfer?.files?.[0])
}

const resetCalendarImport = () => {
  if (calendarFileInput.value) calendarFileInput.value.value = ''
  calendarFileName.value = ''
  calendarEvents.value = []
  calendarSkipped.value = 0
  calendarImportError.value = ''
  calendarImportResult.value = ''
  calendarImportDone.value = false
  isCalendarImporting.value = false
}

const handleCalendarImport = async () => {
  if (isCalendarImporting.value || calendarImportDone.value || !calendarEvents.value.length) return

  if (!navigator.onLine) {
    calendarImportError.value = '当前离线，恢复网络后再导入'
    return
  }

  calendarImportError.value = ''
  isCalendarImporting.value = true
  try {
    const result = await scheduleStore.createSchedules(calendarEvents.value)
    if (!result.success) throw new Error(result.error)
    calendarImportResult.value = `已导入 ${result.data.length} 个日程`
    calendarImportDone.value = true
  } catch (err) {
    calendarImportError.value = err instanceof Error ? err.message : '导入日程失败'
    calendarImportDone.value = true
  } finally {
    isCalendarImporting.value = false
  }
}

const handleCalendarExport = async () => {
  calendarExportError.value = ''
  calendarExportMessage.value = ''
  isExportingCalendar.value = true
  try {
    const result = await scheduleStore.fetchSchedules({ force: true })
    if (!result.success) throw new Error(result.error)
    const count = exportSchedulesIcs(result.data)
    calendarExportMessage.value = `已导出 ${count} 个日程`
  } catch (err) {
    calendarExportError.value = err instanceof Error ? err.message : '导出失败'
  } finally {
    isExportingCalendar.value = false
  }
}

// 订阅令牌增删都写回同一份用户设置，避免覆盖其他偏好
const handleGenerateFeed = async () => {
  calendarTokenError.value = ''
  isTokenBusy.value = true
  try {
    const result = await ensureCalendarFeedToken(authStore.user?.id, settingsForm.value)
    if (!result.success) throw new Error(result.error?.message || '生成订阅链接失败')
    settingsForm.value = { ...result.settings }
  } catch (err) {
    calendarTokenError.value = err instanceof Error ? err.message : '生成订阅链接失败'
  } finally {
    isTokenBusy.value = false
  }
}

const handleRotateFeed = async () => {
  if (!window.confirm('重新生成后旧订阅链接会立即失效，确定继续吗？')) return

  calendarTokenError.value = ''
  isTokenBusy.value = true
  try {
    const result = await rotateCalendarFeedToken(authStore.user?.id, settingsForm.value)
    if (!result.success) throw new Error(result.error?.message || '重新生成失败')
    settingsForm.value = { ...result.settings }
    feedCopied.value = false
  } catch (err) {
    calendarTokenError.value = err instanceof Error ? err.message : '重新生成失败'
  } finally {
    isTokenBusy.value = false
  }
}

const handleDisableFeed = async () => {
  if (!window.confirm('停用后订阅链接会立即失效，确定继续吗？')) return

  calendarTokenError.value = ''
  isTokenBusy.value = true
  try {
    const result = await disableCalendarFeed(authStore.user?.id, settingsForm.value)
    if (!result.success) throw new Error(result.error?.message || '停用失败')
    settingsForm.value = { ...result.settings }
    feedCopied.value = false
  } catch (err) {
    calendarTokenError.value = err instanceof Error ? err.message : '停用失败'
  } finally {
    isTokenBusy.value = false
  }
}

const handleCopyFeed = async () => {
  try {
    await navigator.clipboard.writeText(calendarFeedUrl.value)
    feedCopied.value = true
    setTimeout(() => {
      feedCopied.value = false
    }, 1800)
  } catch (err) {
    calendarTokenError.value = '复制失败，请手动选中链接复制'
  }
}

// 修改密码
const handleChangePassword = async () => {  passwordError.value = ''
  passwordSuccess.value = ''

  // 验证
  if (!newPassword.value || !confirmPassword.value) {
    passwordError.value = '请填写新密码和确认密码'
    return
  }

  if (newPassword.value.length < 6) {
    passwordError.value = '新密码至少需要 6 个字符'
    return
  }

  if (newPassword.value !== confirmPassword.value) {
    passwordError.value = '两次输入的密码不一致'
    return
  }

  isChangingPassword.value = true
  
  try {
    // 调用 Supabase 更新密码 API
    const { error } = await supabase.auth.updateUser({
      password: newPassword.value
    })
    
    if (error) {
      passwordError.value = error.message || '密码修改失败，请重试'
      return
    }
    
    passwordSuccess.value = '密码修改成功！'
    setTimeout(() => {
      closePasswordModal()
    }, 2000)
  } catch (err) {
    passwordError.value = '密码修改失败，请重试'
  } finally {
    isChangingPassword.value = false
  }
}


// 退出登录
const handleSignOut = async () => {
  if (!window.confirm('确定要退出登录吗？')) {
    return
  }

  try {
    await authStore.signOut()
    router.push({ name: 'home' })
  } catch (err) {
    alert('退出登录失败，请稍后重试')
  }
}

// 删除账户
const handleDeleteAccount = async () => {
  if (isDeletingAccount.value) {
    return
  }

  if (!window.confirm('确定要删除账户吗？此操作无法撤销！')) {
    return
  }
  
  if (!window.confirm('再次确认：删除账户后，所有数据将被永久删除')) {
    return
  }

  isDeletingAccount.value = true
  try {
    await authStore.deleteAccount()
    await authStore.signOut()
    alert('账户已删除')
    router.replace({ name: 'home' })
  } catch (err) {
    const message = err instanceof Error ? err.message : '删除账户失败，请稍后重试'
    alert(message)
  } finally {
    isDeletingAccount.value = false
  }
}

onMounted(() => {
  loadSettings()
  window.addEventListener('keydown', handleKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown)
})
</script>
