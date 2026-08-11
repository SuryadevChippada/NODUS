import { z } from "zod";

export const suggestedBranchSchema = z.object({
  label: z.string().min(1),
  prompt: z.string().min(1),
  description: z.string().optional(),
  category: z.string().optional(),
});

export const providerResponseSchema = z.object({
  title: z.string().min(1),
  answer: z.string().min(1),
  suggestedBranches: z.array(suggestedBranchSchema).min(3).max(5),
  summary: z.string().optional(),
});

export type SuggestedBranch = z.infer<typeof suggestedBranchSchema>;
export type ProviderResponse = z.infer<typeof providerResponseSchema>;

export interface GenerateOptions {
  onToken: (chunk: string) => void;
  signal: AbortSignal;
  /** Delay between emitted chunks, in ms. Tests pass 0 for instant runs. */
  delayMs?: number;
  /**
   * Preferred Ollama model name. Ignored by generateMockResponse.
   * generateOllamaResponse falls back to the first installed model if this
   * is unset or names a model that isn't currently installed.
   */
  model?: string;
  /**
   * Free-text response-style directive, prepended to the Ollama transcript.
   * Ignored by generateMockResponse.
   */
  responseStyle?: string;
}

export interface Provider {
  generate(
    context: { nodeId: string; role: "prompt" | "response"; text: string }[],
    options: GenerateOptions,
  ): Promise<ProviderResponse>;
}
