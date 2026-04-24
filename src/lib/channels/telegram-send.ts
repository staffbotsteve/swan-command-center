export async function sendTelegram(chatId: string, text: string): Promise<number> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not set");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    throw new Error(`telegram send: ${res.status} ${await res.text()}`);
  }
  const body = await res.json();
  return body.result.message_id as number;
}
