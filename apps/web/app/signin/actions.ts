"use server";

import { AuthError } from "next-auth";
import { db, rateLimit } from "@nomeet/db";
import { registrationSchema } from "@nomeet/domain";
import { localAuthAvailable, signIn } from "../../auth";
import { passwordHash } from "../../lib/password";

export async function authenticate(_: string, form: FormData) {
  const value = String(form.get("next") ?? "");
  const redirectTo = /^\/(workspaces|w\/[\w-]+(?:\/[\w-]+)?|invite\/[\w-]{43})$/.test(value) ? value : "/workspaces";
  const action = form.get("action");
  try {
    if (action === "google") await signIn("google", { redirectTo });
    if (!localAuthAvailable()) return "Choose a configured sign-in provider.";
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (action === "register") {
      const parsed = registrationSchema.safeParse({ email, password, name: form.get("name") });
      if (!parsed.success) return "Enter your name, a valid email, and a password of 12–128 characters.";
      if (!await rateLimit("register:global", 35, 60) || !await rateLimit(`register:${email}`, 4, 60)) return "Too many attempts. Try again later.";
      await db.user.createMany({ data: [{ name: parsed.data.name, email, passwordHash: await passwordHash(password) }], skipDuplicates: true });
    }
    await signIn("credentials", { email, password, redirectTo });
    return "";
  } catch (error) {
    if (error instanceof AuthError) return "Could not sign in. Check your email and password or try another provider.";
    throw error;
  }
}
