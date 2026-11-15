import { z } from 'zod';

export const createServerSchema = z.object({
  name: z.string().trim().min(2).max(50),
});

export const joinServerSchema = z.object({
  inviteCode: z.string().trim().min(1).max(64),
});

/** Ownership cannot be handed over, so only these two roles can be set. */
export const updateMemberSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER']),
});

export type CreateServerInput = z.infer<typeof createServerSchema>;
export type JoinServerInput = z.infer<typeof joinServerSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
