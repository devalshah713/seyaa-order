// How the Next.js app is packaged for Cloudflare Workers.
//
// Deliberately bare. Every page in this portal is `force-dynamic` — a jangad
// register or a stock book that showed yesterday's rows would be worse than
// useless — so there is no incremental cache to configure and nothing to
// revalidate. What is left is the defaults.
import { defineCloudflareConfig } from "@opennextjs/cloudflare";

export default defineCloudflareConfig();
