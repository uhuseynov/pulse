import { z } from 'zod';

export const createMessageSchema = z.object({
  content: z.string().trim().min(1).max(4000),
});

export const updateMessageSchema = createMessageSchema;

export const listMessagesSchema = z.object({
  /** Return messages older than this message id. */
  before: z.uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type CreateMessageInput = z.infer<typeof createMessageSchema>;
export type UpdateMessageInput = z.infer<typeof updateMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesSchema>;
