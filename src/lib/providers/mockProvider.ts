import type { GenerateOptions, ProviderResponse } from "../../types/provider";
import { FALLBACK_BRANCHES } from "./fallbackBranches";

const DEFAULT_DELAY_MS = 15;

function assertNotAborted(signal: AbortSignal): void {
  if (signal.aborted) {
    throw new DOMException("Generation cancelled", "AbortError");
  }
}

export async function generateMockResponse(
  context: { nodeId: string; role: "prompt" | "response"; text: string }[],
  options: GenerateOptions,
): Promise<ProviderResponse> {
  const { onToken, signal, delayMs = DEFAULT_DELAY_MS } = options;
  assertNotAborted(signal);

  const lastMessage = context[context.length - 1];
  const promptText = lastMessage?.text ?? "";
  const answer = `Mock response to: "${promptText}"\n\nThis is placeholder text from the deterministic mock provider — a real model replaces this in a later phase.`;
  const words = answer.split(" ");

  let streamed = "";
  for (const word of words) {
    assertNotAborted(signal);
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    assertNotAborted(signal);
    const chunk = streamed.length === 0 ? word : ` ${word}`;
    streamed += chunk;
    onToken(chunk);
  }

  return {
    title: promptText.length > 0 ? promptText.slice(0, 60) : "Untitled",
    answer,
    suggestedBranches: FALLBACK_BRANCHES,
  };
}
