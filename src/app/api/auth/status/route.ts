// Lets the sign-in screen decide whether to show "create the first admin"
// or the normal login form. Public by necessity — it runs before anyone can
// possibly be signed in — so it reveals nothing beyond whether setup is done.
import { NextResponse } from "next/server";
import { countUsers } from "@/lib/userStore";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(): Promise<Response> {
  if (!process.env.AUTH_SECRET) {
    return NextResponse.json(
      { configured: false, needsSetup: false, error: "Set AUTH_SECRET in Vercel." },
      { status: 501 }
    );
  }
  try {
    return NextResponse.json({ configured: true, needsSetup: (await countUsers()) === 0 });
  } catch (err) {
    return NextResponse.json(
      { configured: false, needsSetup: false, error: err instanceof Error ? err.message : "Unavailable." },
      { status: 500 }
    );
  }
}
