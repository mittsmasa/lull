import { getCloudflareContext } from "@opennextjs/cloudflare";
import { betterAuth } from "better-auth";

const createAuth = () => {
  const { env } = getCloudflareContext();
  return betterAuth({
    database: env.DB, // v1.5: D1 を直接渡せる
    socialProviders: {
      google: {
        clientId: env.GOOGLE_CLIENT_ID as string,
        clientSecret: env.GOOGLE_CLIENT_SECRET as string,
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
