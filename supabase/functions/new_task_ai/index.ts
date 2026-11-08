// ==================== 模块导入 ====================
// OpenAI/DeepSeek API 客户端库
import OpenAI from "openai";
// Supabase 数据库客户端库
import { createClient } from "@supabase/supabase-js";
// 共享的 CORS 响应头配置
import { corsHeaders } from "../_shared/cors.ts";

// ==================== AI 系统提示词 ====================
// 定义 AI 助手的角色、职责和工作规则
const systemPrompt = `你是一个专业的任务规划助手。
你的职责是将用户模糊的任务描述转化为清晰、结构化的任务树，并通过调用工具创建这些任务。

关键规则：
1) 你必须至少调用一次工具来创建任务。
2) 仅创建一个根任务，根任务详情中写用户的原始输入。
2) 在每个子任务标题前添加序号前缀，如 "1. "、"2. " 等，以确保正确的显示顺序。
3) 支持多级嵌套：parent_id 可以指向根任务或任何下级任务。
4) 使用与用户输入相同的语言来填写任务标题、详情和最终总结。
5) 为每个任务估算 sort_order（从 1 开始的序号）和 difficulty（估算工时，如 0.5、1、2.5）。
`;

// ==================== 类型定义 ====================
// 处理接收到的 HTTP 请求体结构
interface RequestBody {
  query: string;           // 用户输入的任务描述
  parentId?: number | null; // 可选的父任务 ID
}

// AI 工具调用时传递的参数结构
interface CreateTodoArgs {
  title: string;               // 任务标题（必填）
  details?: string | null;     // 任务详情
  deadline?: string | null;    // 截止日期
  parent_id?: number | null;   // 父任务 ID
  sort_order?: number | null;  // 排序序号
  difficulty?: number | null;  // 估算工时
}

// 从数据库查询的任务图节点结构
interface TodoGraphRow {
  id: number;               // 任务 ID
  child_ids: number[] | null; // 子任务 ID 列表
}

// ==================== AI 工具定义 ====================
// 定义 create_todo 工具，用于 AI 调用创建任务
const createTodoTool = {
  type: "function",
  function: {
    name: "create_todo",
    description: "Create a new todo item in database",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 200 },
        details: { type: ["string", "null"], maxLength: 500 },
        deadline: {
          type: ["string", "null"],
          description: "ISO 8601 datetime like 2026-04-17T09:00:00Z or null"
        },
        parent_id: { type: ["integer", "null"] },
        sort_order: { type: ["number", "null"] },
        difficulty: { type: ["number", "null"] }
      },
      required: ["title"]
    }
  }
} as const;

// ==================== 初始化函数 ====================
// 初始化 OpenAI/DeepSeek 客户端
// 从环境变量读取 API 密钥和服务地址
function createOpenAIClient(): OpenAI {
  const apiKey = Deno.env.get("DEEPSEEK_API_KEY");
  const baseUrl = Deno.env.get("DEEPSEEK_BASE_URL") || "https://api.deepseek.com";

  if (!apiKey) {
    throw new Error("缺少 DEEPSEEK_API_KEY");
  }
  return new OpenAI({ apiKey, baseURL: baseUrl });
}

// 初始化 Supabase 客户端
// 使用请求中的 Authorization 头进行用户认证
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

// ==================== 数据验证函数 ====================
// 验证和规范化排序序号：只接受有效的数字或 null
function sanitizeSortOrder(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  return n;
}

// 验证和规范化工时难度：确保非负数或 null
function sanitizeDifficulty(value: unknown): number | null {
  if (value == null) return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  if (n < 0) return 0;
  return n;
}

// 验证和规范化截止日期：转换为有效的 ISO 8601 格式
function sanitizeDeadline(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value !== "string") return null;

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed).toISOString();
}

// 验证和规范化任务标题：长度限制 1-200 字符
function sanitizeTitle(value: unknown): string {
  if (typeof value !== "string") return "未命名任务";
  const t = value.trim();
  if (!t) return "未命名任务";
  return t.slice(0, 200);
}

// 验证和规范化任务详情：长度限制 1-500 字符
function sanitizeDetails(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text) return null;
  return text.slice(0, 500);
}

// ==================== 工具函数 ====================
// 检测用户输入文本的语言类型
// 支持：日语、韩语、中文、俄语，默认英语
function detectUserLanguage(text: string): string {
  if (/[\u3040-\u30ff]/.test(text)) return "Japanese";
  if (/[\uac00-\ud7af]/.test(text)) return "Korean";
  if (/[\u4e00-\u9fff]/.test(text)) return "Chinese";
  if (/[\u0400-\u04ff]/.test(text)) return "Russian";
  return "English";
}

// 拉取当前用户的任务图: 父节点保存子列表
// 内存索引避免逐层查询祖先
async function fetchTodoGraph(
  supabase: ReturnType<typeof createSupabaseClient>,
  userId: string,
): Promise<Map<number, number[]>> {
  const { data, error } = await supabase
    .from("todos")
    .select("id, child_ids")
    .eq("user_id", userId)
    .is("deleted_at", null);

  if (error || !data) return new Map();
  return new Map(
    (data as TodoGraphRow[]).map((row) => [row.id, row.child_ids || []]),
  );
}

// 判断任务是否在根任务的子图中
// 沿 child_ids 广度遍历, visited 保证环不会死循环
function isWithinRoot(
  graph: Map<number, number[]>,
  rootId: number | null,
  candidateId: number | null,
): boolean {
  if (rootId == null) return true;
  if (candidateId == null) return false;

  const visited = new Set<number>([rootId]);
  const queue: number[] = [rootId];

  while (queue.length > 0) {
    const id = queue.shift() as number;
    if (id === candidateId) return true;
    for (const childId of graph.get(id) || []) {
      if (visited.has(childId)) continue;
      visited.add(childId);
      queue.push(childId);
    }
  }

  return false;
}

// ==================== 主处理函数 ====================
// Deno Edge Function 入口点
// 处理 HTTP 请求：解析用户输入，调用 AI 生成任务，存储到数据库
Deno.serve(async (req: Request) => {
  // 处理 CORS 预检请求
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 解析请求体并验证用户权限
    const body: RequestBody = await req.json();

    // 验证请求有效性：检查 query 参数
    if (!body?.query || typeof body.query !== "string" || !body.query.trim()) {
      return new Response(JSON.stringify({ error: "query is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 获取当前登录用户信息，验证请求是否来自已认证的用户
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

    // 初始化 AI 模型和消息列表
    // 系统提示词 → 当前用户和父 ID → 语言和规则 → 用户输入
    const openai = createOpenAIClient();
    const model = Deno.env.get("DEEPSEEK_MODEL") || "deepseek-flash";
    const preferredLanguage = detectUserLanguage(body.query);

    // 拉取任务图, 用于校验父任务归属与根内可达性
    const todoGraph = await fetchTodoGraph(supabase, user.id);

    // 根据用户请求获取初始父任务 ID
    // 用于后续所有创建的任务都在同一个任务树下
    const rootParentId = body.parentId != null && todoGraph.has(body.parentId)
      ? body.parentId
      : null;

    // 构建对话消息
    // 包含系统提示、用户 ID、父 ID 信息、语言要求和用户输入
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

    // 循环调用 AI 并处理响应
    // 最多 6 轮对话，逐步创建任务树
    for (let round = 0; round < 6; round++) {
      // 调用 AI 模型，获取下一步的工具调用指令
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

      // 遍历每个工具调用，执行创建任务的操作
      for (const toolCall of toolCalls) {
        // 跳过非 create_todo 的工具调用
        if (toolCall.type !== "function" || toolCall.function.name !== "create_todo") {
          continue;
        }

        // 解析 AI 传递的工具参数
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

        // 父任务必须存在且属于当前用户
        const requestedParentId = typeof parsedArgs.parent_id === "number" ? parsedArgs.parent_id : null;
        const parentId = requestedParentId != null && todoGraph.has(requestedParentId)
          ? requestedParentId
          : null;

        // 校验任务在根任务图的子图内, 越界则挂回根任务
        let finalParentId = parentId;
        if (sessionRootId != null) {
          if (parentId == null) {
            finalParentId = sessionRootId;
          } else if (!isWithinRoot(todoGraph, sessionRootId, parentId)) {
            finalParentId = sessionRootId;
          }
        }

        // 创建任务并把新 ID 追加到父节点的子列表
        const { data, error } = await supabase
          .rpc("create_todo", {
            p_title: sanitizeTitle(parsedArgs.title),
            p_details: sanitizeDetails(parsedArgs.details),
            p_deadline: sanitizeDeadline(parsedArgs.deadline),
            p_sort_order: sanitizeSortOrder(parsedArgs.sort_order),
            p_difficulty: sanitizeDifficulty(parsedArgs.difficulty),
            p_completed_at: null,
            p_parent_id: finalParentId,
          });

        if (error) {
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ ok: false, error: error.message }),
          });
          continue;
        }

        // 把新任务同步进内存图, 供后续轮次校验
        if (data && typeof data.id === "number") {
          todoGraph.set(data.id, []);
          if (finalParentId != null) {
            todoGraph.set(finalParentId, [...(todoGraph.get(finalParentId) || []), data.id]);
          }
        }

        createdTasks.push(data as Record<string, unknown>);
        if (sessionRootId == null && typeof data?.id === "number") {
          sessionRootId = data.id;
        }
        // 将工具执行结果反馈给 AI，用于下一轮对话
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify({ ok: true, task: data }),
        });
      }
    }

    // 验证是否成功创建了任务
    // 如果没有创建任何任务则返回错误
    if (createdTasks.length === 0) {
      return new Response(JSON.stringify({
        success: false,
        error: "AI 未生成可写入的任务"
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 返回成功响应，包含创建的任务列表
    return new Response(JSON.stringify({
      success: true,
      createdCount: createdTasks.length,
      tasks: createdTasks,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (error) {
    // 捕获任何未预期的异常，记录错误日志
    console.error("new_task_ai error:", error);
    const message = error instanceof Error ? error.message : String(error);
    // 返回 500 内部服务器错误，包含错误信息
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