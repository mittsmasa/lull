import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";

const createAuth = () => {
  const { env } = getCloudflareContext();
  return betterAuth({
    database: env.DB,
    user: {
      modelName: "users",
      fields: {
        emailVerified: "email_verified",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "sessions",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        userId: "user_id",
      },
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 5 * 60,
      },
    },
    account: {
      modelName: "accounts",
      fields: {
        accountId: "account_id",
        providerId: "provider_id",
        userId: "user_id",
        accessToken: "access_token",
        refreshToken: "refresh_token",
        idToken: "id_token",
        createdAt: "created_at",
        updatedAt: "updated_at",
        accessTokenExpiresAt: "access_token_expires_at",
        refreshTokenExpiresAt: "refresh_token_expires_at",
      },
    },
    verification: {
      modelName: "verifications",
      fields: {
        expiresAt: "expires_at",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID as string,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
      },
    },
  });
};

type AuthInstance = ReturnType<typeof createAuth>;

let _cachedAuth: AuthInstance | null = null;

const getOrCreateAuth = (): AuthInstance => {
  if (!_cachedAuth) {
    _cachedAuth = createAuth();
  }
  return _cachedAuth;
};

export const auth: AuthInstance = new Proxy({} as AuthInstance, {
  get(_, prop: string | symbol) {
    return Reflect.get(getOrCreateAuth(), prop);
  },
});

export type Session = typeof auth.$Infer.Session;
