import { z } from 'zod';

export const registerSchema = z.object({
  email: z
    .email()
    .max(254)
    .transform((value) => value.toLowerCase()),
  username: z
    .string()
    .trim()
    .min(3)
    .max(24)
    .regex(
      /^[a-zA-Z0-9_]+$/,
      'Username may only contain letters, numbers and underscores',
    )
    .transform((value) => value.toLowerCase()),
  displayName: z.string().trim().min(1).max(40).optional(),
  password: z.string().min(8).max(128),
});

export const loginSchema = z.object({
  email: z.email().transform((value) => value.toLowerCase()),
  password: z.string().min(1).max(128),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
