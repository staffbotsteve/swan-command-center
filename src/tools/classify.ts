import { defineTool } from "./registry";
import { classify } from "@/lib/classifier";
import type { ClassifyInput, ClassifyOutput } from "@/types/tools";

export default defineTool<ClassifyInput, ClassifyOutput>({
  name: "classify",
  description:
    "Classify a short text fragment as fact, preference, context, pinned, or noise. Used by the memory pipeline.",
  source: "builtin",
  initial_status: "standard",
  input_schema: {
    type: "object",
    properties: {
      text: { type: "string", description: "The message or fragment to classify." },
      context: {
        type: "string",
        description: "Optional surrounding context — prior messages, task metadata, etc.",
      },
    },
    required: ["text"],
    additionalProperties: false,
  },
  async handler(input) {
    return classify(input);
  },
});
