import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import UserMenu from "./UserMenu";

export const metadata: Metadata = {
  title: "Seyaa Order Management",
  description: "Jewellery order management across USA, Dubai, Hong Kong & India",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await getCurrentUser();

  return (
    <html lang="en">
      <body>
        <div className="topbar no-print">
          <Link href="/" className="brand">
            <b>SEYAA</b>
            <span>Orders</span>
          </Link>
          {user ? (
            <div className="row" style={{ gap: 10 }}>
              <Link href="/" className="btn ghost small" style={{ color: "#fff", borderColor: "#3f3f46" }}>
                Orders
              </Link>
              <Link href="/orders/new" className="btn gold small">
                + New Order
              </Link>
              <Link href="/issues" className="btn ghost small" style={{ color: "#fff", borderColor: "#3f3f46" }}>
                Diamond Issue
              </Link>
              {user.role === "admin" && (
                <Link href="/admin/team" className="btn ghost small" style={{ color: "#fff", borderColor: "#3f3f46" }}>
                  Team
                </Link>
              )}
              <UserMenu name={user.name} role={user.role} />
            </div>
          ) : null}
        </div>
        {children}
      </body>
    </html>
  );
}
