import DiamondIssueForm from "./DiamondIssueForm";

export const dynamic = "force-dynamic";

export default function NewIssuePage() {
  return (
    <main className="container">
      <h1>New Diamond Issue</h1>
      <p className="muted" style={{ marginBottom: 20 }}>
        Record diamonds issued to a manufacturer against a memo. Totals are
        calculated automatically; record what was used when the work returns.
      </p>
      <DiamondIssueForm />
    </main>
  );
}
