# User Guide

TodoHeap turns "things I should do" into "one thing I can do right now": AI breaks work down and ranks it, you just execute.

## Getting started

Open the [TodoHeap app](https://sherlocknieh.github.io/TodoHeap/) and sign up with an email address.

- **Sign up**: register a new account with your email
- **Sign in**: email + password
- **Reset password**: use the email reset link

## Tasks

### Create

Type a title in the input at the top of the list view and press Enter. The task is created immediately with status `todo`.

When the goal is still vague, describe it in the AI input at the bottom instead — the AI analyses it and generates a task tree for you.

### Edit

Click a task to open the detail panel on the right. Everything saves on blur:

| Field | Notes |
| --- | --- |
| Title | inline editable |
| Start / deadline | date and time pickers |
| Difficulty | estimated hours, 0.25 step |
| Description | Markdown editor |

### Complete

Click the checkbox on the left of a task to switch between todo and done. Completed tasks move to the "Completed" section at the bottom of the list, where you can restore them by unchecking.

### Rename

Double-click a task title: Enter saves, Esc cancels.

### Hierarchy

Tasks support unlimited nesting through `parent_id`.

- Add a child: the `+` button on a task row
- Change hierarchy: insert or re-parent nodes in the tree view
- Collapse: click the arrow on the left of a parent task

### Delete and restore

Deleting a task moves it to the trash, where it can be restored or permanently removed. A child cannot be restored while its parent is still in the trash — restore the parent first.

## AI features

| Feature | What it does |
| --- | --- |
| Task breakdown | Split an existing task into 3–6 actionable subtasks |
| Task analysis | Turn a natural-language sentence into a task tree |
| Global optimisation | Adjust dates, break down and aggregate tasks in one pass |

Breakdown can run in preview mode: generated subtasks are shown for confirmation before they are written to the database. Enable auto-apply in **Settings → AI preferences** to skip that step.

## Views

| View | Route | Purpose |
| --- | --- | --- |
| List | `/app/list` | Day-to-day editing, ordered execution |
| Tree | `/app/tree` | Mind-map style structure work |
| Trash | `/app/trash` | Restore or permanently delete |
| Heap | `/app/heap` | Priority-ranked queue (sidebar entry currently hidden) |

Switch views from the "Views" group in the left sidebar; on narrow screens the sidebar closes after switching.

## Sync and offline

- Data lives in Supabase (PostgreSQL) with row-level security per user
- Writes made while offline are queued in the browser (localforage) and replayed in order once the connection returns
- Multi-device edits use last-write-wins; there is no field-level merge
- The status bar shows the realtime connection and whether unsynced changes exist

## Concepts

**Status**: `todo`, `doing`, `done`. Deleted tasks are soft-deleted (`deleted_at`) and live in the trash.

**Priority**: an integer from 0 to 4, higher means more urgent. You rarely set it by hand — the AI optimiser and heap view compute it from deadline, difficulty and structure.

## Feedback

- Email: sherlocknieh@gmail.com
- Bugs and feature requests: [GitHub Issues](https://github.com/sherlocknieh/TodoHeap/issues)
