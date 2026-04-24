// Rules-first router per spec §6.
// Ordered chain; first rule to return a decision wins. Main is the guaranteed fallback.

import {
  explicitMention,
  slashCommand,
  channelHint,
  senderHint,
  fallbackMain,
  type IncomingMessage,
  type RoutingDecision,
  type ChannelHintMap,
  type SenderHintMap,
} from "./rules";

export interface RouterConfig {
  channelHints?: ChannelHintMap;
  senderHints?: SenderHintMap;
}

export function route(msg: IncomingMessage, config: RouterConfig = {}): RoutingDecision {
  return (
    explicitMention(msg) ??
    slashCommand(msg) ??
    channelHint(msg, config.channelHints ?? {}) ??
    senderHint(msg, config.senderHints ?? {}) ??
    fallbackMain(msg)
  );
}

export type { IncomingMessage, RoutingDecision, RoutingRule } from "./rules";
