// Individual routing rules per spec §6.
// Each rule is a pure function: (msg) -> RoutingDecision | null
// Return null when the rule has nothing to say; caller tries the next rule.

import type { AgentRole, Channel } from "@/types/db";

export interface IncomingMessage {
  channel: Channel;
  external_id: string;           // slack channel id, telegram chat id, email address
  sender: string;                // slack user id, telegram username, email address
  text: string;
}

export type RoutingRule =
  | "explicit_mention"
  | "slash_command"
  | "channel_hint"
  | "sender_hint"
  | "fallback_main";

export interface RoutingDecision {
  agent: AgentRole;
  confidence: number;            // 0..1
  rule: RoutingRule;
}

const KNOWN_ROLES: AgentRole[] = ["main", "research", "comms", "content", "ops", "legal"];

// Optional per-channel override maps. Keep them explicit rather than going through
// the DB — routing runs on the hot path of every inbound message.
export interface ChannelHintMap {
  // external_id -> agent role
  [external_id: string]: AgentRole;
}

export interface SenderHintMap {
  // sender -> agent role
  [sender: string]: AgentRole;
}

// ─── Rule 1: explicit @mention ──────────────────────────────────────────────

const MENTION_RE = /(^|\s)@([a-z_-]+)\b/i;

export function explicitMention(msg: IncomingMessage): RoutingDecision | null {
  const m = msg.text.match(MENTION_RE);
  if (!m) return null;
  const role = m[2].toLowerCase();
  if (!KNOWN_ROLES.includes(role)) return null;
  return { agent: role, confidence: 1.0, rule: "explicit_mention" };
}

// ─── Rule 2: slash command ─────────────────────────────────────────────────

// Supported forms:
//   /research ...
//   /dispatch research ...
//   /agent research ...
const SLASH_ROLE_RE = /^\/([a-z_-]+)(?:\s|$)/i;
const DISPATCH_RE = /^\/(?:dispatch|agent)\s+([a-z_-]+)/i;

export function slashCommand(msg: IncomingMessage): RoutingDecision | null {
  const trimmed = msg.text.trimStart();
  const dispatch = trimmed.match(DISPATCH_RE);
  if (dispatch) {
    const role = dispatch[1].toLowerCase();
    if (KNOWN_ROLES.includes(role)) {
      return { agent: role, confidence: 0.95, rule: "slash_command" };
    }
  }
  const slash = trimmed.match(SLASH_ROLE_RE);
  if (!slash) return null;
  const role = slash[1].toLowerCase();
  if (!KNOWN_ROLES.includes(role)) return null;
  return { agent: role, confidence: 0.9, rule: "slash_command" };
}

// ─── Rule 3: channel hint (Slack #research, dedicated Telegram chats, etc.) ─

export function channelHint(
  msg: IncomingMessage,
  map: ChannelHintMap
): RoutingDecision | null {
  const role = map[msg.external_id];
  if (!role) return null;
  return { agent: role, confidence: 0.75, rule: "channel_hint" };
}

// ─── Rule 4: sender hint (e.g. a specific email address routes to Ops) ─────

export function senderHint(
  msg: IncomingMessage,
  map: SenderHintMap
): RoutingDecision | null {
  const role = map[msg.sender];
  if (!role) return null;
  return { agent: role, confidence: 0.6, rule: "sender_hint" };
}

// ─── Rule 5: fallback to Main ──────────────────────────────────────────────

export function fallbackMain(_msg: IncomingMessage): RoutingDecision {
  return { agent: "main", confidence: 0.3, rule: "fallback_main" };
}
