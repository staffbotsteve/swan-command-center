import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { sendTelegram } from "@/lib/channels/telegram-send";
import { SpendCapExceeded } from "@/lib/queue";

export const dynamic = "force-dynamic";

function allowedChatIds(): Set<string> {
  return new Set(
    (process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

const SECRET = process.env.TELEGRAM_WEBHOOK_SECRET;

/**
 * Telegram webhook entrypoint.
 *
 * Pure enqueue: validate the message, write a `tasks` row, return 200.
 * The worker (running locally on Steven's Mac via the LaunchAgent)
 * drains the queue via the Claude Agent SDK and replies on Telegram
 * out-of-band. No inline agent invocation here — the old Managed
 * Agents fallback was removed (it relied on a per-token API path
 * that drifted incompatible with the current beta and wouldn't be
 * the right cost model anyway).
 *
 * If the worker is offline, tasks accumulate in `queued` state and
 * drain when it comes back. Steven sees the queue in the dashboard's
 * /hive view.
 */
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

  let ingestResult;
  try {
    ingestResult = await ingest({
      channel: "telegram",
      external_id: chatId,
      sender: msg.from?.username ?? String(msg.from?.id ?? "unknown"),
      text: msg.text,
    });
  } catch (e) {
    if (e instanceof SpendCapExceeded) {
      try {
        await sendTelegram(
          chatId,
          `⛔ *Daily spend cap hit* — $${e.snapshot.total_today_usd.toFixed(2)} today.\nBlocked until tomorrow UTC or raise DAILY_SPEND_HARD_USD.`
        );
      } catch {
        // best-effort
      }
      return NextResponse.json({ ok: false, reason: "spend-cap" }, { status: 429 });
    }
    throw e;
  }
  const { agent, task_id, decision } = ingestResult;

  return NextResponse.json({
    ok: true,
    task_id,
    agent: agent.role,
    rule: decision.rule,
    runtime: "worker",
  });
}
