// Bootstrap a new project end-to-end.
//
// Given a project name + company, this script wires up:
//   1. Local folder under ~/project-folders/<slug>/
//   2. Slack channel (created if missing, bot auto-invited)
//   3. Routing entry appended to docs/channel-routing.json
//   4. Vault folder under 01-Projects/<TitleCase>/ with a starter CONTEXT.md
//   5. Supabase channel_routing row (via npm run channels:seed -- --apply)
//
// Idempotent — safe to re-run. Steps that find existing artifacts skip.
//
// Usage:
//   node --env-file=.env.local scripts/bootstrap-project.mjs \
//     --slug PROJECT_SLUG \
//     --channel CHANNEL_NAME \
//     --company "Company LLC" \
//     [--description "One-line summary"] \
//     [--mentions-only] \
//     [--agent-role main]   (default: main)
//
// Required env: SLACK_BOT_TOKEN, GITHUB_PAT.
// Required for step 5 only: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.

import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";

const VAULT_REPO = process.env.VAULT_REPO ?? "staffbotsteve/swan-vault";
const PROJECTS_ROOT = process.env.PROJECTS_ROOT ?? "/Users/stevenswan/project-folders";

function arg(name) {
  const flag = `--${name}`;
  const i = process.argv.indexOf(flag);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  return v && !v.startsWith("--") ? v : true;
}

const slug = arg("slug");
const channel = arg("channel") ?? slug;
const company = arg("company");
const description = arg("description") ?? "";
const mentionsOnly = !!arg("mentions-only");
const agentRole = arg("agent-role") ?? "main";

if (!slug) {
  console.error("ERROR: --slug PROJECT_SLUG is required (kebab-case, e.g. my-new-project)");
  process.exit(1);
}
if (!/^[a-z][a-z0-9-]*$/.test(slug)) {
  console.error(`ERROR: slug must be lowercase letters/digits/hyphens, starting with a letter. got: ${slug}`);
  process.exit(1);
}

const SLACK_BOT_TOKEN = process.env.SLACK_BOT_TOKEN;
const GITHUB_PAT = process.env.GITHUB_PAT;
if (!SLACK_BOT_TOKEN) { console.error("ERROR: SLACK_BOT_TOKEN missing"); process.exit(1); }
if (!GITHUB_PAT)      { console.error("ERROR: GITHUB_PAT missing");      process.exit(1); }

console.log(`bootstrapping project: ${slug}`);
console.log(`  channel:     #${channel}`);
console.log(`  company:     ${company ?? "(none)"}`);
console.log(`  agent_role:  ${agentRole}`);
console.log(`  mentions:    ${mentionsOnly ? "on (bot only on @mention)" : "off (bot processes every message)"}`);
console.log("");

// ─── 1. Local project folder ────────────────────────────────────────────────

const localPath = path.join(PROJECTS_ROOT, slug);
try {
  await fs.access(localPath);
  console.log(`[1/5] local folder exists: ${localPath}`);
} catch {
  await fs.mkdir(localPath, { recursive: true });
  await fs.writeFile(
    path.join(localPath, "README.md"),
    `# ${slug}\n\n${description || "(description pending)"}\n\nCompany: ${company ?? "—"}\n`,
    "utf-8"
  );
  console.log(`[1/5] created local folder: ${localPath}`);
}

// ─── 2. Slack channel ───────────────────────────────────────────────────────

async function slackApi(method, body, isGet = false) {
  const url = `https://slack.com/api/${method}`;
  const opts = isGet
    ? { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } }
    : {
        method: "POST",
        headers: {
          Authorization: `Bearer ${SLACK_BOT_TOKEN}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify(body ?? {}),
      };
  const r = await fetch(url, opts);
  return r.json();
}

let channelId;
let alreadyExists = false;

// Try to find an existing channel by name first.
{
  let cursor;
  do {
    const u = new URL("https://slack.com/api/conversations.list");
    u.searchParams.set("limit", "1000");
    u.searchParams.set("types", "public_channel,private_channel");
    if (cursor) u.searchParams.set("cursor", cursor);
    const r = await fetch(u, { headers: { Authorization: `Bearer ${SLACK_BOT_TOKEN}` } });
    const j = await r.json();
    if (!j.ok) { console.error("slack list failed:", j.error); process.exit(1); }
    const match = (j.channels ?? []).find((c) => c.name === channel);
    if (match) {
      channelId = match.id;
      alreadyExists = true;
      break;
    }
    cursor = j.response_metadata?.next_cursor || undefined;
  } while (cursor);
}

if (alreadyExists) {
  console.log(`[2/5] slack channel #${channel} exists (${channelId})`);
} else {
  const create = await slackApi("conversations.create", { name: channel, is_private: false });
  if (!create.ok) {
    console.error(`slack create #${channel} failed:`, create.error, create);
    process.exit(1);
  }
  channelId = create.channel.id;
  console.log(`[2/5] created slack channel #${channel} (${channelId})`);
}

// Make sure the bot is a member.
const join = await slackApi("conversations.join", { channel: channelId });
if (join.ok || join.error === "already_in_channel" || join.error === "method_not_supported_for_channel_type") {
  console.log(`      bot is in #${channel}`);
} else {
  console.warn(`      could not join #${channel}: ${join.error} (you may need to /invite manually)`);
}

// ─── 3. docs/channel-routing.json ──────────────────────────────────────────

const routingPath = path.join(process.cwd(), "docs", "channel-routing.json");
const routingRaw = await fs.readFile(routingPath, "utf-8");
const routing = JSON.parse(routingRaw);
const existingIdx = routing.routes.findIndex(
  (r) => r.channel === "slack" && r.external_id === channelId
);
const newEntry = {
  channel: "slack",
  external_id: channelId,
  agent_role: agentRole,
  ...(company ? { company } : {}),
  ...(mentionsOnly ? { mentions_only: true } : {}),
  notes: `#${channel}${description ? " — " + description : ""}`,
};

if (existingIdx >= 0) {
  routing.routes[existingIdx] = newEntry;
  console.log(`[3/5] updated docs/channel-routing.json entry for #${channel}`);
} else {
  routing.routes.push(newEntry);
  console.log(`[3/5] appended docs/channel-routing.json entry for #${channel}`);
}
await fs.writeFile(routingPath, JSON.stringify(routing, null, 2) + "\n", "utf-8");

// ─── 4. Vault project folder ────────────────────────────────────────────────

function toTitleCase(s) {
  return s
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("-");
}

const vaultDir = `01-Projects/${toTitleCase(slug)}`;
const contextPath = `${vaultDir}/CONTEXT.md`;
const contextBody = [
  "---",
  `project: ${slug}`,
  `entity: ${company ?? "—"}`,
  `slack: "#${channel}"`,
  `created: ${new Date().toISOString().slice(0, 10)}`,
  "---",
  "",
  `# ${toTitleCase(slug)}`,
  "",
  description || "(description pending)",
  "",
  "## Status",
  "",
  "(initial bootstrap)",
  "",
  "## Decisions",
  "",
  "## Open questions",
  "",
].join("\n");

async function vaultGet(filePath) {
  const r = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${encodeURI(filePath)}`, {
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "swan-bootstrap",
    },
  });
  if (r.status === 404) return null;
  if (!r.ok) {
    const t = await r.text();
    throw new Error(`vault GET ${filePath}: ${r.status} ${t.slice(0, 200)}`);
  }
  return r.json();
}

const existing = await vaultGet(contextPath);
if (existing) {
  console.log(`[4/5] vault context exists at ${contextPath}`);
} else {
  const r = await fetch(`https://api.github.com/repos/${VAULT_REPO}/contents/${encodeURI(contextPath)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${GITHUB_PAT}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
      "User-Agent": "swan-bootstrap",
    },
    body: JSON.stringify({
      message: `bootstrap: scaffold ${vaultDir}`,
      content: Buffer.from(contextBody, "utf-8").toString("base64"),
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error(`vault PUT ${contextPath} failed:`, r.status, t.slice(0, 300));
    process.exit(1);
  }
  console.log(`[4/5] created vault context: ${contextPath}`);
}

// ─── 5. Supabase channel_routing seed ──────────────────────────────────────

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("[5/5] skipped — NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set");
  console.log("       (run `npm run channels:seed -- --apply` later when env is loaded)");
} else {
  await new Promise((resolve, reject) => {
    const p = spawn(
      process.execPath,
      ["scripts/seed-channel-routing.mjs", "--apply"],
      { stdio: "inherit", env: process.env }
    );
    p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`seed exited ${code}`))));
  });
  console.log("[5/5] supabase channel_routing seeded");
}

console.log("\n✓ bootstrap complete.");
console.log(`  local:   ${localPath}`);
console.log(`  slack:   #${channel} (${channelId})`);
console.log(`  vault:   ${vaultDir}/CONTEXT.md`);
console.log(`  routing: docs/channel-routing.json`);
