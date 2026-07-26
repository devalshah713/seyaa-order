"use client";

export default function ThemeToggle() {
  function toggle() {
    const root = document.documentElement;
    const cur = root.getAttribute("data-theme");
    const isDark = cur
      ? cur === "dark"
      : window.matchMedia("(prefers-color-scheme: dark)").matches;
    root.setAttribute("data-theme", isDark ? "light" : "dark");
  }
  return (
    <button className="theme-toggle" onClick={toggle} title="Toggle light / dark" aria-label="Toggle theme">
      ◑
    </button>
  );
}
