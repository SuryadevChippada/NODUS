import { z } from "zod";

export const memorySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  identityId: z.string().nullable(),
  content: z.string().min(1),
});

export type Memory = z.infer<typeof memorySchema>;
