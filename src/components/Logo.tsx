// The Seyaa Solitaire emblem — a rearing horse with a brilliant-cut diamond.
// Served as a static asset from /public so it prints cleanly on the memo.
export default function Logo({
  height = 40,
  className,
}: {
  height?: number;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/seyaa-logo.png"
      alt="Seyaa Solitaire"
      className={className}
      style={{ height, width: "auto", display: "block" }}
    />
  );
}
