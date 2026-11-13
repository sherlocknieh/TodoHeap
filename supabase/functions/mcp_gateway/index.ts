// 通用 MCP 网关：用已登录用户的身份转发任意 MCP 服务的 JSON-RPC 请求
// 浏览器直连第三方 MCP 常被 CORS 拦住，网关代为转发；令牌只在请求内存中传递，不落库
import { createClient } from "@supabase/supabase-js";
import { corsHeaders } from "../_shared/cors.ts";

const MCP_PROTOCOL_VERSION = "2025-06-18";
const MAX_BODY_BYTES = 256 * 1024;
const MAX_RESPONSE_BYTES = 1024 * 1024;
const TIMEOUT_MS = 20_000;

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error));

// 只允许 http(s) 且带主机名的地址，避免把网关当成任意内网探测器
const normalizeEndpoint = (value: unknown) => {
  const raw = String(value ?? "").trim();
  if (!raw) throw new Error("缺少 MCP 服务地址");
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("MCP 服务地址格式不正确");
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") {
    throw new Error("MCP 服务地址必须以 http(s) 开头");
  }
  if (!url.hostname) throw new Error("MCP 服务地址不可用");
  return url.toString();
};

const authenticate = async (req: Request) => {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { response: jsonResponse({ error: "缺少登录凭证" }, 401) };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    },
  );
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) {
    return { response: jsonResponse({ error: "登录会话已失效" }, 401) };
  }
  return { user: data.user };
};

const readJsonBody = async (req: Request): Promise<Record<string, unknown>> => {
  const text = await req.text();
  if (text.length > MAX_BODY_BYTES) throw new Error("请求体过大");
  try {
    const parsed = JSON.parse(text || "{}");
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("bad");
    return parsed as Record<string, unknown>;
  } catch {
    throw new Error("请求体不是合法 JSON");
  }
};

// 上游可能用普通 JSON 或 SSE 返回，取出最后一条完整消息
const readUpstreamPayload = (contentType: string, text: string) => {
  if (!contentType.includes("event-stream")) return text ? JSON.parse(text) : null;

  let payload: unknown = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data) continue;
    try {
      payload = JSON.parse(data);
    } catch {
      // 跨行分片会在后续 data 行补全，跳过当前不完整片段
    }
  }
  return payload;
};

interface ForwardOptions {
  endpoint: string;
  credential: string;
  sessionId: string;
  rpc: unknown;
}

interface ForwardResult {
  payload?: unknown;
  sessionId?: string;
  error?: string;
  unauthorized?: boolean;
  status?: number;
}

// 转发一次 JSON-RPC；上游下发的会话头原样带回给前端
const forwardRpc = async (
  { endpoint, credential, sessionId, rpc }: ForwardOptions,
): Promise<ForwardResult> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const requestHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": MCP_PROTOCOL_VERSION,
    };
    if (credential) requestHeaders.Authorization = credential;
    if (sessionId) requestHeaders["Mcp-Session-Id"] = sessionId;

    const upstream = await fetch(endpoint, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(rpc),
      signal: controller.signal,
    });

    const text = await upstream.text();
    if (text.length > MAX_RESPONSE_BYTES) throw new Error("上游响应过大");
    if (!upstream.ok) {
      const unauthorized = upstream.status === 401 || upstream.status === 403;
      return {
        error: unauthorized ? "MCP 服务鉴权失败，请检查令牌" : `MCP 服务返回 ${upstream.status}`,
        unauthorized,
        status: unauthorized ? 401 : 502,
      };
    }

    return {
      payload: readUpstreamPayload(upstream.headers.get("content-type") ?? "", text),
      sessionId: upstream.headers.get("mcp-session-id") ?? undefined,
    };
  } catch (error) {
    const aborted = error instanceof DOMException && error.name === "AbortError";
    throw new Error(aborted ? "MCP 服务响应超时" : `无法连接 MCP 服务：${messageOf(error)}`);
  } finally {
    clearTimeout(timer);
  }
};

async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const auth = await authenticate(req);
  if (auth.response) return auth.response;

  let body: Record<string, unknown>;
  try {
    body = await readJsonBody(req);
  } catch (error) {
    return jsonResponse({ error: messageOf(error) }, 400);
  }

  // 先做本地校验，参数问题直接给 400，不浪费一次上游请求
  let endpoint: string;
  try {
    endpoint = normalizeEndpoint(body.endpoint);
  } catch (error) {
    return jsonResponse({ error: messageOf(error) }, 400);
  }

  const rpc = body.rpc;
  if (!rpc || typeof rpc !== "object") {
    return jsonResponse({ error: "缺少 MCP 请求体" }, 400);
  }

  const credential = String(body.token ?? "").trim();

  try {
    const result = await forwardRpc({
      endpoint,
      credential: credential ? `Bearer ${credential}` : "",
      sessionId: String(body.sessionId ?? "").trim(),
      rpc,
    });
    if (result.error) {
      return jsonResponse({ error: result.error, unauthorized: result.unauthorized }, result.status);
    }
    return jsonResponse(result);
  } catch (error) {
    return jsonResponse({ error: messageOf(error) }, 502);
  }
}

Deno.serve(handler);
