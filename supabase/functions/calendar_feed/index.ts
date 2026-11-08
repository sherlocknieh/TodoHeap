import { createClient } from "@supabase/supabase-js";

type ScheduleRow = {
  id: number;
  title: string;
  notes: string | null;
  start_at: string;
  end_at: string;
  updated_at: string;
};

const TOKEN_PATTERN = /^[a-f0-9]{32}$/;

const pad = (value: number) => String(value).padStart(2, "0");

const toUtcStamp = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  return [
    date.getUTCFullYear(),
    pad(date.getUTCMonth() + 1),
    pad(date.getUTCDate()),
    "T",
    pad(date.getUTCHours()),
    pad(date.getUTCMinutes()),
    pad(date.getUTCSeconds()),
    "Z",
  ].join("");
};

const escapeText = (value: unknown) =>
  String(value ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/\r?\n/g, "\\n")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,");

// RFC 5545 要求每行不超过 75 字节，按 UTF-8 字节切分后再折行
const foldLine = (line: string) => {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;

  const chunks: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const charBytes = encoder.encode(char).length;
    if (currentBytes + charBytes > 74) {
      chunks.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += charBytes;
  }
  chunks.push(current);
  return chunks.join("\r\n ");
};

const buildCalendar = (schedules: ScheduleRow[]) => {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TodoHeap//Calendar Feed//ZH",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:TodoHeap 日程",
    "X-WR-TIMEZONE:UTC",
    "REFRESH-INTERVAL;VALUE=DURATION:PT30M",
    "X-PUBLISHED-TTL:PT30M",
  ];

  const stamp = toUtcStamp(new Date());
  for (const schedule of schedules) {
    lines.push(
      "BEGIN:VEVENT",
      `UID:todoheap-${schedule.id}@todoheap`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${toUtcStamp(schedule.start_at)}`,
      `DTEND:${toUtcStamp(schedule.end_at)}`,
      `SUMMARY:${escapeText(schedule.title || "未命名日程")}`,
    );
    if (schedule.notes) {
      lines.push(`DESCRIPTION:${escapeText(schedule.notes)}`);
    }
    if (schedule.updated_at) {
      lines.push(`LAST-MODIFIED:${toUtcStamp(schedule.updated_at)}`);
    }
    lines.push("END:VEVENT");
  }

  lines.push("END:VCALENDAR");
  return `${lines.map(foldLine).join("\r\n")}\r\n`;
};

const textResponse = (body: string, status: number, headers: Record<string, string> = {}) =>
  new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-store",
      "X-Robots-Tag": "noindex",
      ...headers,
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method !== "GET") {
    return textResponse("Method Not Allowed", 405, { Allow: "GET" });
  }

  const token = new URL(req.url).searchParams.get("token")?.trim() ?? "";
  if (!TOKEN_PATTERN.test(token)) {
    return textResponse("Not Found", 404);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  if (!supabaseUrl || !serviceRoleKey) {
    return textResponse("Feed unavailable", 503);
  }

  // 订阅链接不携带 JWT，用服务角色按令牌反查用户，避免开放匿名读取权限
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: owner, error: ownerError } = await admin
    .from("user_settings")
    .select("user_id")
    .eq("settings->>calendarFeedToken", token)
    .maybeSingle();

  if (ownerError) {
    console.error("calendar_feed lookup failed", ownerError.message);
    return textResponse("Feed unavailable", 500);
  }
  if (!owner) {
    return textResponse("Not Found", 404);
  }

  const { data: schedules, error: scheduleError } = await admin
    .from("schedules")
    .select("id, title, notes, start_at, end_at, updated_at")
    .eq("user_id", owner.user_id)
    .order("start_at", { ascending: true });

  if (scheduleError) {
    console.error("calendar_feed schedules failed", scheduleError.message);
    return textResponse("Feed unavailable", 500);
  }

  return new Response(buildCalendar((schedules ?? []) as ScheduleRow[]), {
    status: 200,
    headers: {
      "Content-Type": "text/calendar; charset=utf-8",
      "Content-Disposition": 'inline; filename="todoheap.ics"',
      "Cache-Control": "no-cache, no-store, max-age=0",
      "X-Robots-Tag": "noindex",
      "Access-Control-Allow-Origin": "*",
    },
  });
});
