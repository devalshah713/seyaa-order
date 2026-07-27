// Admin-only screen. Middleware has already guaranteed someone is signed in;
// this checks they're specifically an admin before rendering anything.
import { redirect } from "next/navigation";
import { currentSession } from "@/lib/currentUser";
import UsersClient from "./UsersClient";

export const dynamic = "force-dynamic";

export default async function UsersPage() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/admin/users");
  if (session.role !== "admin") redirect("/");
  return <UsersClient meId={session.uid} />;
}
