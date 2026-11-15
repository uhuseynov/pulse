import { z } from 'zod';

export const openConversationSchema = z.object({
  userId: z.uuid(),
});

export type OpenConversationInput = z.infer<typeof openConversationSchema>;
