import { describe, it, expect } from "vitest";
import { parseProviderResponse } from "./parseProviderResponse";

describe("parseProviderResponse", () => {
  it("passes a fully valid response through unchanged", () => {
    const valid = {
      title: "Capitals",
      answer: "Paris is the capital of France.",
      suggestedBranches: [
        { label: "A", prompt: "a" },
        { label: "B", prompt: "b" },
        { label: "C", prompt: "c" },
      ],
    };
    const { response, usedFallback } = parseProviderResponse(valid);
    expect(response).toEqual(valid);
    expect(usedFallback).toBe(false);
  });

  it("keeps a real answer and repairs only the branches when they're malformed", () => {
    const malformedBranches = {
      title: "Capitals",
      answer: "Paris is the capital of France.",
      suggestedBranches: [{ label: "only one, needs at least three" }],
    };
    const { response, usedFallback } = parseProviderResponse(malformedBranches);
    expect(response.answer).toBe("Paris is the capital of France.");
    expect(response.title).toBe("Capitals");
    expect(response.suggestedBranches.length).toBeGreaterThanOrEqual(3);
    expect(usedFallback).toBe(true);
  });

  it("derives a title from the answer when the answer is valid but the title is missing", () => {
    const noTitle = {
      answer: "Paris is the capital of France, and has been for centuries.",
      suggestedBranches: "not an array",
    };
    const { response, usedFallback } = parseProviderResponse(noTitle);
    expect(response.answer).toBe(noTitle.answer);
    expect(response.title.length).toBeGreaterThan(0);
    expect(usedFallback).toBe(true);
  });

  it("never discards a valid answer because of malformed metadata", () => {
    const weird = {
      answer: "A perfectly good answer.",
      suggestedBranches: null,
      title: 42,
    };
    const { response } = parseProviderResponse(weird);
    expect(response.answer).toBe("A perfectly good answer.");
  });

  it("falls back completely for totally unusable input, without throwing", () => {
    for (const garbage of [null, undefined, "just a string", 123, [], {}]) {
      expect(() => parseProviderResponse(garbage)).not.toThrow();
      const { response, usedFallback } = parseProviderResponse(garbage);
      expect(response.answer.length).toBeGreaterThan(0);
      expect(response.suggestedBranches.length).toBeGreaterThanOrEqual(3);
      expect(usedFallback).toBe(true);
    }
  });

  it("treats an empty-string answer as unusable, not a valid repair candidate", () => {
    const { usedFallback, response } = parseProviderResponse({ answer: "   " });
    expect(usedFallback).toBe(true);
    expect(response.answer.length).toBeGreaterThan(0);
  });
});
