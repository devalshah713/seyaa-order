/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Keep the headless-Chromium packages out of the webpack bundle so their
  // native/brotli assets are traced correctly into the serverless function.
  experimental: {
    serverComponentsExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
    // Marking the package external is not enough on its own: the browser is a
    // set of .br archives under bin/, and the path to them is only resolved at
    // runtime by chromium.executablePath(). Nothing references those files
    // statically, so the tracer leaves them out and the function fails with
    // "the input directory .../@sparticuz/chromium/bin does not exist".
    // Name the two routes that actually launch Chromium and pull bin/ in.
    outputFileTracingIncludes: {
      "/api/memos/[id]/pdf": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/memos/[id]/drive": ["./node_modules/@sparticuz/chromium/bin/**"],
      "/api/orders/image": ["./node_modules/@sparticuz/chromium/bin/**"],
    },
  },
};

export default nextConfig;
