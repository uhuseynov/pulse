import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'test', 'production'])
    .default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),
  /** Sign-in and sign-up attempts allowed per minute for one IP address. */
  AUTH_RATE_LIMIT: z.coerce.number().int().positive().default(10),
  // Voice rooms are optional: without these three the rest of the app still
  // runs and the voice endpoints report that the feature is turned off.
  LIVEKIT_URL: z.string().optional(),
  LIVEKIT_API_KEY: z.string().optional(),
  LIVEKIT_API_SECRET: z.string().optional(),
  /** One origin, or several separated by commas. */
  WEB_ORIGIN: z
    .string()
    .default('http://localhost:3000')
    .transform((value) =>
      value
        .split(',')
        .map((origin) => origin.trim().replace(/\/+$/, ''))
        .filter(Boolean),
    )
    .pipe(z.array(z.url()).min(1)),
});

const schema = envSchema.superRefine((env, ctx) => {
  const livekit = [
    env.LIVEKIT_URL,
    env.LIVEKIT_API_KEY,
    env.LIVEKIT_API_SECRET,
  ];
  if (livekit.some(Boolean) && !livekit.every(Boolean)) {
    ctx.addIssue({
      code: 'custom',
      path: ['LIVEKIT_URL'],
      message:
        'LIVEKIT_URL, LIVEKIT_API_KEY and LIVEKIT_API_SECRET must be set together',
    });
  }
  if (env.LIVEKIT_URL && !/^wss?:\/\//.test(env.LIVEKIT_URL)) {
    ctx.addIssue({
      code: 'custom',
      path: ['LIVEKIT_URL'],
      message: 'LIVEKIT_URL must start with wss:// or ws://',
    });
  }
});

export type Env = z.infer<typeof envSchema>;

/**
 * Read at request time by the throttler, which runs outside dependency
 * injection. ConfigModule has validated the variable by then.
 */
export function authRateLimit(): number {
  return Number(process.env.AUTH_RATE_LIMIT) || 10;
}

export function validateEnv(raw: Record<string, unknown>): Env {
  const result = schema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `  ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }
  return result.data;
}
