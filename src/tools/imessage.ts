import { defineTool } from "./registry";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface ImessageSendInput {
  recipient: string;
  text: string;
}

const PHONE_RE = /^\+?[1-9]\d{6,14}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate recipient before letting it anywhere near AppleScript.
 * We only accept E.164 phone numbers (with optional spaces / dashes /
 * parens stripped) or email addresses. Anything else rejects — no
 * arbitrary string injection into the osascript.
 */
function normalizeRecipient(input: string): string | null {
  const cleaned = input.replace(/[\s().-]/g, "");
  if (PHONE_RE.test(cleaned)) {
    return cleaned.startsWith("+") ? cleaned : "+" + cleaned;
  }
  if (EMAIL_RE.test(input)) return input;
  return null;
}

/**
 * AppleScript-safe quote: escapes backslashes and double quotes so a
 * malicious-looking message body can't break out of the AppleScript
 * literal. Combined with the recipient validator and execFile (no
 * shell) this gives defense in depth.
 */
function quoteForAppleScript(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

export default defineTool<ImessageSendInput, { sent: boolean; recipient: string }>({
  name: "imessage.send",
  description:
    "Send an iMessage via the worker Mac's Messages.app. Recipient must be an E.164 phone number (e.g. +15551234567) or an Apple ID email. Requires Messages.app to be running and signed in on the worker host. Outgoing only — incoming iMessages aren't piped back.",
  source: "builtin",
  initial_status: "experimental",
  input_schema: {
    type: "object",
    properties: {
      recipient: {
        type: "string",
        description: "E.164 phone number or Apple ID email.",
      },
      text: { type: "string" },
    },
    required: ["recipient", "text"],
    additionalProperties: false,
  },
  async handler({ recipient, text }) {
    const normalized = normalizeRecipient(recipient);
    if (!normalized) {
      throw new Error(
        `imessage.send: invalid recipient '${recipient}'. Must be E.164 phone or email.`
      );
    }
    if (!text || text.length === 0) {
      throw new Error("imessage.send: text is required");
    }
    if (text.length > 5000) {
      throw new Error("imessage.send: text > 5000 chars; split into multiple messages");
    }

    const script = `
tell application "Messages"
  set targetService to 1st service whose service type = iMessage
  set targetBuddy to buddy "${quoteForAppleScript(normalized)}" of targetService
  send "${quoteForAppleScript(text)}" to targetBuddy
end tell
    `.trim();

    try {
      await execFileAsync("/usr/bin/osascript", ["-e", script], { timeout: 10_000 });
      return { sent: true, recipient: normalized };
    } catch (e: unknown) {
      const err = e as { stderr?: string; message?: string };
      throw new Error(
        `imessage.send failed: ${(err.stderr ?? err.message ?? String(e)).slice(0, 300)}`
      );
    }
  },
});
