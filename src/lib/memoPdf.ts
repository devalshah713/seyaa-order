import "server-only";
import { SESSION_COOKIE, signSession } from "./session";

// Shared headless-Chromium PDF rendering. Navigates to the memo's own page so
// the PDF uses the exact same print CSS as the browser. Used by both the
// download route and the Google Drive upload.
async function launchBrowser() {
  const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
  const puppeteer = await import("puppeteer-core");

  if (isServerless) {
    const chromium = (await import("@sparticuz/chromium")).default;
    return puppeteer.launch({
      args: chromium.args,
      executablePath: await chromium.executablePath(),
      headless: true,
    });
  }

  const executablePath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
  return puppeteer.launch({
    executablePath,
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
}

// The memo page sits behind the login gate, and this browser has no user
// sitting at it. Mint a session for the renderer itself so the page loads as
// the memo rather than as the sign-in screen. It is signed with the same
// secret, so a leaked PDF URL still can't be turned into access.
async function rendererCookie(origin: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const value = await signSession(
    { uid: "pdf-renderer", username: "pdf-renderer", role: "user" },
    secret
  );
  return { name: SESSION_COOKIE, value, url: origin };
}

export async function renderMemoPdf(origin: string, id: string): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const cookie = await rendererCookie(origin);
    if (cookie) await page.setCookie(cookie);

    // ?pdf=1 renders the memo without the action bar, so the render doesn't
    // re-trigger the client-side auto-upload (which would loop).
    await page.goto(`${origin}/memo/${id}?pdf=1`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: "A4",
    });
    return Buffer.from(pdf);
  } finally {
    if (browser) await browser.close();
  }
}

// Absolute origin of the deployment from the incoming request headers.
export function originFromHeaders(headers: Headers): string {
  const proto = headers.get("x-forwarded-proto") || "http";
  const host = headers.get("host");
  return `${proto}://${host}`;
}
