import type { ReactNode } from "react";
import "./globals.css";
import TopBar from "@/components/TopBar";
import { currentSession } from "@/lib/currentUser";

export const metadata = {
  title: "Seyaa Solitaire — Memo",
  description: "Delivery memo generator for Seyaa Solitaire",
};

// The portal is used on phones away from the office, so it has to lay itself
// out at the device's width. Zooming is deliberately left on — a memo or a PD
// sheet is a paper document, and reading one on a phone means pinching in.
export const viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover" as const,
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
