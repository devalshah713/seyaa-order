import Link from "next/link";
import Logo from "@/components/Logo";
import { COMPANY } from "@/lib/memoFormat";

export default function Home() {
  return (
    <div className="hero">
      <Logo height={96} className="mark" />
      <h1>{COMPANY.name}</h1>
      <p className="tagline">{COMPANY.tagline}</p>
      <p className="lead">
        Delivery memos for jewellery leaving the office, and PD sheets for the
        design team — auto-numbered, saved, and searchable.
      </p>
      <div className="cta">
        <Link href="/memo/new" className="btn btn-primary">+ New Memo</Link>
        <Link href="/memo" className="btn">Memo History</Link>
      </div>
      <div className="cta" style={{ marginTop: 12 }}>
        <Link href="/pd/new" className="btn btn-primary">+ New PD Sheet</Link>
        <Link href="/pd" className="btn">PD Sheets</Link>
      </div>
    </div>
  );
}
