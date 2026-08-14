import "server-only";
import { SESSION_COOKIE, signSession } from "./session";

// Shared headless-Chromium rendering. Navigates to the page's own URL so the
// output uses the exact same print CSS as the browser.
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

// The pages sit behind the login gate, and this browser has no user sitting at
// it. Mint a session for the renderer itself so the page loads as the document
// rather than as the sign-in screen. It is signed with the same secret, so a
// leaked PDF URL still can't be turned into access.
async function rendererCookie(origin: string) {
  const secret = process.env.AUTH_SECRET;
  if (!secret) return null;
  const value = await signSession(
    { uid: "pdf-renderer", username: "pdf-renderer", role: "user" },
    secret
  );
  return { name: SESSION_COOKIE, value, url: origin };
}

// Renders any in-app page to an A4 PDF using its own print CSS.
export async function renderPagePdf(origin: string, path: string): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();

    const cookie = await rendererCookie(origin);
    if (cookie) await page.setCookie(cookie);

    await page.goto(`${origin}${path}`, { waitUntil: "networkidle0", timeout: 30000 });
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

export function renderMemoPdf(origin: string, id: string): Promise<Buffer> {
  // ?pdf=1 renders the memo without the action bar, so the render doesn't
  // re-trigger the client-side auto-upload (which would loop).
  return renderPagePdf(origin, `/memo/${id}?pdf=1`);
}

export function renderPdSheetPdf(origin: string, id: string): Promise<Buffer> {
  return renderPagePdf(origin, `/pd/${id}?pdf=1`);
}

export function renderDemandPdf(origin: string, id: string): Promise<Buffer> {
  return renderPagePdf(origin, `/demand/${id}?pdf=1`);
}

// The order board as a PNG, for sharing into a WhatsApp group. Same browser
// and same session trick as the PDF path; only the output differs.
//
// Sized for a phone screen and rendered at 2x so the text stays sharp after
// WhatsApp re-compresses it.
export async function renderOrderBoardPng(origin: string, part = 1): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.setViewport({ width: 820, height: 1200, deviceScaleFactor: 2 });

    const cookie = await rendererCookie(origin);
    if (cookie) await page.setCookie(cookie);

    await page.goto(`${origin}/orders/board?part=${part}`, {
      waitUntil: "networkidle0",
      timeout: 30000,
    });

    // Photograph the board itself, not the viewport. A full-page shot pads the
    // image out to the viewport height, leaving a long empty tail below a short
    // board; framing the element gives an image exactly as tall as its content
    // whether there are three orders or thirty.
    const board = await page.$(".board");
    const shot = board
      ? await board.screenshot({ type: "png" })
      : await page.screenshot({ type: "png", fullPage: true });
    return Buffer.from(shot);
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
