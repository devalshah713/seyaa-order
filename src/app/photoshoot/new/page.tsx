import Link from "next/link";
import PhotoshootForm, { PhotoshootInitial } from "./PhotoshootForm";
import { getPhotoshoot } from "@/lib/photoshootStore";

export const dynamic = "force-dynamic";

export default async function NewPhotoshootPage({
  searchParams,
}: {
  searchParams: { stock?: string };
}) {
  const stockNo = (searchParams.stock || "").trim();
  const rec = stockNo ? await getPhotoshoot(stockNo) : null;
  const initial: PhotoshootInitial | null = rec ? { ...rec } : null;

  return (
    <main className="container">
      <div style={{ marginBottom: 16 }}>
        <Link href="/photoshoot" className="muted">← Photoshoot</Link>
        <h1 style={{ marginTop: 6 }}>{initial ? `Edit Photoshoot · Stock ${initial.stockNo}` : "Photoshoot & Marketing"}</h1>
        <p className="muted">
          Pick a stock number to auto-fill its design, then paste the AI image / video links and the
          marketing links.
        </p>
      </div>
      <PhotoshootForm initial={initial} />
    </main>
  );
}
