/** @type {import('@serwist/build').InjectManifestOptions} */
export default {
  swSrc: "src/app/sw.ts",
  swDest: "public/sw.js",
  globDirectory: ".next/static",
  globPatterns: ["**/*.{js,css,woff2}"],
};
