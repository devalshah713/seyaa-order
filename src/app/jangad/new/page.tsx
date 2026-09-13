import Link from "next/link";
import { isJangadStorageConfigured } from "@/lib/jangadStore";
import NewJangadForm from "./NewJangadForm";

export const metadata = { title: "Issue Diamonds — Seyaa Solitaire" };
export const dynamic = "force-dynamic";

export default function NewJangadPage() {
  return (
    <div className="wrap jg-wrap">
      <div className="page-head">
        <h1>Issue Diamonds</h1>
        <Link href="/jangad" className="btn">← Register</Link>
      </div>
      {isJangadStorageConfigured() ? (
        <NewJangadForm />
      ) : (
        <div className="notice">
          Storage isn&rsquo;t configured yet. Set the four <code>R2_*</code>{" "}
          environment variables and redeploy.
        </div>
      )}
    </div>
  );
}
