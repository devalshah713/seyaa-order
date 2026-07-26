import { NextRequest } from "next/server";
import { getMemo } from "@/lib/memoStore";

// Server-side PDF generation. Headless Chromium renders the saved memo page
// (same print CSS as the browser) and returns a downloadable A4 PDF named by
// memo number. On Vercel it uses @sparticuz/chromium; locally it falls back to
// a system Chromium (PUPPETEER_EXECUTABLE_PATH or the pre-installed browser).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

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

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } }
): Promise<Response> {
  const memo = await getMemo(params.id).catch(() => null);
  if (!memo) return new Response("Memo not found", { status: 404 });

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("host");
  const url = `${proto}://${host}/memo/${params.id}`;

  let browser;
  try {
    browser = await launchBrowser();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    // page.pdf() emulates print media; preferCSSPageSize honours the @page rule.
    const pdf = await page.pdf({
      printBackground: true,
      preferCSSPageSize: true,
      format: "A4",
    });

    const filename = memo.memoNo.replace(/[/\\]/g, "_") + ".pdf";
    return new Response(Buffer.from(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "PDF generation failed.";
    return new Response(`Could not generate PDF: ${msg}`, { status: 500 });
  } finally {
    if (browser) await browser.close();
  }
}
