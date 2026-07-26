import { NextRequest } from "next/server";
import { exchangeCode } from "@/lib/googleDrive";
import { originFromHeaders } from "@/lib/memoPdf";

// One-time setup: receives Google's authorization code, exchanges it for a
// refresh token, and shows it once so it can be pasted into Vercel as
// GOOGLE_REFRESH_TOKEN. This page is only useful during initial setup.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function page(title: string, body: string): Response {
  return new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
     <title>${title}</title>
     <div style="font-family:system-ui,sans-serif;max-width:640px;margin:60px auto;padding:0 20px;line-height:1.6;color:#26241f">
       ${body}
     </div>`,
    { headers: { "Content-Type": "text/html; charset=utf-8" } }
  );
}

export async function GET(req: NextRequest): Promise<Response> {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error) return page("Authorization cancelled", `<h2>Authorization cancelled</h2><p>${error}</p>`);
  if (!code) return page("Missing code", `<h2>Missing authorization code</h2>`);

  try {
    const redirectUri = `${originFromHeaders(req.headers)}/api/drive/callback`;
    const refreshToken = await exchangeCode(code, redirectUri);
    return page(
      "Google Drive connected",
      `<h2>✅ Almost done</h2>
       <p>Copy this value and add it in Vercel as the environment variable
       <b>GOOGLE_REFRESH_TOKEN</b>, then redeploy:</p>
       <textarea readonly rows="4" style="width:100%;font-family:monospace;font-size:13px;padding:10px;border:1px solid #d9d3c5;border-radius:8px" onclick="this.select()">${refreshToken}</textarea>
       <p style="color:#6e6a5f;font-size:14px">Keep this secret. After adding it and redeploying, memos will auto-save to your Google Drive.</p>`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Token exchange failed.";
    return page("Setup error", `<h2>Setup error</h2><p>${msg}</p>`);
  }
}
