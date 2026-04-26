import { defineTool } from "./registry";
import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ImageImagenInput {
  prompt: string;
  aspect_ratio?: "1:1" | "16:9" | "9:16" | "3:4" | "4:3";
  number_of_images?: number;
}
export interface ImageImagenOutput {
  images: { mime_type: string; base64: string }[];
  cost_usd_estimate: number;
}

// Imagen 3 pricing as of 2026-04: ~$0.04 per generated image (verify at
// https://ai.google.dev/pricing). Per-image cost is the unit Steven cares
// about for the cost-transparency reporting.
const PRICE_PER_IMAGE_USD = 0.04;

export default defineTool<ImageImagenInput, ImageImagenOutput>({
  name: "image.generate_imagen",
  description:
    "Generate high-quality images via Imagen 3. Use for hero images, finished thumbnails, anything shipping to an audience. ~$0.04/image. For fast iteration use image.generate_nano_banana instead.",
  source: "builtin",
  initial_status: "standard",
  daily_spend_cap_usd: 5.0,
  input_schema: {
    type: "object",
    properties: {
      prompt: { type: "string" },
      aspect_ratio: { type: "string", enum: ["1:1", "16:9", "9:16", "3:4", "4:3"] },
      number_of_images: { type: "integer", minimum: 1, maximum: 4 },
    },
    required: ["prompt"],
    additionalProperties: false,
  },
  async handler({ prompt, aspect_ratio = "16:9", number_of_images = 1 }) {
    const key = process.env.GOOGLE_AI_API_KEY;
    if (!key) throw new Error("GOOGLE_AI_API_KEY not set");
    const genai = new GoogleGenerativeAI(key);
    // Imagen is exposed via a different endpoint than Gemini text models.
    // Fallback to direct REST call against the predict endpoint.
    const model = "imagen-3.0-generate-002";
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${key}`;
    const body = {
      instances: [{ prompt }],
      parameters: { sampleCount: number_of_images, aspectRatio: aspect_ratio },
    };
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      throw new Error(`imagen: ${res.status} ${await res.text()}`);
    }
    const data = await res.json();
    type Pred = { bytesBase64Encoded: string; mimeType: string };
    const images = (data.predictions ?? []).map((p: Pred) => ({
      mime_type: p.mimeType ?? "image/png",
      base64: p.bytesBase64Encoded,
    }));
    return {
      images,
      cost_usd_estimate: PRICE_PER_IMAGE_USD * images.length,
    };
  },
});
