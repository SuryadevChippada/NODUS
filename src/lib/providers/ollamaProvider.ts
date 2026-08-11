import { fetch } from "@tauri-apps/plugin-http";
import { z } from "zod";
import type { GenerateOptions, ProviderResponse } from "../../types/provider";
import { parseProviderResponse } from "./parseProviderResponse";
import {
  parseNdjsonChunk,
  listOllamaModels,
  OLLAMA_BASE_URL,
} from "./ollamaClient";

const streamLineSchema = z.object({
  response: z.string().optional(),
  done: z.boolean(),
});

function buildTranscript(
  context: { role: "prompt" | "response"; text: string }[],
  responseStyle?: string,
): string {
  const styleLine = responseStyle
    ? `Respond in this style: ${responseStyle}\n\n`
    : "";
  return (
    styleLine +
    context.map((message) => `${message.role}: ${message.text}`).join("\n\n")
  );
}

const BRANCHES_PROMPT_TEMPLATE = (answer: string) =>
  `Based on this answer, suggest 3 to 5 short, distinct follow-up questions a user might ask next.

Answer: ${answer}

Respond with ONLY a JSON array, no other text, in this exact shape:
[{"label": "short button label", "prompt": "the full follow-up question"}]`;

// ponytail: the real @tauri-apps/plugin-http fetch already checks
// signal.aborted before doing any work and wires signal's "abort" event to
// cancel the in-flight Rust-side request (verified by reading its source),
// so passing `signal` through to each fetch() call below is enough for
// production. This explicit check exists only because unit tests mock
// fetch() directly and don't reproduce that abort-checking behavior.
function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Generation cancelled", "AbortError");
  }
}

export async function generateOllamaResponse(
  context: { nodeId: string; role: "prompt" | "response"; text: string }[],
  options: GenerateOptions,
): Promise<ProviderResponse> {
  const { onToken, signal } = options;
  assertNotAborted(signal);

  const models = await listOllamaModels(signal);
  if (models.length === 0) {
    throw new Error("Ollama has no models installed");
  }
  const model =
    options.model && models.includes(options.model) ? options.model : models[0];

  const lastMessage = context[context.length - 1];
  const promptText = lastMessage?.text ?? "";
  const transcript = buildTranscript(context, options.responseStyle);

  const genRes = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ model, prompt: transcript, stream: true }),
    signal,
  });
  if (!genRes.ok || !genRes.body) {
    throw new Error(`Ollama generate failed with status ${genRes.status}`);
  }

  const reader = genRes.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let answer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    const { completeLines, remainingBuffer } = parseNdjsonChunk(buffer, text);
    buffer = remainingBuffer;
    for (const rawLine of completeLines) {
      const parsed = streamLineSchema.safeParse(rawLine);
      if (!parsed.success || !parsed.data.response) continue;
      answer += parsed.data.response;
      onToken(parsed.data.response);
    }
  }

  let suggestedBranchesRaw: unknown = [];
  try {
    const branchesRes = await fetch(`${OLLAMA_BASE_URL}/api/generate`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model,
        prompt: BRANCHES_PROMPT_TEMPLATE(answer),
        stream: false,
        format: "json",
      }),
      signal,
    });
    if (branchesRes.ok) {
      const branchesJson = await branchesRes.json();
      suggestedBranchesRaw = JSON.parse(branchesJson.response);
    }
  } catch (error) {
    console.error("Failed to fetch suggested branches from Ollama", error);
  }
  // The catch above swallows AbortError along with every other failure so a
  // cancelled branches call can't crash the response we already streamed —
  // but that means a Stop click mid-call would otherwise resolve silently as
  // a completed generation. Re-check here so cancellation still surfaces.
  assertNotAborted(signal);

  const { response } = parseProviderResponse({
    title: promptText.length > 0 ? promptText.slice(0, 60) : "Untitled",
    answer,
    suggestedBranches: suggestedBranchesRaw,
  });
  return response;
}
