import { z } from "zod";

const schema = z.object({
  AUTH_SECRET: z.string().min(32),
  AUTH_URL: z.url({ protocol: /^https?$/ }),
  APP_URL: z.url({ protocol: /^https?$/ }),
  ENABLE_LOCAL_AUTH: z.enum(["true", "false"]).optional().default("false"),
  AUTH_GOOGLE_ID: z.string().min(1).optional(),
  AUTH_GOOGLE_SECRET: z.string().min(1).optional(),
}).superRefine((env, ctx) => {
  if (!!env.AUTH_GOOGLE_ID !== !!env.AUTH_GOOGLE_SECRET) {
    ctx.addIssue({ code: "custom", message: "Set both Google OAuth variables.", path: ["AUTH_GOOGLE_ID"] });
  }
  if (!env.AUTH_GOOGLE_ID && !(env.ENABLE_LOCAL_AUTH === "true" && process.env.NODE_ENV !== "production")) {
    ctx.addIssue({ code: "custom", message: "Configure Google OAuth or enable local authentication in development.", path: ["AUTH_GOOGLE_ID"] });
  }
  if (process.env.NODE_ENV === "production" && !env.APP_URL.startsWith("https://")) {
    ctx.addIssue({ code: "custom", message: "Use HTTPS for the public application URL.", path: ["APP_URL"] });
  }
  if (new URL(env.AUTH_URL).origin !== new URL(env.APP_URL).origin) {
    ctx.addIssue({ code: "custom", message: "AUTH_URL and APP_URL must use the same origin.", path: ["AUTH_URL"] });
  }
});

export function webEnv() {
  return schema.parse(Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== "")));
}
