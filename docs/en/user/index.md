# User Guide

TodoHeap turns "things I should do" into "one thing I can do right now": AI breaks work down and ranks it, you just execute.

## Getting started

Open the [TodoHeap app](https://sherlocknieh.github.io/TodoHeap/) and sign up with an email address.

- **Sign up**: register a new account with your email
- **Sign in**: email + password
- **Reset password**: use the email reset link

## Tasks

### Create

Type a title in the input at the top of the list view and press Enter. The task is created immediately as not completed.

When the goal is still vague, open the AI view and describe it to the agent — it decides whether to build a task tree.

### Edit

Every view has the same panel toggle at the right of its title bar; what the panel holds depends on the view: task details for list, graph, heap and trash, the selected event for schedule, and the conversation context for AI.

In list, graph, heap and trash, click a task to open its detail panel on the right. Everything saves on blur:

| Field | Notes |
| --- | --- |
| Title | inline editable |
| Deadline | date and time picker |
| Difficulty | estimated hours, 0.25 step |
| Details | Markdown editor |

### Complete

Click the checkbox on the left of a task to switch between incomplete and complete. Completed tasks move to the "Completed" section at the bottom of the list, where you can restore them by unchecking.

### Rename

Double-click a task title: Enter saves, Esc cancels.

### Hierarchy

Tasks support unlimited nesting: each task stores its `child_ids`. A task can appear under multiple parents, and cycles are allowed; the list and graph views show the first occurrence in full and mark later references as back-links.

- Add a child: the `+` button on a task row
- Link an existing task: pick it in the detail panel to attach it as a child, creating an extra parent relationship
- Unlink: hover a child row in the detail panel or a back-link row in the list view and click the unlink icon; only that parent-child reference is removed and the task itself stays
- Change hierarchy: insert or re-parent nodes in the graph view
- Collapse: click the arrow on the left of a parent task

### Delete and restore

Deleting a task moves it to the trash, where it can be restored or permanently removed. A child cannot be restored while its parent is still in the trash — restore the parent first.

## AI features

### Chat agent

The AI view is a chat agent that can read and write your tasks and schedules on request.

Conversations are organised into sessions in the AI sidebar: use it to create, switch, rename or delete them. A new session is titled from its first message, sessions are stored in this browser only, and the previous single-conversation history is migrated automatically.

To connect a model, open **Settings → Model access** and pick a provider preset (OpenAI, DeepSeek, Kimi, GLM, Qwen, Gemini, OpenRouter, local Ollama) or enter any OpenAI-compatible Base URL and model name. With a personal key the configuration is stored only in this browser; some providers must allow browser requests (CORS) for the connection test to pass.

A built-in option is also available: choose **Built-in model** instead of a personal key. The model dropdown is populated by the gateway (platform allowlist first, otherwise the upstream `/models` list); if the list cannot be read, the field falls back to manual input. Requests are proxied by the TodoHeap gateway with a server-side key, so no key is stored in the browser. The gateway is currently a skeleton — subscription and quota checks are not enabled yet, and any signed-in user can call it.

Destructive actions (deleting tasks, clearing completed tasks, emptying the trash) are always shown for confirmation before they run.

You can also ask the agent to break an existing task down, turn a sentence into a task tree, or run a one-click optimisation. Everything happens in the chat: there are no separate AI buttons in the list or task detail panels.

## Views

| View | Route | Purpose |
| --- | --- | --- |
| List | `/app/list` | Day-to-day editing, ordered execution |
| Graph | `/app/graph` | Mind-map style structure work |
| Schedule | `/app/schedule` | Calendar events grouped by date |
| AI | `/app/ai` | Chat agent: manage tasks and schedules by conversation |
| Trash | `/app/trash` | Restore or permanently delete |
| Heap | `/app/heap` | Priority-ranked queue (sidebar entry currently hidden) |

Switch views from the activity bar or the "Views" group in the sidebar; on narrow screens the sidebar closes after switching.

## Calendar

The schedule view and **Settings → Calendar** can import and export `.ics` files and generate a read-only subscription URL for system calendars.

- **Import**: events are written to `schedules`; recurring events are expanded across the coming year, and imports are not de-duplicated
- **Export / subscribe**: only calendar events are included, not task deadlines
- **Subscription**: the URL contains a random token that acts as a read-only credential; regenerate or disable it at any time

Imported events appear in the schedule view. Click an event to open it in the right-hand panel, edit its title, times or notes and save; the panel's delete button removes it.

## Sync and offline

- Data lives in Supabase (PostgreSQL) with row-level security per user
- Writes made while offline are queued in the browser (localforage) and replayed in order once the connection returns
- Multi-device edits use last-write-wins; there is no field-level merge
- The status bar merges the realtime connection and the pending queue into one state: Synced, Pending, Connecting or Connection error; the left side shows the current view and overall completion

## Concepts

**Completion**: a task is complete when `completed_at` is set; there is no separate status field. Deleted tasks are soft-deleted (`deleted_at`) and live in the trash.

**Priority**: not a stored field. It is scored in real time from deadline urgency, completion progress and subtask complexity, and the heap view sorts by that score. Fill in deadlines and effort estimates accurately instead of maintaining priority by hand.

## Feedback

- Email: sherlocknieh@gmail.com
- Bugs and feature requests: [GitHub Issues](https://github.com/sherlocknieh/TodoHeap/issues)
