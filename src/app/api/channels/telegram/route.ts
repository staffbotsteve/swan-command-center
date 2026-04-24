import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { sendTelegram } from "@/lib/channels/telegram-send";
import { createSession, sendMessage, streamSession } from "@/lib/anthropic";
import { markStatus } from "@/lib/queue";

export const dynamic = "force-dynamic";

const ENV_ID = process.env.SWAN_ENV_ID ?? "env_01L4sqBNP3fo5hPLPSTtq7P1";

function allowedChatIds(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

export async function POST(req: NextRequest) {
  // Shared-secret header (set via Telegram setWebhook ?secret_token=...)
  if (SECRET) {
    const got = req.headers.get("x-telegram-bot-api-secret-token");
    if (got !== SECRET) {
      return NextResponse.json({ ok: false, reason: "bad secret" }, { status: 401 });
    }
  }

  const update = await req.json().catch(() => ({}));
  const msg = update.message ?? update.edited_message;
  if (!msg?.text) return NextResponse.json({ ok: true, skipped: "no text" });

  const chatId = String(msg.chat.id);
  const allowed = allowedChatIds();
  if (allowed.size > 0 && !allowed.has(chatId)) {
    return NextResponse.json({ ok: true, rejected: "not on allow list", chat_id: chatId });
  }

  const { agent, task_id, decision } = await ingest({
    channel: "telegram",
    external_id: chatId,
    sender: msg.from?.username ?? String(msg.from?.id ?? "unknown"),
    text: msg.text,
  });

  // Fire-and-forget: drive the agent session and reply asynchronously.
  // Vercel allows background work up to the function timeout; longer tasks
  // would need a queue worker (Phase 2 consideration).
  void (async () => {
    try {
      await markStatus(task_id, {
        status: "in_flight",
        started_at: new Date().toISOString(),
      });
      const session = await createSession(agent.id, ENV_ID);
      await sendMessage(session.id, msg.text);
      const stream = await streamSession(session.id);
      const text = await collectText(stream);
      const reply = text || "(empty response)";
      await sendTelegram(chatId, reply);
      await markStatus(task_id, {
        status: "done",
        completed_at: new Date().toISOString(),
        session_id: session.id,
        output: { text: reply, rule: decision.rule },
      });
    } catch (e) {
      const err = e instanceof Error ? e.message : String(e);
      try {
        await sendTelegram(chatId, `⚠️ ${err}`);
      } catch {
        // best-effort — don't mask the original error
      }
      await markStatus(task_id, { status: "failed" });
    }
  })();

  return NextResponse.json({ ok: true, task_id, agent: agent.role, rule: decision.rule });
}

async function collectText(res: Response): Promise<string> {
  if (!res.body) return "";
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let out = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunk = decoder.decode(value, { stream: true });
    for (const line of chunk.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const json = line.slice(6).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const evt = JSON.parse(json);
        if (evt.type === "agent.message" && Array.isArray(evt.content)) {
          for (const block of evt.content) {
            if (block.type === "text") out += block.text;
          }
        }
      } catch {
        // skip malformed chunks
      }
    }
  }
  return out;
}
