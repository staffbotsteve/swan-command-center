/**
 * Outbound Slack send used by the worker's respondOverChannel.
 * Mirrors the shape of telegram-send.ts so worker/index.ts can dispatch
 * uniformly per channel.
 */
export async function sendSlack(
  channel: string,
  text: string,
  thread_ts?: string
): Promise<string> {
  const token = process.env.SLACK_BOT_TOKEN;
  if (!token) throw new Error("SLACK_BOT_TOKEN not set");
  const body: Record<string, unknown> = { channel, text };
  if (thread_ts) body.thread_ts = thread_ts;
  const res = await fetch("https://slack.com/api/chat.postMessage", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json; charset=utf-8",
    },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!data.ok) {
    throw new Error(`slack chat.postMessage: ${data.error ?? "unknown"}`);
  }
  return data.ts as string;
}
