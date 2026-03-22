import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { cache } from "react";
import { getDb } from "@/db";
import * as schema from "@/db/schema";

export const getAuth = cache(() =>
  betterAuth({
    database: drizzleAdapter(getDb(), {
      provider: "sqlite",
      schema,
      usePlural: true,
    }),
    socialProviders: {
      google: {
        clientId: process.env.GOOGLE_CLIENT_ID as string,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET as string,
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
  }),
);

/**
 * @deprecated Use getAuth() instead for Cloudflare Workers compatibility
 */
export const auth = new Proxy({} as ReturnType<typeof getAuth>, {
  get(_, prop) {
    return (getAuth() as Record<string, unknown>)[prop as string];
  },
});

export type Session = typeof auth.$Infer.Session;
