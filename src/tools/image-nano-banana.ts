import { defineTool } from "./registry";

export interface ImageNanoBananaInput {
  prompt: string;
  reference_images?: string[]; // optional base64 inputs for editing/iteration
}
export interface ImageNanoBananaOutput {
  images: { mime_type: string; base64: string }[];
  text?: string;
  cost_usd_estimate: number;
}

// Gemini 2.5 Flash Image (Nano Banana 2) pricing as of 2026-04: ~$0.04 per
// image but much faster than Imagen 3. Verify at https://ai.google.dev/pricing.
const PRICE_PER_IMAGE_USD = 0.04;

export default defineTool<ImageNanoBananaInput, ImageNanoBananaOutput>({
  name: "image.generate_nano_banana",
  description:
    "Generate or iterate on images via Gemini 2.5 Flash Image (Nano Banana). Fast and cheap. Use for thumbnail variants, brainstorming, drafts, or editing existing images. Accepts optional reference_images (base64) to iterate on.",
  source: "builtin",
  initial_status: "standard",
  daily_spend_cap_usd: 5.0,
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      reference_images: {
        type: "array",
        items: { type: "string" },
        description: "Optional base64-encoded images to use as references.",
      },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async handler({ prompt, reference_images = [] }) {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
    const model = "gemini-2.5-flash-image-preview";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${key}`;

    type Part =
      | { text: string }
      | { inline_data: { mime_type: string; data: string } };
    const parts: Part[] = [{ text: prompt }];
    for (const ref of reference_images) {
      parts.push({ inline_data: { mime_type: "image/png", data: ref } });
    }

    const body = {
      contents: [{ role: "user", parts }],
      generationConfig: {
        responseModalities: ["IMAGE", "TEXT"],
      },
    };

    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`nano-banana: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    type ResponsePart = {
      text?: string;
      inlineData?: { mimeType: string; data: string };
    };
    const responseParts: ResponsePart[] =
      data.candidates?.[0]?.content?.parts ?? [];
    const images = responseParts
      .filter((p) => p.inlineData)
      .map((p) => ({
        mime_type: p.inlineData!.mimeType,
        base64: p.inlineData!.data,
      }));
    const text = responseParts
      .filter((p) => p.text)
      .map((p) => p.text)
      .join("");
    return {
      images,
      text: text || undefined,
      cost_usd_estimate: PRICE_PER_IMAGE_USD * images.length,
    };
  },
});
