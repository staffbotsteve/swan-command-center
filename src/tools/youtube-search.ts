import { defineTool } from "./registry";
import type { YoutubeSearchInput, YoutubeSearchOutput, YoutubeVideoResult } from "@/types/tools";

interface ScrapedVideo {
  videoId: string;
  title: string;
  channel: string;
  lengthSeconds?: number;
}

/**
 * Minimal YouTube search without API key by scraping the public search page.
 * Falls back gracefully when YouTube's page markup shifts — returns whatever
 * videos were parseable rather than throwing on partial matches.
 */
async function scrapeSearch(query: string, maxResults: number): Promise<ScrapedVideo[]> {
  const url = new URL("https://www.youtube.com/results");
  url.searchParams.set("search_query", query);
  const res = await fetch(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
      "Accept-Language": "en-US,en;q=0.9",
    },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`youtube search: ${res.status}`);
  const html = await res.text();

  // Extract the embedded JSON state.
  const m = html.match(/var ytInitialData\s*=\s*({[\s\S]+?});<\/script>/);
  if (!m) return [];
  let initial: unknown;
  try {
    initial = JSON.parse(m[1]);
  } catch {
    return [];
  }

  const results: ScrapedVideo[] = [];
  function walk(node: unknown) {
    if (results.length >= maxResults) return;
    if (Array.isArray(node)) {
      for (const n of node) walk(n);
      return;
    }
    if (!node || typeof node !== "object") return;
    const o = node as Record<string, unknown>;
    if ("videoRenderer" in o) {
      const v = o.videoRenderer as Record<string, unknown>;
      const title = extractText(v.title);
      const channel = extractText(v.ownerText) || extractText(v.longBylineText);
      const videoId = typeof v.videoId === "string" ? v.videoId : null;
      const lenStr = typeof v.lengthText === "object" ? extractText(v.lengthText) : null;
      if (videoId && title) {
        results.push({
          videoId,
          title,
          channel,
          lengthSeconds: lenStr ? parseLength(lenStr) : undefined,
        });
      }
    }
    for (const k of Object.keys(o)) walk(o[k]);
  }
  walk(initial);
  return results.slice(0, maxResults);
}

function extractText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const o = node as Record<string, unknown>;
  if (typeof o.simpleText === "string") return o.simpleText;
  if (Array.isArray(o.runs)) {
    return (o.runs as { text?: string }[]).map((r) => r.text ?? "").join("");
  }
  return "";
}

function parseLength(s: string): number | undefined {
  const parts = s.split(":").map((p) => parseInt(p, 10));
  if (parts.some((p) => Number.isNaN(p))) return undefined;
  return parts.reduce((acc, n) => acc * 60 + n, 0);
}

/**
 * Transcript fetch using YouTube's timed-text endpoint.
 * Returns empty string on any failure — transcripts are best-effort.
 */
async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const listRes = await fetch(
      `https://video.google.com/timedtext?type=list&v=${videoId}`,
      { cache: "no-store" }
    );
    if (!listRes.ok) return "";
    const listXml = await listRes.text();
    const langMatch = listXml.match(/lang_code="([^"]+)"/);
    const lang = langMatch?.[1] ?? "en";
    const res = await fetch(
      `https://video.google.com/timedtext?lang=${lang}&v=${videoId}`,
      { cache: "no-store" }
    );
    if (!res.ok) return "";
    const xml = await res.text();
    const chunks = Array.from(xml.matchAll(/<text[^>]*>([^<]*)<\/text>/g)).map((m) =>
      decodeHtmlEntities(m[1])
    );
    return chunks.join(" ").replace(/\s+/g, " ").trim();
  } catch {
    return "";
  }
}

function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(+d));
}

export default defineTool<YoutubeSearchInput, YoutubeSearchOutput>({
  name: "youtube.search",
  description:
    "Search YouTube and optionally fetch transcripts. No API key required. Transcripts are best-effort — returns empty string when unavailable.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 10 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query, max_results = 5 }) {
    const videos = await scrapeSearch(query, max_results);
    const results: YoutubeVideoResult[] = await Promise.all(
      videos.map(async (v) => ({
        video_id: v.videoId,
        title: v.title,
        channel: v.channel,
        url: `https://www.youtube.com/watch?v=${v.videoId}`,
        duration_seconds: v.lengthSeconds,
        transcript: await fetchTranscript(v.videoId),
      }))
    );
    return { results };
  },
});
