import { PrismaAdapter } from "@auth/prisma-adapter";
import { db, rateLimit } from "@nomeet/db";
import { credentialsSchema } from "@nomeet/domain";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { webEnv } from "./lib/env";
import { matchesPassword } from "./lib/password";

declare module "next-auth" {
  interface Session { user: import("next-auth").DefaultSession["user"] & { id: string } }
}

export function localAuthAvailable() {
  return process.env.NODE_ENV !== "production" && process.env.ENABLE_LOCAL_AUTH === "true";
}

export const { auth, signIn, signOut, handlers } = NextAuth(() => {
  const env = webEnv();
  return {
    adapter: PrismaAdapter(db),
    trustHost: true,
    secret: env.AUTH_SECRET,
    session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
    pages: { signIn: "/signin" },
    providers: [
      ...(env.AUTH_GOOGLE_ID ? [Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET })] : []),
      ...(localAuthAvailable() ? [Credentials({
        credentials: { email: {}, password: {} },
        async authorize(input) {
          const parsed = credentialsSchema.safeParse(input);
          if (!parsed.success || !await rateLimit("local-auth:global", 200, 10) || !await rateLimit(`signin:${parsed.data.email}`, 10, 15)) return null;
          const user = await db.user.findUnique({ where: { email: parsed.data.email } });
          const valid = await matchesPassword(parsed.data.password, user?.passwordHash);
          return user && valid ? { id: user.id, name: user.name, email: user.email } : null;
        },
      })] : []),
    ],
    callbacks: {
      signIn: ({ account, profile }) => account?.provider !== "google" || profile?.email_verified === true,
      session: ({ session, token }) => {
        if (token.sub) session.user.id = token.sub;
        return session;
      },
    },
  };
});
