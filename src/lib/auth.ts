import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { genericOAuth } from "better-auth/plugins";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { isPreview } from "@/lib/env";

const withHttps = (host: string | undefined) =>
  host ? `https://${host}` : undefined;

const previewBranchUrl = withHttps(process.env.VERCEL_BRANCH_URL);
const previewDeploymentUrl = withHttps(process.env.VERCEL_URL);
const previewBaseUrl =
  previewBranchUrl ?? previewDeploymentUrl ?? "http://localhost:3000";
const previewTrustedOrigins = [previewBranchUrl, previewDeploymentUrl].filter(
  (v): v is string => Boolean(v),
);

const googleClientId = process.env.GOOGLE_CLIENT_ID as string;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET as string;

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "sqlite",
    schema,
    usePlural: true,
  }),
  ...(isPreview
    ? {
        baseURL: previewBaseUrl,
        trustedOrigins: previewTrustedOrigins,
        plugins: [
          genericOAuth({
            config: [
              {
                providerId: "google",
                clientId: googleClientId,
                clientSecret: googleClientSecret,
                discoveryUrl: `${previewBaseUrl}/emulate/google/.well-known/openid-configuration`,
                scopes: ["openid", "email", "profile"],
                pkce: true,
                mapProfileToUser: (profile) => ({
                  id: profile.sub,
                  email: profile.email,
                  name: profile.name,
                  image: profile.picture,
                  emailVerified: profile.email_verified ?? true,
                }),
              },
            ],
          }),
        ],
      }
    : {
        socialProviders: {
          google: {
            clientId: googleClientId,
            clientSecret: googleClientSecret,
          },
        },
      }),
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
    cookieCache: {
      enabled: true,
      maxAge: 5 * 60,
    },
  },
});

export type Session = typeof auth.$Infer.Session;
