import "./globals.css";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Seyaa Order Management",
  description: "Jewellery order management across USA, Dubai, Hong Kong & India",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="topbar no-print">
          <Link href="/" className="brand">
            <b>SEYAA</b>
            <span>Orders</span>
          </Link>
          <div className="row">
            <Link href="/" className="btn ghost small" style={{ color: "#fff", borderColor: "#3f3f46" }}>
              Orders
            </Link>
            <Link href="/orders/new" className="btn gold small">
              + New Order
            </Link>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
