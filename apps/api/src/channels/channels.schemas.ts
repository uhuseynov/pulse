import { z } from 'zod';

export const createChannelSchema = z.object({
  name: z
    .string()
    .trim()
    .toLowerCase()
    .min(1)
    .max(32)
    .transform((value) => value.replace(/\s+/g, '-'))
    .refine((value) => /^[a-z0-9_-]+$/.test(value), {
      message: 'Channel names may only contain letters, numbers, - and _',
    }),
});

export type CreateChannelInput = z.infer<typeof createChannelSchema>;
