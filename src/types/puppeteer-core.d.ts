// Ambient declaration so TypeScript accepts puppeteer-core imports.
// The package ships ESM types that the bundler moduleResolution misses.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare module "puppeteer-core" {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const puppeteer: any;
  export default puppeteer;
  export type Browser = import("puppeteer-core/lib/types.js").Browser;
  export type Page = import("puppeteer-core/lib/types.js").Page;
}
