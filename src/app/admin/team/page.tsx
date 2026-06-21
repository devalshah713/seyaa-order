import { redirect } from "next/navigation";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import { listUsers } from "@/lib/usersStore";
import TeamManager from "./TeamManager";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login?next=/admin/team");
  if (user.role !== "admin") {
    return (
      <main className="container">
        <div className="card">
          <h1>Team</h1>
          <p className="muted">This page is for admins only.</p>
          <Link href="/" className="btn ghost">← Back to orders</Link>
        </div>
      </main>
    );
  }

  const users = await listUsers();

  return (
    <main className="container">
      <div className="row spread" style={{ marginBottom: 16 }}>
        <div>
          <Link href="/" className="muted">← All orders</Link>
          <h1 style={{ marginTop: 6 }}>Team</h1>
        </div>
      </div>
      <p className="muted" style={{ marginBottom: 16 }}>
        Add or remove employees and reset passwords. Every action in the app is
        recorded in the Activity Log tab of your Google Sheet.
      </p>
      <TeamManager initialUsers={users} ownerUsername={user.username} />
    </main>
  );
}
