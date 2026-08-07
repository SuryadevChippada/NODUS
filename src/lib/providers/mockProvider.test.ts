import { describe, it, expect } from "vitest";
import { generateMockResponse } from "./mockProvider";
import { providerResponseSchema } from "../../types/provider";

const context = [
  {
    nodeId: "n1",
    role: "prompt" as const,
    text: "What is the capital of France?",
  },
];

describe("generateMockResponse", () => {
  it("resolves to a response that passes the structured schema", async () => {
    const controller = new AbortController();
    const result = await generateMockResponse(context, {
      onToken: () => {},
      signal: controller.signal,
      delayMs: 0,
    });
    expect(providerResponseSchema.safeParse(result).success).toBe(true);
    expect(result.suggestedBranches.length).toBeGreaterThanOrEqual(3);
    expect(result.suggestedBranches.length).toBeLessThanOrEqual(5);
  });

  it("is deterministic for the same input", async () => {
    const controller = new AbortController();
    const options = {
      onToken: () => {},
      signal: controller.signal,
      delayMs: 0,
    };
    const first = await generateMockResponse(context, options);
    const second = await generateMockResponse(context, options);
    expect(first).toEqual(second);
  });

  it("streams the answer via onToken, reconstructing the full text", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    const result = await generateMockResponse(context, {
      onToken: (chunk) => chunks.push(chunk),
      signal: controller.signal,
      delayMs: 0,
    });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join("")).toBe(result.answer);
  });

  it("rejects with an AbortError and stops emitting once the signal is aborted", async () => {
    const controller = new AbortController();
    const chunks: string[] = [];
    const promise = generateMockResponse(context, {
      onToken: (chunk) => {
        chunks.push(chunk);
        if (chunks.length === 1) controller.abort();
      },
      signal: controller.signal,
      delayMs: 0,
    });
    await expect(promise).rejects.toThrow();
    const chunksAtRejection = chunks.length;
    // Give any stray pending emission a tick to (incorrectly) fire, to catch
    // a provider that keeps emitting after abort but only throws late.
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(chunks.length).toBe(chunksAtRejection);
  });

  it("rejects immediately if the signal is already aborted before the first call", async () => {
    const controller = new AbortController();
    controller.abort();
    const promise = generateMockResponse(context, {
      onToken: () => {
        throw new Error("onToken must not be called when already aborted");
      },
      signal: controller.signal,
      delayMs: 0,
    });
    await expect(promise).rejects.toThrow();
  });
});
