import type { SuggestedBranch } from "../../types/provider";

// The exact four example follow-ups from the product spec's suggested-branch
// section — used both as the mock provider's real deterministic output and
// as the local fallback when a (future, real) provider's branch metadata
// fails validation.
export const FALLBACK_BRANCHES: SuggestedBranch[] = [
  {
    label: "Explain this more deeply",
    prompt: "Can you explain that in more depth?",
    category: "depth",
  },
  {
    label: "Show a practical example",
    prompt: "Can you show a practical example of that?",
    category: "example",
  },
  {
    label: "Build an action plan",
    prompt: "Can you turn that into a concrete action plan?",
    category: "action",
  },
  {
    label: "Compare alternatives",
    prompt: "What are some alternatives to that, and how do they compare?",
    category: "comparison",
  },
];
