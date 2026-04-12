import type { NextConfig } from "next";

const isPreview = process.env.VERCEL_ENV === "preview";
const stubPath = "./src/lib/emulate-stub.ts";

const baseConfig: NextConfig = {
  turbopack: {
    resolveAlias: isPreview
      ? {}
      : {
          "@emulators/adapter-next": stubPath,
          "@emulators/google": stubPath,
        },
  },
  ...(isPreview
    ? {}
    : {
        outputFileTracingExcludes: {
          "**/*": ["node_modules/@emulators/**"],
        },
      }),
};

export default async function config(): Promise<NextConfig> {
  if (!isPreview) return baseConfig;
  const { withEmulate } = await import("@emulators/adapter-next");
  return withEmulate(baseConfig);
}
