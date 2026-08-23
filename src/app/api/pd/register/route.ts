import { NextResponse } from "next/server";
import { currentSession } from "@/lib/currentUser";
import { registerRows, syncDesignRegister } from "@/lib/designRegister";
import { isSheetConfigured, sheetSetupHint, sheetTab, sheetUrl } from "@/lib/googleSheets";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Whether the Google Sheet is wired up, and how many design numbers would go
// into it — so the screen can say something useful before anyone presses Sync.
export async function GET(): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const rows = await registerRows().catch(() => []);
  return NextResponse.json({
    configured: isSheetConfigured(),
    hint: sheetSetupHint(),
    url: sheetUrl(),
    tab: sheetTab(),
    designs: Math.max(0, rows.length - 1),
  });
}

// Rewrites the sheet from the portal. Safe to run at any time — it replaces
// rather than appends, so running it twice changes nothing.
export async function POST(): Promise<NextResponse> {
  if (!(await currentSession())) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (!isSheetConfigured()) {
    return NextResponse.json(
      { error: sheetSetupHint() || "The Google Sheet is not set up yet." },
      { status: 501 }
    );
  }
  try {
    return NextResponse.json({ designs: await syncDesignRegister() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not write the sheet." },
      { status: 502 }
    );
  }
}
