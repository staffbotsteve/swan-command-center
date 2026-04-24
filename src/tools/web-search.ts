import { defineTool } from "./registry";
import type { WebSearchInput, WebSearchOutput } from "@/types/tools";

interface BraveResult {
  title: string;
  url: string;
  description: string;
}

export default defineTool<WebSearchInput, WebSearchOutput>({
  name: "web.search",
  description:
    "Brave web search. Returns up to 10 results with title, URL, and snippet.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      query: { type: "string" },
      max_results: { type: "integer", minimum: 1, maximum: 20 },
    },
    required: ["query"],
    additionalProperties: false,
  },
  async handler({ query, max_results = 10 }) {
    const key = process.env.BRAVE_SEARCH_API_KEY;
    if (!key) throw new Error("BRAVE_SEARCH_API_KEY not set");

    const url = new URL("https://api.search.brave.com/res/v1/web/search");
    url.searchParams.set("q", query);
    url.searchParams.set("count", String(max_results));

    const res = await fetch(url, {
      headers: {
        "X-Subscription-Token": key,
        Accept: "application/json",
        "Accept-Encoding": "gzip",
      },
    });
    if (!res.ok) {
      throw new Error(`brave: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    const items: BraveResult[] = data.web?.results ?? [];

    return {
      results: items.slice(0, max_results).map((r) => ({
        title: r.title,
        url: r.url,
        snippet: r.description,
      })),
    };
  },
});
