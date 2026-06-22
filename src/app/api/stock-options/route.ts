import { NextRequest, NextResponse } from "next/server";
import { getStockOptions, addStockOption, isValidKind } from "@/lib/stockOptionsStore";
import { getCurrentUser } from "@/lib/currentUser";
import { logActivity } from "@/lib/sheetStore";

export const dynamic = "force-dynamic";

// Returns the Stock In option lists (defaults + staff-added), keyed by kind.
export async function GET() {
  const options = await getStockOptions();
  return NextResponse.json({ options });
}

// Adds a new option (gold | location | inch) and persists it.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const kind = String(body.kind || "").trim();
  const value = String(body.value || "").trim();

  if (!isValidKind(kind)) return NextResponse.json({ error: "Invalid option kind" }, { status: 400 });
  if (!value) return NextResponse.json({ error: "Value is required" }, { status: 400 });
  if (value.length > 80) return NextResponse.json({ error: "Value is too long" }, { status: 400 });

  try {
    const options = await addStockOption(kind, value);
    const actor = await getCurrentUser();
    if (actor) {
      logActivity({
        user: actor.username,
        role: actor.role,
        action: "Added stock option",
        details: `${kind}: ${value}`,
      });
    }
    return NextResponse.json({ options });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Failed to save option" },
      { status: 500 }
    );
  }
}
