import Link from "next/link";
import { listIssuedDesigns } from "@/lib/diamondIssueStore";
import { isStorageConfigured } from "@/lib/sheetStore";
import ExportPicker from "./ExportPicker";

export const dynamic = "force-dynamic";

export default async function ExportPage() {
  if (!isStorageConfigured()) {
    return (
      <main className="container">
        <h1>Export Diamond Issues</h1>
        <div className="card" style={{ marginTop: 16 }}>
          <p className="muted">Once the Google Sheet is connected, exports will be available here.</p>
        </div>
      </main>
    );
  }

  const designs = await listIssuedDesigns();

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/issues" className="muted no-print">
            ← Diamond Issue
          </Link>
          <h1 style={{ marginTop: 6 }}>Export to Excel</h1>
          <p className="muted">
            Select one or more design numbers and download them in your fixed
            Diamond Issue template.
          </p>
        </div>
      </div>

      {designs.length === 0 ? (
        <div className="card empty">
          No diamond issues to export yet.{" "}
          <Link href="/issues/new" style={{ color: "var(--gold)", fontWeight: 600 }}>
            Create one →
          </Link>
        </div>
      ) : (
        <ExportPicker designs={designs} />
      )}
    </main>
  );
}
