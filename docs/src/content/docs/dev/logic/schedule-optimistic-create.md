---
title: "日程新建与临时 ID"
---
# 日程新建与临时 ID

本页说明手动新建日程为什么点下即开右栏、临时 ID 如何换成真实 ID，以及这段时间里的写入约束。功能行为见[日历与订阅](../../features/calendar.md)。

## 为什么要临时 ID

- `schedules.id` 是 `BIGSERIAL`（`supabase/migrations/20261117000000_schema_tables.sql`），真实 ID 只有插入返回后才有。
- 旧实现先 `await createSchedules` 再 `emit('event-selected')`，按钮要空等一个网络往返，表现为「新建中…」的停顿。
- 现在 `stores/schedules.js` 的 `createSchedule` 先往列表插一条 `temp-schedule-<n>` 的本地行并立即返回，右栏照常按 ID 查行打开，写库在后台进行。

## 临时 ID 换算

- `idAliases`（临时 ID → 真实 ID）在插入成功后登记；`resolveScheduleId` 是唯一的换算入口。
- `findSchedule(id)`、`isSameSchedule(a, b)` 都先换算：右栏按 ID 查行、列表高亮、选中迁移都因此能同时接受临时 ID 和真实 ID。
- `ScheduleView.createSchedule` 在写库成功后把选中重新 emit 成真实 ID，避免 localStorage 里留下刷新后对不上的临时 ID。
- `ScheduleDetailPanel` 的草稿重置监听用 `isSameSchedule` 判断：同一个 ID 从临时换成真实时不重置，正在输入的标题等内容不会被冲掉。

## 写入排队

- `pendingCreates`（临时 ID → 写库结果）记录尚未落库的新建。
- `updateSchedule` / `deleteSchedule` 先 `await waitForCreate(id)`：右栏 500ms 防抖可能在插入返回前就触发，等真实 ID 再发请求，避免打到不存在的行。
- `fetchSchedules` 合并结果时保留 `pendingCreates` 里的临时行，导入触发的强制刷新不会把正在编辑的新建日程覆盖掉。

## 失败与回滚

- 插入失败时移除临时行、`endWrite(原因)` 让底栏同步徽章显示失败；`createSchedule` 返回的 `settled` 带着错误，调用方据此提示并收起右栏。
- 新建默认落一条标题为「新日程」的事件，用户直接关掉右栏时记录保留，与旧行为一致。

## 验证

- `frontend/src/stores/schedules.test.js` 覆盖三件事：临时行立即返回并被真实行替换、临时 ID 的修改等插入落库后才发出、插入失败回滚并留下失败原因。
