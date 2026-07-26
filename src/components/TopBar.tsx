"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Logo from "./Logo";
import ThemeToggle from "./ThemeToggle";
import { COMPANY } from "@/lib/memoFormat";

export default function TopBar() {
  const path = usePathname();
  const on = (href: string) =>
    href === "/memo" ? path === "/memo" || path.startsWith("/memo/") && path !== "/memo/new" : path === href;

  return (
    <header className="topbar no-print">
      <Logo height={30} className="mark" />
      <Link href="/" className="brand" style={{ textDecoration: "none" }}>
        {COMPANY.name}
      </Link>
      <nav>
        <Link href="/memo/new" className={path === "/memo/new" ? "active" : ""}>New Memo</Link>
        <Link href="/memo" className={on("/memo") ? "active" : ""}>History</Link>
        <ThemeToggle />
      </nav>
    </header>
  );
}
