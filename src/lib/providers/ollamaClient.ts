import { fetch } from "@tauri-apps/plugin-http";
import { z } from "zod";

const OLLAMA_BASE_URL = "http://127.0.0.1:11434";

export function parseNdjsonChunk(
  buffer: string,
  newText: string,
): { completeLines: unknown[]; remainingBuffer: string } {
  const combined = buffer + newText;
  const lines = combined.split("\n");
  const remainingBuffer = lines.pop() ?? "";
  const completeLines = lines
    .filter((line) => line.trim().length > 0)
    .map((line) => JSON.parse(line) as unknown);
  return { completeLines, remainingBuffer };
}

export async function checkOllamaHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    return res.ok;
  } catch {
    return false;
  }
}

const tagsResponseSchema = z.object({
  models: z.array(z.object({ name: z.string() })),
});

export async function listOllamaModels(
  signal?: AbortSignal,
): Promise<string[]> {
  const res = await fetch(`${OLLAMA_BASE_URL}/api/tags`, { signal });
  if (!res.ok) {
    throw new Error(`Ollama /api/tags responded with ${res.status}`);
  }
  const json = await res.json();
  const parsed = tagsResponseSchema.safeParse(json);
  if (!parsed.success) return [];
  return parsed.data.models.map((model) => model.name);
}

export { OLLAMA_BASE_URL };
