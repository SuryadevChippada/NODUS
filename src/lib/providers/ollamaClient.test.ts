import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@tauri-apps/plugin-http");

import { fetch as tauriFetch } from "@tauri-apps/plugin-http";
import {
  parseNdjsonChunk,
  checkOllamaHealth,
  listOllamaModels,
} from "./ollamaClient";

const mockFetch = vi.mocked(tauriFetch);

describe("parseNdjsonChunk", () => {
  it("parses a single complete line ending in a newline", () => {
    const { completeLines, remainingBuffer } = parseNdjsonChunk(
      "",
      '{"response":"hi","done":false}\n',
    );
    expect(completeLines).toEqual([{ response: "hi", done: false }]);
    expect(remainingBuffer).toBe("");
  });

  it("buffers an incomplete line across two chunks", () => {
    const first = parseNdjsonChunk("", '{"response":"hi",');
    expect(first.completeLines).toEqual([]);
    expect(first.remainingBuffer).toBe('{"response":"hi",');

    const second = parseNdjsonChunk(first.remainingBuffer, '"done":false}\n');
    expect(second.completeLines).toEqual([{ response: "hi", done: false }]);
    expect(second.remainingBuffer).toBe("");
  });

  it("parses multiple complete lines arriving in one chunk", () => {
    const { completeLines, remainingBuffer } = parseNdjsonChunk(
      "",
      '{"response":"a","done":false}\n{"response":"b","done":false}\n',
    );
    expect(completeLines).toEqual([
      { response: "a", done: false },
      { response: "b", done: false },
    ]);
    expect(remainingBuffer).toBe("");
  });

  it("ignores blank lines", () => {
    const { completeLines } = parseNdjsonChunk(
      "",
      '{"response":"a","done":false}\n\n{"response":"b","done":false}\n',
    );
    expect(completeLines).toHaveLength(2);
  });
});

describe("checkOllamaHealth", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns true when the request succeeds", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
    } as unknown as Response);
    expect(await checkOllamaHealth()).toBe(true);
  });

  it("returns false when the request fails (e.g. Ollama not running)", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));
    expect(await checkOllamaHealth()).toBe(false);
  });

  it("returns false on a non-ok HTTP status", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);
    expect(await checkOllamaHealth()).toBe(false);
  });
});

describe("listOllamaModels", () => {
  beforeEach(() => vi.clearAllMocks());

  it("returns model names from a real-shaped /api/tags response", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        models: [{ name: "llama3.1:latest" }, { name: "qwen2:7b" }],
      }),
    } as unknown as Response);
    expect(await listOllamaModels()).toEqual(["llama3.1:latest", "qwen2:7b"]);
  });

  it("returns an empty array when the response doesn't match the expected shape", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ unexpected: "shape" }),
    } as unknown as Response);
    expect(await listOllamaModels()).toEqual([]);
  });

  it("throws when the HTTP request itself fails", async () => {
    mockFetch.mockResolvedValue({
      ok: false,
      status: 500,
    } as unknown as Response);
    await expect(listOllamaModels()).rejects.toThrow();
  });

  it("passes the signal through to fetch and propagates an abort rejection", async () => {
    const controller = new AbortController();
    controller.abort();
    // Real @tauri-apps/plugin-http fetch rejects immediately when called
    // with an already-aborted signal; simulate that here to confirm
    // listOllamaModels threads the signal through rather than dropping it.
    mockFetch.mockImplementation((_input, init) => {
      if ((init as RequestInit | undefined)?.signal?.aborted) {
        return Promise.reject(new Error("Request cancelled"));
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: async () => ({ models: [] }),
      } as unknown as Response);
    });
    await expect(listOllamaModels(controller.signal)).rejects.toThrow(
      "Request cancelled",
    );
  });
});
