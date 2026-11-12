import { z } from 'zod';

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(50),
});

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type JoinServerInput = z.infer<typeof joinServerSchema>;
