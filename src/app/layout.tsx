import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";
import { getCurrentUser } from "@/lib/currentUser";
import UserMenu from "./UserMenu";
import NavMenu from "./NavMenu";

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
              <NavMenu isAdmin={user.role === "admin"} />
              <Link href="/orders/new" className="btn gold small">
                + New Order
              </Link>
              <UserMenu name={user.name} role={user.role} />
            </div>
          ) : null}
        </div>
        {children}
      </body>
    </html>
  );
}
