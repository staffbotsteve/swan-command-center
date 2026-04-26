-- Per-channel routing now carries company + project tags.
-- Sending a message to #swanbill-q2-audit auto-tags the resulting
-- task with company=SwanBill, project=q2-audit, so the agent doesn't
-- need to be told which entity to focus on.

alter table channel_routing add column if not exists company text;
alter table channel_routing add column if not exists project text;
alter table channel_routing add column if not exists notes text;

create index if not exists channel_routing_company_idx on channel_routing (company) where company is not null;
create index if not exists channel_routing_project_idx on channel_routing (project) where project is not null;
