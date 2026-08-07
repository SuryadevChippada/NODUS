import {
  providerResponseSchema,
  type ProviderResponse,
} from "../../types/provider";
import { FALLBACK_BRANCHES } from "./fallbackBranches";

function extractUsableAnswer(raw: unknown): string | null {
  if (typeof raw !== "object" || raw === null || !("answer" in raw))
    return null;
  const candidate = (raw as { answer: unknown }).answer;
  if (typeof candidate !== "string") return null;
  const trimmed = candidate.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function extractTitle(raw: unknown, fallbackFromAnswer: string): string {
  if (typeof raw === "object" && raw !== null && "title" in raw) {
    const candidate = (raw as { title: unknown }).title;
    if (typeof candidate === "string" && candidate.trim().length > 0) {
      return candidate;
    }
  }
  return fallbackFromAnswer.slice(0, 60);
}

const UNREADABLE_ANSWER = "The model's response could not be read.";

export function parseProviderResponse(raw: unknown): {
  response: ProviderResponse;
  usedFallback: boolean;
} {
  const parsed = providerResponseSchema.safeParse(raw);
  if (parsed.success) {
    return { response: parsed.data, usedFallback: false };
  }

  const answer = extractUsableAnswer(raw);
  if (answer !== null) {
    return {
      response: {
        title: extractTitle(raw, answer),
        answer,
        suggestedBranches: FALLBACK_BRANCHES,
      },
      usedFallback: true,
    };
  }

  return {
    response: {
      title: "Untitled",
      answer: UNREADABLE_ANSWER,
      suggestedBranches: FALLBACK_BRANCHES,
    },
    usedFallback: true,
  };
}
