// The factory's CAD, put onto the request.
//
// Anybody signed in may do it, because whoever the factory sent it to is the
// one holding it. It moves the request to "CAD received", which puts it in
// front of the owner. More images while it is already there join the same
// round; the first images after "Changes asked" start a new one, so the owner's
// next decision is about the new drawing and not the old.
import { NextRequest, NextResponse } from "next/server";
import { changeCadRequest } from "@/lib/memoStore";
import { canAddCad, cadStatusLabel, readPhotos, type CadImage } from "@/lib/cadConfig";
import { currentSession } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> }
): Promise<NextResponse> {
  const session = await currentSession();
  if (!session) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await ctx.params;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const photos = readPhotos(body.images);
  if (photos === "bad") {
    return NextResponse.json(
      { error: "A CAD image did not upload. Try that image again." },
      { status: 400 }
    );
  }
  if (photos.length === 0) {
    return NextResponse.json({ error: "Add at least one CAD image." }, { status: 400 });
  }

  try {
    const at = new Date().toISOString();
    const done = await changeCadRequest(
      id,
      (r) => {
        const all = r.cadImages || [];
        const last = all.reduce((n, c) => Math.max(n, c.round || 1), 0);
        // Still in front of the owner: the same drawing, more views of it.
        const round = r.status === "received" && last > 0 ? last : last + 1;
        const added: CadImage[] = photos.map((p) => ({ ...p, at, by: session.username, round }));
        return { cadImages: [...all, ...added], status: "received" };
      },
      {
        action: "cad_received",
        by: session.username,
        note: `${photos.length} ${photos.length === 1 ? "image" : "images"}`,
      },
      (r) =>
        canAddCad(r)
          ? ""
          : `${r.cadNo} is ${cadStatusLabel(r.status).toLowerCase()}, so a new CAD cannot be put on it.`
    );
    if (!done) return NextResponse.json({ error: "CAD request not found." }, { status: 404 });
    if ("refused" in done) return NextResponse.json({ error: done.refused }, { status: 409 });
    return NextResponse.json({ request: done.request });
  } catch (err) {
    return NextResponse.json({ error: msg(err) }, { status: 503 });
  }
}

function msg(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
