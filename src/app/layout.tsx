import type { ReactNode } from "react";
import "./globals.css";
import TopBar from "@/components/TopBar";

export const metadata = {
  title: "Seyaa Solitaire — Memo",
  description: "Delivery memo generator for Seyaa Solitaire",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <TopBar />
        {children}
      </body>
    </html>
  );
}
