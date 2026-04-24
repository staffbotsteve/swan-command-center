-- Swan Command Center v2 — initial schema
-- Spec §7 (Memory — Hot store)
-- Applies to a fresh Supabase project; run after uuid-ossp / pgcrypto are enabled.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- tasks: the hive-mind ledger. Every agent action lives here.
-- ---------------------------------------------------------------------------
create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  agent_id text not null,
  parent_task_id uuid references tasks(id) on delete set null,
  channel text,                          -- dashboard | telegram | slack | email | voice | internal
  source_id text,                        -- channel-specific correlation (telegram chat id, slack thread, etc.)
  project text,                          -- vault project key, nullable
  company text,                          -- LLC name, nullable
  priority int not null default 50,
  status text not null check (status in ('queued','in_flight','awaiting_user','done','failed','archived')),
  system_prompt_hash text,
  session_id text,                       -- Managed Agents session id
  input jsonb,
  output jsonb,
  tokens_in int,
  tokens_out int,
  cost_usd numeric(10,4),
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz
);

create index if not exists tasks_agent_status_idx on tasks (agent_id, status);
create index if not exists tasks_company_project_status_idx on tasks (company, project, status);
create index if not exists tasks_created_desc_idx on tasks (created_at desc);
create index if not exists tasks_parent_idx on tasks (parent_task_id);

-- ---------------------------------------------------------------------------
-- memories: hot memory store. Promoted to vault via weekly cron.
-- ---------------------------------------------------------------------------
create table if not exists memories (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('fact','preference','context','pinned')),
  body text not null,
  tags text[] default '{}',
  company text,
  project text,
  importance numeric(3,2) not null default 0.50,
  ttl_days int,                          -- null means no expiry
  source_task_id uuid references tasks(id) on delete set null,
  promoted_to_vault_at timestamptz,
  vault_path text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists memories_kind_importance_idx on memories (kind, importance desc);
create index if not exists memories_promotion_idx on memories (promoted_to_vault_at) where promoted_to_vault_at is null;
create index if not exists memories_company_project_idx on memories (company, project);

-- ---------------------------------------------------------------------------
-- agent_registry: every agent ever created, permanent and ephemeral.
-- ---------------------------------------------------------------------------
create table if not exists agent_registry (
  id text primary key,                   -- mirrors Managed-Agents agent_id
  role text not null,                    -- main | research | comms | content | ops | legal | <custom>
  display_name text not null,
  model text not null,
  system_prompt_template text,
  status text not null check (status in ('permanent','ephemeral','awaiting_promotion','archived')),
  parent_agent_id text references agent_registry(id) on delete set null,
  creator_task_id uuid references tasks(id) on delete set null,
  created_at timestamptz not null default now(),
  promoted_at timestamptz,
  archived_at timestamptz
);

create index if not exists agent_registry_status_idx on agent_registry (status);
create index if not exists agent_registry_role_idx on agent_registry (role);

-- ---------------------------------------------------------------------------
-- skill_registry: every tool/skill the platform knows about.
-- ---------------------------------------------------------------------------
create table if not exists skill_registry (
  name text primary key,
  description text,
  source text not null check (source in ('builtin','curated','agent_authored')),
  status text not null check (status in ('experimental','standard','pr_pending','archived')),
  tool_definition jsonb,                 -- JSON schema registered with Managed Agents API
  code_ref text,                         -- git SHA for agent-authored skills
  pr_url text,
  author_agent_id text references agent_registry(id) on delete set null,
  install_count int not null default 0,
  success_count int not null default 0,
  failure_count int not null default 0,
  daily_spend_cap_usd numeric(10,4),
  created_at timestamptz not null default now(),
  promoted_at timestamptz
);

create index if not exists skill_registry_status_idx on skill_registry (status);

-- ---------------------------------------------------------------------------
-- spawn_log: every sub-agent spawn.
-- ---------------------------------------------------------------------------
create table if not exists spawn_log (
  id uuid primary key default gen_random_uuid(),
  parent_agent_id text not null references agent_registry(id) on delete cascade,
  child_agent_id text references agent_registry(id) on delete set null,
  reason text,
  task_id uuid references tasks(id) on delete set null,
  ttl_seconds int,
  created_at timestamptz not null default now(),
  terminated_at timestamptz,
  outcome text check (outcome in ('success','timeout','error','promoted','pending'))
);

create index if not exists spawn_log_parent_idx on spawn_log (parent_agent_id);
create index if not exists spawn_log_outcome_idx on spawn_log (outcome);

-- ---------------------------------------------------------------------------
-- install_log: every skill activation / PR event.
-- ---------------------------------------------------------------------------
create table if not exists install_log (
  id uuid primary key default gen_random_uuid(),
  skill_name text not null references skill_registry(name) on delete cascade,
  agent_id text,
  triggered_by_task_id uuid references tasks(id) on delete set null,
  action text not null check (action in ('activate','deactivate','propose','pr_opened','pr_approved','pr_merged','archive')),
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists install_log_skill_idx on install_log (skill_name);
create index if not exists install_log_action_idx on install_log (action);

-- ---------------------------------------------------------------------------
-- channel_routing: channel/external-id → preferred agent role.
-- ---------------------------------------------------------------------------
create table if not exists channel_routing (
  channel text not null,                 -- slack | telegram | email
  external_id text not null,             -- slack channel id, telegram chat id, email address
  agent_role text not null,
  created_at timestamptz not null default now(),
  primary key (channel, external_id)
);

-- ---------------------------------------------------------------------------
-- Seed data for the six permanent department agents.
-- The `id` values are placeholders; they get replaced by real Managed-Agents
-- agent_id strings when the bootstrap script runs (see Task 6 of the plan).
-- ---------------------------------------------------------------------------
insert into agent_registry (id, role, display_name, model, status) values
  ('seed_main',     'main',     'Main',     'claude-haiku-4-5-20251001', 'permanent'),
  ('seed_research', 'research', 'Research', 'claude-sonnet-4-6',         'permanent'),
  ('seed_comms',    'comms',    'Comms',    'claude-sonnet-4-6',         'permanent'),
  ('seed_content',  'content',  'Content',  'claude-sonnet-4-6',         'permanent'),
  ('seed_ops',      'ops',      'Ops',      'claude-sonnet-4-6',         'permanent'),
  ('seed_legal',    'legal',    'Legal',    'claude-opus-4-7',           'permanent')
on conflict (id) do nothing;
