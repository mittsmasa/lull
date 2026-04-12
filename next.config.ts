import type { NextConfig } from "next";

// preview 判定は `src/lib/env.ts` と同じ式を直接書く。
// env.ts を import すると定数伝播に頼る形になり、Turbopack の
// resolveAlias 切替や dead-branch DCE が効かなくなる恐れがあるため、
// ここは literal 参照のまま維持する。
const isPreview = process.env.NEXT_PUBLIC_VERCEL_ENV === "preview";
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
