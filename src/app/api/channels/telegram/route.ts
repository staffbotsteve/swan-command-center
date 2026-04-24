import { NextRequest, NextResponse } from "next/server";
import { ingest } from "@/lib/ingest";
import { sendTelegram } from "@/lib/channels/telegram-send";
import { runTurn } from "@/lib/anthropic";
import { markStatus, SpendCapExceeded } from "@/lib/queue";
import { costUsd } from "@/lib/pricing";

// When USE_WORKER_RUNTIME=1, this route stops invoking agents inline.
// The worker process drains the queue via SDK.query() instead. See
// docs/specs/2026-04-24-option-c-local-sdk.md.
const USE_WORKER = process.env.USE_WORKER_RUNTIME === "1";

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

  // Fire-and-forget: drive the agent session and reply asynchronously.
  // Vercel allows background work up to the function timeout; longer tasks
  // would need a queue worker (Phase 2 consideration).
  // Worker runtime path: enqueue-only. Return immediately; worker
  // picks up the task from Supabase and handles the turn via the SDK.
  if (USE_WORKER) {
    return NextResponse.json({
      ok: true,
      task_id,
      agent: agent.role,
      rule: decision.rule,
      runtime: "worker",
    });
  }

  // Managed Agents fallback path (Phase 1 runtime).
  void (async () => {
    try {
      await markStatus(task_id, {
        status: "in_flight",
        started_at: new Date().toISOString(),
      });
      const turn = await runTurn(agent.id, ENV_ID, msg.text);
      const cost = costUsd(agent.model, turn.usage);
      if (turn.error) {
        await sendTelegram(chatId, `⚠️ ${turn.error}`);
        await markStatus(task_id, {
          status: "failed",
          completed_at: new Date().toISOString(),
          session_id: turn.session_id,
          tokens_in: turn.usage.input_tokens,
          tokens_out: turn.usage.output_tokens,
          cost_usd: cost,
          output: { error: turn.error, rule: decision.rule },
        });
        return;
      }
      const reply = turn.text || "(empty response)";
      await sendTelegram(chatId, reply);
      await markStatus(task_id, {
        status: "done",
        completed_at: new Date().toISOString(),
        session_id: turn.session_id,
        tokens_in: turn.usage.input_tokens,
        tokens_out: turn.usage.output_tokens,
        cost_usd: cost,
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
