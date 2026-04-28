import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const systemPrompt = `You are an AI assistant for task planning.
Your job is to convert a fuzzy natural language request into concrete todos and call the tool to create them.

Rules:
1) You MUST call the tool at least once.
2) Create 1-8 actionable tasks.
3) Keep each task title concise and specific (5-120 chars).
4) Description should be short and practical.
5) deadline must be ISO 8601 datetime string or null.
6) status can be one of: todo, doing, done. Prefer todo.
7) priority must be an integer 0-4.
8) Keep all generated tasks under the same root parent.
9) Multi-level nesting is allowed: parent_id may point to the root or any descendant under that root.
10) Use the same language as the user's input for title, description, and final summary. Do not switch language unless user asks.

After all needed tool calls, provide a short final summary.`;

type TodoStatus = "todo" | "doing" | "done";

interface RequestBody {
  query: string;
  parentId?: number | null;
}

interface CreateTodoArgs {
  title: string;
  description?: string | null;
  deadline?: string | null;
  status?: TodoStatus;
  priority?: number;
  parent_id?: number | null;
}

interface TodoParentNode {
  id: number;
  parent_id: number | null;
}

const createTodoTool = {
  type: "function",
  function: {
    name: "create_todo",
    description: "Create a new todo item in database",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        description: { type: ["string", "null"], maxLength: 500 },
        deadline: {
          type: ["string", "null"],
          description: "ISO 8601 datetime like 2026-04-17T09:00:00Z or null"
        },
        status: { type: "string", enum: ["todo", "doing", "done"] },
        priority: { type: "integer", minimum: 0, maximum: 4 },
        parent_id: { type: ["integer", "null"] }
      },
      required: ["title"]
    }
  }
} as const;

function createOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get("OPENAI_API_KEY") || Deno.env.get("OPENAI_API_KEY2") || "";
  const baseUrl = Deno.env.get("OPENAI_BASE_URL") || undefined;

  if (!apiKey) {
    throw new Error("缺少 OPENAI_API_KEY/OPENAI_API_KEY2");
  }
  return new OpenAI({ apiKey, baseURL: baseUrl });
}

function createSupabaseClient(req: Request) {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
  const authHeader = req.headers.get("Authorization") || "";

  return createClient(supabaseUrl, supabaseAnonKey, {
    global: {
      headers: {
        Authorization: authHeader,
      },
    },
  });
}

function sanitizeStatus(value: unknown): TodoStatus {
  return value === "doing" || value === "done" ? value : "todo";
}

function sanitizePriority(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return 1;
  if (n < 0) return 0;
  if (n > 4) return 4;
  return Math.round(n);
}

function sanitizeDeadline(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

function sanitizeTitle(value: unknown): string {
  if (typeof value !== "string") return "未命名任务";
  const t = value.trim();
  if (!t) return "未命名任务";
  return t.slice(0, 200);
}

function sanitizeDescription(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, 500);
}

function detectUserLanguage(text: string): string {
  if (/[\u3040-\u30ff]/.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/.test(text)) return "Korean";
  if (/[\u4e00-\u9fff]/.test(text)) return "Chinese";
  if (/[\u0400-\u04ff]/.test(text)) return "Russian";
  return "English";
}

async function getTodoParentNode(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  todoId: number,
): Promise<TodoParentNode | null> {
  const { data, error } = await supabase
    .from("todos")
    .select("id, parent_id")
    .eq("id", todoId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) return null;
  return data as TodoParentNode;
}

async function ensureParentBelongsToUser(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  parentId: number | null,
): Promise<number | null> {
  if (!parentId) return null;

  const { data, error } = await supabase
    .from("todos")
    .select("id")
    .eq("id", parentId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return data.id;
}

async function ensureParentWithinRoot(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
  requestedParentId: number | null,
  rootParentId: number | null,
): Promise<number | null> {
  if (rootParentId == null) {
    return ensureParentBelongsToUser(supabase, userId, requestedParentId);
  }

  if (requestedParentId == null) return rootParentId;

  const candidate = await getTodoParentNode(supabase, userId, requestedParentId);
  if (!candidate) return rootParentId;
  if (candidate.id === rootParentId) return rootParentId;

  let cursor: number | null = candidate.parent_id;
  let depth = 0;
  while (cursor != null && depth < 50) {
    if (cursor === rootParentId) return requestedParentId;
    const parent = await getTodoParentNode(supabase, userId, cursor);
    if (!parent) return rootParentId;
    cursor = parent.parent_id;
    depth += 1;
  }

  return rootParentId;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: RequestBody = await req.json();

    if (!body?.query || typeof body.query !== "string" || !body.query.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const supabase = createSupabaseClient(req);
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const openai = createOpenAIClient();
    const model = Deno.env.get("OPENAI_MODEL") || "deepseek-chat";
    const preferredLanguage = detectUserLanguage(body.query);

    const rootParentId = await ensureParentBelongsToUser(
      supabase,
      user.id,
      body.parentId ?? null,
    );

    const messages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
      {
        role: "system",
        content: `Current user id: ${user.id}. Preferred parent_id: ${rootParentId ?? "null"}.`,
      },
      {
        role: "system",
        content: `Use ${preferredLanguage}. Keep every generated task under one root tree. If preferred parent_id is null, first create a root task (parent_id null), then put other tasks under that root.`,
      },
      { role: "user", content: body.query.trim() },
    ];

    const createdTasks: Record<string, unknown>[] = [];
    let sessionRootId: number | null = rootParentId;

    for (let round = 0; round < 6; round++) {
      const completion = await openai.chat.completions.create({
        model,
        messages,
        tools: [createTodoTool],
        tool_choice: "auto",
      });

      const assistantMessage = completion.choices[0]?.message;
      if (!assistantMessage) {
        break;
      }

      messages.push(assistantMessage);
      const toolCalls = assistantMessage.tool_calls || [];

      if (toolCalls.length === 0) {
        break;
      }

      for (const toolCall of toolCalls) {
        if (toolCall.type !== "function" || toolCall.function.name !== "create_todo") {
          continue;
        }

        let parsedArgs: CreateTodoArgs;
        try {
          parsedArgs = JSON.parse(toolCall.function.arguments || "{}");
        } catch {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: false, error: "Invalid tool arguments" }),
          });
          continue;
        }

        const parentId = await ensureParentBelongsToUser(
          supabase,
          user.id,
          typeof parsedArgs.parent_id === "number" ? parsedArgs.parent_id : null,
        );

        const finalParentId = await ensureParentWithinRoot(
          supabase,
          user.id,
          parentId,
          sessionRootId,
        );

        const payload = {
          user_id: user.id,
          title: sanitizeTitle(parsedArgs.title),
          description: sanitizeDescription(parsedArgs.description),
          deadline: sanitizeDeadline(parsedArgs.deadline),
          status: sanitizeStatus(parsedArgs.status),
          priority: sanitizePriority(parsedArgs.priority),
          parent_id: finalParentId,
        };

        const { data, error } = await supabase
          .from("todos")
          .insert(payload)
          .select("id, title, description, deadline, status, priority, parent_id, created_at")
          .single();

        if (error) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: false, error: error.message }),
          });
          continue;
        }

        createdTasks.push(data as Record<string, unknown>);
        if (sessionRootId == null && typeof data?.id === "number") {
          sessionRootId = data.id;
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: true, task: data }),
        });
      }
    }

    if (createdTasks.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "AI 未生成可写入的任务"
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({
      success: true,
      createdCount: createdTasks.length,
      tasks: createdTasks,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    console.error("new_task_ai error:", error);
    const message = error instanceof Error ? error.message : String(error);
    return new Response(JSON.stringify({
      success: false,
      error: "Internal server error",
      message,
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  }
});
