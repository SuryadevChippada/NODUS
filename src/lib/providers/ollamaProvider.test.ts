import { describe, it, expect, vi, beforeEach } from "vitest";

const { mockFetch } = vi.hoisted(() => ({ mockFetch: vi.fn() }));
vi.mock("@tauri-apps/plugin-http", () => ({
  fetch: mockFetch,
}));

import { generateOllamaResponse } from "./ollamaProvider";

function makeStreamResponse(lines: string[]) {
  let i = 0;
  return {
    ok: true,
    status: 200,
    body: {
      getReader: () => ({
        read: async () => {
          if (i >= lines.length) return { done: true, value: undefined };
          const value = new TextEncoder().encode(lines[i]);
          i += 1;
          return { done: false, value };
        },
      }),
    },
  };
}

const context = [
  { nodeId: "n1", role: "prompt" as const, text: "What is 2+2?" },
];

beforeEach(() => {
  vi.clearAllMocks();
});

describe("generateOllamaResponse", () => {
  it("streams tokens via onToken and resolves with a valid ProviderResponse", async () => {
    // First call: /api/tags (model list). Second: streaming /api/generate.
    // Third: non-streaming /api/generate for suggested branches.
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "qwen2:7b" }] }),
      })
      .mockResolvedValueOnce(
        makeStreamResponse([
          '{"response":"2 ","done":false}\n',
          '{"response":"+ 2 ","done":false}\n',
          '{"response":"= 4.","done":false}\n',
          '{"done":true}\n',
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          response: JSON.stringify([
            { label: "Explain the math", prompt: "Explain why 2+2=4" },
            { label: "Try another sum", prompt: "What is 3+3?" },
            { label: "Go deeper", prompt: "Explain arithmetic basics" },
          ]),
        }),
      });

    const chunks: string[] = [];
    const controller = new AbortController();
    const result = await generateOllamaResponse(context, {
      onToken: (chunk) => chunks.push(chunk),
      signal: controller.signal,
    });

    expect(chunks.join("")).toBe("2 + 2 = 4.");
    expect(result.answer).toBe("2 + 2 = 4.");
    expect(result.suggestedBranches.length).toBeGreaterThanOrEqual(3);
  });

  it("falls back to local branches when the model's suggested-branches call returns malformed JSON, without losing the real answer", async () => {
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "qwen2:7b" }] }),
      })
      .mockResolvedValueOnce(
        makeStreamResponse([
          '{"response":"The answer is 4.","done":false}\n',
          '{"done":true}\n',
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ response: "not valid json for our schema" }),
      });

    const result = await generateOllamaResponse(context, {
      onToken: () => {},
      signal: new AbortController().signal,
    });

    expect(result.answer).toBe("The answer is 4.");
    expect(result.suggestedBranches.length).toBeGreaterThanOrEqual(3);
  });

  it("throws if Ollama has no models installed", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [] }),
    });
    await expect(
      generateOllamaResponse(context, {
        onToken: () => {},
        signal: new AbortController().signal,
      }),
    ).rejects.toThrow();
  });

  it("stops streaming when the signal is already aborted before the call starts", async () => {
    const controller = new AbortController();
    controller.abort();
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: "qwen2:7b" }] }),
    });
    await expect(
      generateOllamaResponse(context, {
        onToken: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });

  it("rejects rather than resolves when the signal is aborted during the suggested-branches call", async () => {
    const controller = new AbortController();
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ models: [{ name: "qwen2:7b" }] }),
      })
      .mockResolvedValueOnce(
        makeStreamResponse([
          '{"response":"The answer is 4.","done":false}\n',
          '{"done":true}\n',
        ]),
      )
      .mockImplementationOnce(async () => {
        // Simulate the user clicking Stop while this specific request is
        // in flight — the call itself still "succeeds" from fetch's point
        // of view, but the signal is aborted by the time it resolves.
        controller.abort();
        return {
          ok: true,
          json: async () => ({
            response: JSON.stringify([
              { label: "a", prompt: "a" },
              { label: "b", prompt: "b" },
              { label: "c", prompt: "c" },
            ]),
          }),
        };
      });

    await expect(
      generateOllamaResponse(context, {
        onToken: () => {},
        signal: controller.signal,
      }),
    ).rejects.toThrow();
  });
});
