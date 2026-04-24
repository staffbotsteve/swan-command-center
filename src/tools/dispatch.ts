import { defineTool } from "./registry";
import { sendTelegram } from "@/lib/channels/telegram-send";
import type { DispatchInput, DispatchOutput } from "@/types/tools";

export default defineTool<DispatchInput, DispatchOutput>({
  name: "dispatch",
  description:
    "Send an outbound message. Phase 1 supports Telegram; Slack and Email land in Phase 2.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      channel: { type: "string", enum: ["telegram", "slack", "email"] },
      recipient: {
        type: "string",
        description: "Telegram chat id, Slack user id, or email address.",
      },
      text: { type: "string" },
      thread_id: { type: "string", description: "Optional — for Slack/email threading." },
    },
    required: ["channel", "recipient", "text"],
    additionalProperties: true,
  },
  async handler({ channel, recipient, text }) {
    if (channel === "telegram") {
      const id = await sendTelegram(recipient, text);
      return { delivered: true, external_message_id: String(id) };
    }
    // Slack + email land in Phase 2.
    return { delivered: false };
  },
});
