// List every public + private Slack channel in the workspace, with id +
// name + member status. Use this to build your channel-routing JSON.
//
// Usage: node --env-file=.env.local scripts/list-slack-channels.mjs

const token = process.env.SLACK_BOT_TOKEN;
if (!token) {
  console.error("SLACK_BOT_TOKEN not set");
  process.exit(1);
}

const url = new URL("https://slack.com/api/conversations.list");
url.searchParams.set("exclude_archived", "true");
url.searchParams.set("limit", "1000");
url.searchParams.set("types", "public_channel,private_channel");

const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
const data = await res.json();
if (!data.ok) {
  console.error("slack list error:", data.error, data);
  process.exit(1);
}

const channels = (data.channels ?? []).sort((a, b) => a.name.localeCompare(b.name));
console.log(`workspace: ${data.team_id ?? "?"}    channels: ${channels.length}\n`);
console.log("ID".padEnd(13), "NAME".padEnd(40), "MEMBER", "TOPIC");
console.log("-".repeat(90));
for (const c of channels) {
  const topic = c.topic?.value ?? "";
  console.log(
    c.id.padEnd(13),
    `#${c.name}`.padEnd(40),
    c.is_member ? "✓     " : "✗     ",
    topic.slice(0, 60)
  );
}

console.log(`\nFor each channel you want to route:`);
console.log(`1. Make sure the bot is a member ('/invite @swan_command_center' in Slack).`);
console.log(`2. Copy the channel id into docs/channel-routing.json (replace REPLACE_ME_*).`);
console.log(`3. Run: npm run channels:seed`);
