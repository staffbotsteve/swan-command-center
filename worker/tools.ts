/**
 * In-process MCP tool wrappers for the Agent SDK worker.
 *
 * Each wrapper imports the existing tool handler from src/tools/*.ts
 * (the same code Vercel's HTTP tool routes use) and re-exposes it as
 * an MCP tool the SDK can call. Zero HTTP roundtrip — the worker
 * process has the same env (GITHUB_PAT, SUPABASE_*, etc.) it needs.
 */

import { z } from "zod";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";

import vaultReadFile from "../src/tools/vault-read-file";
import vaultListDir from "../src/tools/vault-list-dir";
import vaultWriteFile from "../src/tools/vault-write-file";
import classifyTool from "../src/tools/classify";
import webSearch from "../src/tools/web-search";
import dispatchTool from "../src/tools/dispatch";
import hiveQuery from "../src/tools/hive-query";
import youtubeSearch from "../src/tools/youtube-search";
import docParse from "../src/tools/doc-parse";
import { listPrs, readPr, commentTool } from "../src/tools/github";
import shellExec from "../src/tools/shell";
import imageImagen from "../src/tools/image-imagen";
import imageNanoBanana from "../src/tools/image-nano-banana";
import { balance, listCharges, listCustomers, listInvoices, listPayouts } from "../src/tools/stripe-read";
import { listThreads, readThread, createDraft, send } from "../src/tools/gmail";
import { listEvents, createEvent } from "../src/tools/calendar";
import { listFiles, readFile, writeFile as driveWriteFile } from "../src/tools/drive";
// NotebookLM is now provided by the external `notebooklm-mcp` stdio
// server (see worker/index.ts mcpServers config). The HTTP-companion
// tool wrappers in src/tools/notebooklm.ts are no longer registered;
// the file is kept on disk as documentation of the Path A approach.
import { sendMessage as slackSend, listChannels as slackListChannels, searchMessages as slackSearch } from "../src/tools/slack";
import imessageSend from "../src/tools/imessage";

import type { ToolDefinition, ToolHandlerContext } from "../src/tools/registry";

type McpResult = {
  content: Array<{ type: "text"; text: string }>;
  isError?: boolean;
};

function asText(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function wrap<I, O>(
  def: ToolDefinition<I, O>,
  zodSchema: z.ZodRawShape
) {
  return tool(
    def.name,
    def.description,
    zodSchema,
    async (args: unknown) => {
      const ctx: ToolHandlerContext = { agent_id: "worker", task_id: null };
      try {
        const result = await def.handler(args as I, ctx);
        return {
          content: [{ type: "text" as const, text: asText(result) }],
        } satisfies McpResult;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return {
          content: [{ type: "text" as const, text: `ERROR: ${msg}` }],
          isError: true,
        } satisfies McpResult;
      }
    }
  );
}

// Zod schemas mirror the JSON schemas in each src/tools/*.ts.
// Keep these minimal — over-specifying adds brittleness with nothing in return.

const vaultReadFileSchema = { path: z.string() };
const vaultListDirSchema = { path: z.string() };
const vaultWriteFileSchema = {
  path: z.string(),
  content: z.string(),
  commit_message: z.string().optional(),
};
const classifySchema = {
  text: z.string(),
  context: z.string().optional(),
};
const webSearchSchema = {
  query: z.string(),
  max_results: z.number().int().min(1).max(20).optional(),
};
const dispatchSchema = {
  channel: z.enum(["telegram", "slack", "email"]),
  recipient: z.string(),
  text: z.string(),
  thread_id: z.string().optional(),
};
const hiveQuerySchema = {
  agent_id: z.string().optional(),
  company: z.string().optional(),
  project: z.string().optional(),
  status: z
    .enum(["queued", "in_flight", "awaiting_user", "done", "failed", "archived"])
    .optional(),
  limit: z.number().int().min(1).max(200).optional(),
  since: z.string().optional(),
};
const youtubeSearchSchema = {
  query: z.string(),
  max_results: z.number().int().min(1).max(10).optional(),
};
const docParseSchema = {
  url: z.string(),
  max_chars: z.number().int().min(1000).max(500_000).optional(),
};
const ghListPrsSchema = {
  repo: z.string().optional(),
  state: z.enum(["open", "closed", "all"]).optional(),
  limit: z.number().int().min(1).max(100).optional(),
};
const ghReadPrSchema = {
  repo: z.string().optional(),
  number: z.number().int().min(1),
  include_diff: z.boolean().optional(),
};
const ghCommentSchema = {
  repo: z.string().optional(),
  number: z.number().int().min(1),
  body: z.string(),
};
const shellSchema = {
  command: z.string(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  timeout_ms: z.number().int().min(100).max(60_000).optional(),
};
const imagenSchema = {
  prompt: z.string(),
  aspect_ratio: z.enum(["1:1", "16:9", "9:16", "3:4", "4:3"]).optional(),
  number_of_images: z.number().int().min(1).max(4).optional(),
};
const nanoBananaSchema = {
  prompt: z.string(),
  reference_images: z.array(z.string()).optional(),
};
const stripeBalanceSchema = {} as z.ZodRawShape;
const stripeListChargesSchema = {
  limit: z.number().int().min(1).max(100).optional(),
  customer: z.string().optional(),
  created_gte: z.number().int().optional(),
  created_lte: z.number().int().optional(),
};
const stripeListCustomersSchema = {
  limit: z.number().int().min(1).max(100).optional(),
  email: z.string().optional(),
};
const stripeListInvoicesSchema = {
  limit: z.number().int().min(1).max(100).optional(),
  customer: z.string().optional(),
  status: z.enum(["draft", "open", "paid", "uncollectible", "void"]).optional(),
};
const stripeListPayoutsSchema = {
  limit: z.number().int().min(1).max(100).optional(),
  status: z.enum(["paid", "pending", "in_transit", "canceled", "failed"]).optional(),
};
const gmailListThreadsSchema = {
  query: z.string().optional(),
  max_results: z.number().int().min(1).max(50).optional(),
  label_ids: z.array(z.string()).optional(),
};
const gmailReadThreadSchema = { thread_id: z.string() };
const gmailCreateDraftSchema = {
  to: z.string(),
  subject: z.string(),
  body: z.string(),
  cc: z.string().optional(),
  bcc: z.string().optional(),
  thread_id: z.string().optional(),
};
const gmailSendSchema = gmailCreateDraftSchema;
const calListEventsSchema = {
  calendar_id: z.string().optional(),
  time_min: z.string().optional(),
  time_max: z.string().optional(),
  max_results: z.number().int().min(1).max(100).optional(),
  q: z.string().optional(),
};
const calCreateEventSchema = {
  calendar_id: z.string().optional(),
  summary: z.string(),
  description: z.string().optional(),
  start_iso: z.string(),
  end_iso: z.string(),
  attendees: z.array(z.string()).optional(),
  location: z.string().optional(),
};
const driveListFilesSchema = {
  query: z.string().optional(),
  page_size: z.number().int().min(1).max(100).optional(),
};
const driveReadFileSchema = {
  file_id: z.string(),
  export_mime_type: z.string().optional(),
  max_chars: z.number().int().min(1000).max(500_000).optional(),
};
const driveWriteFileSchema = {
  name: z.string(),
  content: z.string(),
  parent_folder_id: z.string().optional(),
  mime_type: z.string().optional(),
};
// (No notebooklm schemas here — provided by external notebooklm-mcp.)
const slackSendSchema = {
  channel: z.string(),
  text: z.string(),
  thread_ts: z.string().optional(),
};
const slackListChannelsSchema = {
  exclude_archived: z.boolean().optional(),
  limit: z.number().int().min(1).max(1000).optional(),
  types: z.string().optional(),
};
const slackSearchSchema = {
  query: z.string(),
  count: z.number().int().min(1).max(100).optional(),
};
const imessageSendSchema = {
  recipient: z.string(),
  text: z.string(),
};

/**
 * All tools the worker exposes to the SDK. Agents elect to call
 * only the ones they've been granted via their system prompt's
 * Tools section.
 */
export function buildSwanToolServer() {
  return createSdkMcpServer({
    name: "swan-tools",
    version: "0.1.0",
    tools: [
      wrap(vaultReadFile, vaultReadFileSchema),
      wrap(vaultListDir, vaultListDirSchema),
      wrap(vaultWriteFile, vaultWriteFileSchema),
      wrap(classifyTool, classifySchema),
      wrap(webSearch, webSearchSchema),
      wrap(dispatchTool, dispatchSchema),
      wrap(hiveQuery, hiveQuerySchema),
      wrap(youtubeSearch, youtubeSearchSchema),
      wrap(docParse, docParseSchema),
      wrap(listPrs, ghListPrsSchema),
      wrap(readPr, ghReadPrSchema),
      wrap(commentTool, ghCommentSchema),
      wrap(shellExec, shellSchema),
      wrap(imageImagen, imagenSchema),
      wrap(imageNanoBanana, nanoBananaSchema),
      wrap(balance, stripeBalanceSchema),
      wrap(listCharges, stripeListChargesSchema),
      wrap(listCustomers, stripeListCustomersSchema),
      wrap(listInvoices, stripeListInvoicesSchema),
      wrap(listPayouts, stripeListPayoutsSchema),
      wrap(listThreads, gmailListThreadsSchema),
      wrap(readThread, gmailReadThreadSchema),
      wrap(createDraft, gmailCreateDraftSchema),
      wrap(send, gmailSendSchema),
      wrap(listEvents, calListEventsSchema),
      wrap(createEvent, calCreateEventSchema),
      wrap(listFiles, driveListFilesSchema),
      wrap(readFile, driveReadFileSchema),
      wrap(driveWriteFile, driveWriteFileSchema),
      wrap(slackSend, slackSendSchema),
      wrap(slackListChannels, slackListChannelsSchema),
      wrap(slackSearch, slackSearchSchema),
      wrap(imessageSend, imessageSendSchema),
    ],
  });
}

/**
 * Canonical list of MCP tool names the worker exposes.
 * Agents list these in their `allowedTools` when we run a turn.
 * Names follow the Agent SDK MCP convention: `mcp__<server>__<tool>`.
 */
export const SWAN_TOOL_NAMES = [
  "mcp__swan-tools__vault_read_file",
  "mcp__swan-tools__vault_list_dir",
  "mcp__swan-tools__vault_write_file",
  "mcp__swan-tools__classify",
  "mcp__swan-tools__web_search",
  "mcp__swan-tools__dispatch",
  "mcp__swan-tools__hive_query",
  "mcp__swan-tools__youtube_search",
  "mcp__swan-tools__doc_parse",
  "mcp__swan-tools__github_list_prs",
  "mcp__swan-tools__github_read_pr",
  "mcp__swan-tools__github_comment",
  "mcp__swan-tools__shell_exec",
  "mcp__swan-tools__image_generate_imagen",
  "mcp__swan-tools__image_generate_nano_banana",
  "mcp__swan-tools__stripe_balance",
  "mcp__swan-tools__stripe_list_charges",
  "mcp__swan-tools__stripe_list_customers",
  "mcp__swan-tools__stripe_list_invoices",
  "mcp__swan-tools__stripe_list_payouts",
  "mcp__swan-tools__gmail_list_threads",
  "mcp__swan-tools__gmail_read_thread",
  "mcp__swan-tools__gmail_create_draft",
  "mcp__swan-tools__gmail_send",
  "mcp__swan-tools__calendar_list_events",
  "mcp__swan-tools__calendar_create_event",
  "mcp__swan-tools__drive_list_files",
  "mcp__swan-tools__drive_read_file",
  "mcp__swan-tools__drive_write_file",
  "mcp__swan-tools__slack_send_message",
  "mcp__swan-tools__slack_list_channels",
  "mcp__swan-tools__slack_search_messages",
  "mcp__swan-tools__imessage_send",
];
