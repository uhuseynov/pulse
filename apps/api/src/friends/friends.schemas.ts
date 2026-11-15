import { z } from 'zod';

export const friendRequestSchema = z.object({
  username: z
    .string()
    .trim()
    .min(1)
    .max(24)
    .transform((value) => value.replace(/^@/, '').toLowerCase()),
});

export type FriendRequestInput = z.infer<typeof friendRequestSchema>;
