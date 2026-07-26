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
        Generate a delivery memo for every piece of jewellery leaving the office —
        auto-numbered, saved, and searchable.
      </p>
      <div className="cta">
        <Link href="/memo/new" className="btn btn-primary">+ New Memo</Link>
        <Link href="/memo" className="btn">View History</Link>
      </div>
    </div>
  );
}
