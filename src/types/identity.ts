import { z } from "zod";

export const identitySchema = z.object({
  id: z.string().min(1),
  workspaceId: z.string().min(1),
  name: z.string().min(1),
  symbol: z.string().min(1).max(4),
  preferredModel: z.string().nullable(),
  responseStyle: z.string().nullable(),
});

export type Identity = z.infer<typeof identitySchema>;

export const DEFAULT_IDENTITY_NAME = "Default";
export const DEFAULT_IDENTITY_SYMBOL = "❯";
