import { z } from "zod";
import { suggestedBranchSchema } from "./provider";

export const nodeDataSchema = z.object({
  text: z.string().min(1),
  suggestedBranches: z.array(suggestedBranchSchema).optional(),
});

export const graphNodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["prompt", "response"]),
  position: z.object({ x: z.number(), y: z.number() }),
  data: nodeDataSchema,
});

export const graphEdgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
});

export type GraphNodeData = z.infer<typeof nodeDataSchema>;
export type GraphNode = z.infer<typeof graphNodeSchema>;
export type GraphEdge = z.infer<typeof graphEdgeSchema>;
