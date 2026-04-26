import { defineTool } from "./registry";

export interface DocParseInput {
  url: string;
  max_chars?: number;
}

export interface DocParseOutput {
  format: "pdf" | "docx" | "txt" | "html" | "unknown";
  text: string;
  truncated: boolean;
}

const DEFAULT_MAX = 50_000;

export default defineTool<DocParseInput, DocParseOutput>({
  name: "doc.parse",
  description:
    "Fetch a document by URL and extract its text. Supports PDF and DOCX. Plain text and HTML pass through. Truncates to max_chars (default 50k).",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      url: { type: "string", description: "Public URL or signed link to the document." },
      max_chars: {
        type: "integer",
        minimum: 1000,
        maximum: 500_000,
        description: "Hard cap on returned text length. Default 50000.",
      },
    },
    required: ["url"],
    additionalProperties: false,
  },
  async handler({ url, max_chars }) {
    const cap = max_chars ?? DEFAULT_MAX;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`fetch ${url}: ${res.status}`);

    const ct = (res.headers.get("content-type") ?? "").toLowerCase();
    const buf = Buffer.from(await res.arrayBuffer());

    let format: DocParseOutput["format"] = "unknown";
    let text = "";

    if (ct.includes("pdf") || url.toLowerCase().endsWith(".pdf")) {
      format = "pdf";
      const { PDFParse } = await import("pdf-parse");
      const parser = new PDFParse({ data: new Uint8Array(buf) });
      try {
        const result = await parser.getText();
        text = result.text ?? "";
      } finally {
        await parser.destroy().catch(() => {});
      }
    } else if (
      ct.includes("officedocument.wordprocessingml.document") ||
      url.toLowerCase().endsWith(".docx")
    ) {
      format = "docx";
      const { default: mammoth } = await import("mammoth");
      const result = await mammoth.extractRawText({ buffer: buf });
      text = result.value;
    } else if (ct.includes("text/html") || url.toLowerCase().endsWith(".html")) {
      format = "html";
      // Naive HTML strip — agents needing structure should use web.search instead.
      text = buf.toString("utf-8").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    } else if (ct.startsWith("text/")) {
      format = "txt";
      text = buf.toString("utf-8");
    } else {
      throw new Error(`unsupported content-type: ${ct} (${url})`);
    }

    const truncated = text.length > cap;
    return {
      format,
      text: truncated ? text.slice(0, cap) : text,
      truncated,
    };
  },
});
