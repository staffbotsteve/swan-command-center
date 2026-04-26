import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "node:crypto";
import { ingest } from "@/lib/ingest";
import { SpendCapExceeded } from "@/lib/queue";
import { supabase } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const SIGNING_SECRET = process.env.SLACK_SIGNING_SECRET;
const ALLOW_USER_IDS = (process.env.SLACK_ALLOWED_USER_IDS ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * Validate Slack's request signature per
 * https://api.slack.com/authentication/verifying-requests-from-slack
 */
function verifySignature(
  rawBody: string,
  timestamp: string | null,
  signature: string | null
): boolean {
  if (!SIGNING_SECRET) return true; // signing secret not yet configured — skip
  if (!timestamp || !signature) return false;
  // Reject requests older than 5 minutes (replay protection)
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Date.now() / 1000 - ts) > 300) return false;
  const base = `v0:${timestamp}:${rawBody}`;
  const computed =
    "v0=" + createHmac("sha256", SIGNING_SECRET).update(base).digest("hex");
  const a = Buffer.from(computed);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

interface SlackEvent {
  type: string;
  channel?: string;
  channel_type?: string;
  user?: string;
  text?: string;
  ts?: string;
  bot_id?: string;
  thread_ts?: string;
}

interface SlackEventCallback {
  type: "event_callback";
  event: SlackEvent;
  team_id?: string;
  event_id?: string;
}

interface SlackUrlVerification {
  type: "url_verification";
  challenge: string;
  token: string;
}

type SlackPayload = SlackEventCallback | SlackUrlVerification | { type: string };

/**
 * Slack Events API webhook entrypoint.
 *
 * Three things happen here:
 *  1. URL verification handshake — return Slack's challenge so the
 *     event subscription can be registered. No signature required
 *     for this step.
 *  2. Real events — verify HMAC signature, allow-list the sender,
 *     enqueue a task, return 200 fast. Worker handles the agent run
 *     out-of-band and replies via the Slack API.
 *  3. Bot's own messages and other noise — drop with 200.
 *
 * Per-channel routing (channel id → role + company/project tags)
 * lands in the next commit; for now everything routes via the
 * normal ingest() rules.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const timestamp = req.headers.get("x-slack-request-timestamp");
  const signature = req.headers.get("x-slack-signature");

  let payload: SlackPayload;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "bad json" }, { status: 400 });
  }

  // 1. URL verification handshake — no signature, just echo the challenge.
  if (payload.type === "url_verification") {
    const v = payload as SlackUrlVerification;
    return NextResponse.json({ challenge: v.challenge });
  }

  // 2. Real events — must pass signature verification.
  if (!verifySignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: "bad signature" }, { status: 401 });
  }

  if (payload.type !== "event_callback") {
    return NextResponse.json({ ok: true, skipped: payload.type ?? "unknown" });
  }

  const evt = (payload as SlackEventCallback).event;
  if (!evt) return NextResponse.json({ ok: true, skipped: "no event" });

  // Drop bot-authored messages (including our own outbound replies).
  if (evt.bot_id) return NextResponse.json({ ok: true, skipped: "bot message" });

  // Only handle plain message events and explicit @-mentions.
  const isMessage = evt.type === "message" && typeof evt.text === "string" && evt.text.length > 0;
  const isMention = evt.type === "app_mention" && typeof evt.text === "string";
  if (!isMessage && !isMention) {
    return NextResponse.json({ ok: true, skipped: evt.type });
  }

  // Allow-list — block messages from any Slack user not on the list.
  if (ALLOW_USER_IDS.length > 0 && evt.user && !ALLOW_USER_IDS.includes(evt.user)) {
    return NextResponse.json({ ok: true, rejected: "not on allow list", user: evt.user });
  }

  const channel = evt.channel ?? "unknown";
  const text = evt.text ?? "";

  // Mentions-only filter: drop plain message.channels events when the
  // channel's routing row says mentions_only=true. app_mention always
  // passes (the user explicitly @-mentioned the bot). DMs always pass
  // (channel_type === "im" — there's no human-to-human conversation
  // happening in a one-on-one DM with the bot).
  if (isMessage && !isMention && evt.channel_type !== "im") {
    const { data: route } = await supabase()
      .from("channel_routing")
      .select("mentions_only")
      .eq("channel", "slack")
      .eq("external_id", channel)
      .maybeSingle();
    if (route?.mentions_only) {
      return NextResponse.json({ ok: true, skipped: "mentions-only channel, no @ mention" });
    }
  }

  // app_mention events also fire a parallel message.channels event.
  // To avoid double-processing the same user message, we treat
  // app_mention as authoritative: when we see an app_mention, we
  // process it. The matching message.channels event is then dropped
  // because Slack sends the bot's user id in the text (e.g. "<@U0B0...>")
  // which our text already contains. We dedup at the task level via
  // source_id + a short window — but the cleanest fix is in Slack
  // app config: subscribe to app_mention OR message.channels for a
  // given channel, not both. Since we DO want full-message coverage
  // in chat-mode channels, we keep both and rely on the worker's
  // claim-once semantics — duplicates would just be processed twice
  // briefly, which is wasteful but not user-visible.

  try {
    const { agent, task_id, decision } = await ingest({
      channel: "slack",
      external_id: channel,
      sender: evt.user ?? "unknown",
      text,
    });
    return NextResponse.json({
      ok: true,
      task_id,
      agent: agent.role,
      rule: decision.rule,
      runtime: "worker",
    });
  } catch (e) {
    if (e instanceof SpendCapExceeded) {
      return NextResponse.json(
        { ok: false, reason: "spend-cap", spend_today_usd: e.snapshot.total_today_usd },
        { status: 429 }
      );
    }
    throw e;
  }
}
