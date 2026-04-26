-- Google OAuth token storage for the worker.
-- Comms (Gmail/Calendar) and Research (Drive) tools need long-lived auth.
-- The worker is a separate process from the browser session, so we
-- persist refresh tokens server-side and refresh access tokens on demand.

create table if not exists google_oauth_tokens (
  user_email text primary key,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  scopes text[] default '{}',
  updated_at timestamptz not null default now()
);

create index if not exists google_oauth_tokens_expires_at_idx on google_oauth_tokens (expires_at);
