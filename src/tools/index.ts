// Central tool registry export map.
// Each tool is registered at import-time via `defineTool(...)`. Keeping them
// in separate files lets us code-split and ship only what an agent needs.
//
// Phase 1 tools to wire up next (in this order, since several depend on each
// other via the vault and on Supabase being provisioned):
//
//   1. vault.read_file / vault.list_dir / vault.write_file    (no new deps)
//   2. web.search                                             (Brave or SerpAPI key)
//   3. classify                                               (Gemini Flash key)
//   4. dispatch                                               (per-channel send)
//   5. hive.query                                             (Supabase reads)
//   6. youtube.search                                         (yt-dlp subprocess)
//   7. notebooklm.* (list/create/add_source/query/report)     (Google OAuth dance)
//   8. image.generate                                         (image provider key)
//   9. spawn_subagent                                         (Managed Agents create)
//  10. skill.activate / skill.propose / skill.list            (Supabase + notify)
//
// Each tool file should:
//   - import { defineTool } from "./registry"
//   - import its input/output types from "@/types/tools"
//   - export the ToolDefinition as the default export
//   - add an explicit entry in the barrel below once landed

// import "./vault-read-file";
// import "./vault-list-dir";
// import "./vault-write-file";
import "./web-search";
import "./classify";
import "./dispatch";
// import "./hive-query";
// import "./youtube-search";
// import "./notebooklm";
// import "./image-generate";
// import "./spawn-subagent";
// import "./skill-manager";

export { listTools, getTool, defineTool, syncToolsToAnthropic } from "./registry";
export type { ToolDefinition, ToolHandlerContext, JsonSchemaObject, SyncResult } from "./registry";
