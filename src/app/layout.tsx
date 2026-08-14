import type { ReactNode } from "react";
import "./globals.css";
import TopBar from "@/components/TopBar";
import { currentSession } from "@/lib/currentUser";

export const metadata = {
  title: "Seyaa Solitaire — Memo",
  description: "Delivery memo generator for Seyaa Solitaire",
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Read once here so the top bar can show who is signed in without every page
  // having to fetch it for itself.
  const session = await currentSession();

  return (
    <html lang="en">
      <body>
        <TopBar
          user={
            session
              ? { username: session.username, role: session.role, mods: session.mods }
              : null
          }
        />
        {children}
      </body>
    </html>
  );
}
