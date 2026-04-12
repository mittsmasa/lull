import type { NextRequest } from "next/server";

type RouteContext = { params: Promise<{ path: string[] }> };
type MethodHandler = (req: NextRequest, ctx: RouteContext) => Promise<Response>;
type EmulateHandlers = {
  GET: MethodHandler;
  POST: MethodHandler;
  PUT: MethodHandler;
  PATCH: MethodHandler;
  DELETE: MethodHandler;
};

const NOT_FOUND: MethodHandler = async () =>
  new Response(null, { status: 404 });
const NOT_FOUND_HANDLERS: EmulateHandlers = {
  GET: NOT_FOUND,
  POST: NOT_FOUND,
  PUT: NOT_FOUND,
  PATCH: NOT_FOUND,
  DELETE: NOT_FOUND,
};

const handlersPromise: Promise<EmulateHandlers> =
  process.env.NEXT_PUBLIC_VERCEL_ENV === "preview"
    ? (async () => {
        const [{ createEmulateHandler }, googleModule] = await Promise.all([
          import("@emulators/adapter-next"),
          import("@emulators/google"),
        ]);

        const branchUrl = process.env.VERCEL_BRANCH_URL
          ? `https://${process.env.VERCEL_BRANCH_URL}`
          : undefined;
        const deploymentUrl = process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : undefined;

        const redirectUris = Array.from(
          new Set(
            [
              "http://localhost:3000/api/auth/oauth2/callback/google",
              branchUrl && `${branchUrl}/api/auth/oauth2/callback/google`,
              deploymentUrl &&
                `${deploymentUrl}/api/auth/oauth2/callback/google`,
            ].filter((v): v is string => Boolean(v)),
          ),
        );

        return createEmulateHandler({
          services: {
            google: {
              emulator: googleModule,
              seed: {
                oauth_clients: [
                  {
                    client_id: process.env.GOOGLE_CLIENT_ID ?? "emulate-client",
                    client_secret:
                      process.env.GOOGLE_CLIENT_SECRET ?? "emulate-secret",
                    name: "Lull Preview",
                    redirect_uris: redirectUris,
                  },
                ],
                users: [
                  {
                    email: "preview-tester@example.com",
                    name: "Preview Tester",
                    given_name: "Preview",
                    family_name: "Tester",
                    email_verified: true,
                  },
                ],
              },
            },
          },
        }) as EmulateHandlers;
      })()
    : Promise.resolve(NOT_FOUND_HANDLERS);

async function dispatch(
  method: keyof EmulateHandlers,
  req: NextRequest,
  ctx: RouteContext,
) {
  const handlers = await handlersPromise;
  return handlers[method](req, ctx);
}

export const GET = (req: NextRequest, ctx: RouteContext) =>
  dispatch("GET", req, ctx);
export const POST = (req: NextRequest, ctx: RouteContext) =>
  dispatch("POST", req, ctx);
export const PUT = (req: NextRequest, ctx: RouteContext) =>
  dispatch("PUT", req, ctx);
export const PATCH = (req: NextRequest, ctx: RouteContext) =>
  dispatch("PATCH", req, ctx);
export const DELETE = (req: NextRequest, ctx: RouteContext) =>
  dispatch("DELETE", req, ctx);
