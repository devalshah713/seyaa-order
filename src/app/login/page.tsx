import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/currentUser";
import LoginForm from "./LoginForm";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: { next?: string };
}) {
  // Already signed in? Skip the login screen.
  const user = await getCurrentUser();
  if (user) redirect(searchParams.next || "/");

  return (
    <main className="login-wrap">
      <div className="login-card">
        <div className="login-brand">
          <b>SEYAA</b>
          <span>Order Management</span>
        </div>
        <h1 className="login-title">Sign in</h1>
        <p className="muted" style={{ marginBottom: 18 }}>
          Use the username and password given to you.
        </p>
        <LoginForm next={searchParams.next || "/"} />
      </div>
    </main>
  );
}
