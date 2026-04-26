-- Per-channel "mentions only" toggle.
-- When true, the bot ignores plain channel messages in this channel
-- and only fires on @-mentions. DMs to the bot always go through
-- regardless (a DM is the user's explicit one-on-one to the bot).
--
-- Default false to keep existing behavior unchanged for assistant-*
-- channels and other channels where chat-mode is wanted.

alter table channel_routing
  add column if not exists mentions_only boolean not null default false;
