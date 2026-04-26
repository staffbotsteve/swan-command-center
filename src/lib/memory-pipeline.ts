import { supabase } from "@/lib/supabase";
import { classify } from "@/lib/classifier";
import type { Memory } from "@/types/db";

export interface MaybeStoreMemoryArgs {
  text: string;
  context?: string;
  source_task_id: string;
  company?: string | null;
  project?: string | null;
}

/**
 * Classify a fragment of conversation and persist it as a memory row
 * if the classifier deems it noteworthy.
 *
 * Threshold rules (tunable):
 *   - kind === "noise"          → drop, never store
 *   - importance < 0.3          → drop (low signal)
 *   - everything else           → insert
 *
 * Returns the inserted Memory row (or null when skipped).
 */
export async function maybeStoreMemory(
  args: MaybeStoreMemoryArgs
): Promise<Memory | null> {
  const c = await classify({ text: args.text, context: args.context });
  if (c.kind === "noise") return null;
  if (c.importance < 0.3) return null;

  const { data, error } = await supabase()
    .from("memories")
    .insert({
      kind: c.kind,
      body: args.text,
      tags: c.tags,
      importance: c.importance,
      source_task_id: args.source_task_id,
      company: args.company ?? c.company ?? null,
      project: args.project ?? c.project ?? null,
    })
    .select("*")
    .single();
  if (error) {
    // Memory writes are best-effort — don't fail the agent turn over them.
    console.error("[memory] insert failed:", error.message);
    return null;
  }
  return data as Memory;
}
