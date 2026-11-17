import { z } from "zod";

const config = z.object({
  REDIS_URL: z.url({ protocol: /^rediss?$/ }),
  APP_URL: z.url({ protocol: /^https?$/ }),
  SMTP_URL: z.url({ protocol: /^smtps?$/ }).optional(),
  MAIL_FROM: z.string().min(1).optional(),
  GEMINI_API_KEY: z.string().min(1).optional(),
  GEMINI_MODEL: z.string().regex(/^[a-zA-Z0-9_.-]+$/).optional(),
  GEMINI_INPUT_USD_PER_MILLION: z.coerce.number().nonnegative().optional(),
  GEMINI_OUTPUT_USD_PER_MILLION: z.coerce.number().nonnegative().optional(),
  JOB_QUEUE: z.string().regex(/^[\w-]+$/).default("nomeet"),
}).refine(env => !env.SMTP_URL || env.MAIL_FROM, { message: "Set MAIL_FROM when SMTP_URL is configured." })
  .refine(env => !env.GEMINI_API_KEY || env.GEMINI_MODEL, { message: "Set GEMINI_MODEL when GEMINI_API_KEY is configured." });

export type WorkerConfig = z.infer<typeof config>;
export function workerConfig() {
  return config.parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));
}
