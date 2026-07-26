import "server-only";

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

export async function renderMemoPdf(origin: string, id: string): Promise<Buffer> {
  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
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
