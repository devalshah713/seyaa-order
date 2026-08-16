import { NextRequest, NextResponse } from "next/server";
import { findByDesignNo } from "@/lib/pdStore";
import { pieceStatusLabel } from "@/lib/designNo";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Look a design number up — the whole design, or one piece of it.
//
//   /api/pd/lookup?design=SN-BR-AMF-10CT-46
//
// A piece has no record of its own until it is entered in the stock sheet, so
// this answers from the design it was made under.
export async function GET(req: NextRequest): Promise<NextResponse> {
  const query = (req.nextUrl.searchParams.get("design") || "").trim();
  if (!query) {
    return NextResponse.json({ error: "Add ?design= to search." }, { status: 400 });
  }

  try {
    const found = await findByDesignNo(query);
    return NextResponse.json({
      query,
      results: found.map(({ sheet, hit }) => {
        const piece = hit.kind === "piece"
          ? sheet.pieces?.find((p) => p.no === hit.piece)
          : undefined;
        return {
          id: sheet.id,
          pdNo: sheet.pdNo,
          designNo: sheet.sku,
          matched: hit.kind, // "piece" — one piece named; "design" — the design
          piece: hit.piece || null,
          pieceStatus: piece ? pieceStatusLabel(piece.status) : null,
          stockNo: piece?.stockNo || null,
          product: sheet.product,
          quantity: sheet.quantity,
          totalPieces: sheet.pieces?.length || 0,
          assignedTo: sheet.assignedTo,
          deliveryDate: sheet.deliveryDate,
        };
      }),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not search." },
      { status: 503 }
    );
  }
}
