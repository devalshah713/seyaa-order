export default function DiamondMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true" fill="none">
      <polygon points="32,4 56,24 32,60 8,24" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <line x1="8" y1="24" x2="56" y2="24" stroke="currentColor" strokeWidth="1.6" />
      <line x1="20" y1="24" x2="32" y2="60" stroke="currentColor" strokeWidth="1.2" />
      <line x1="44" y1="24" x2="32" y2="60" stroke="currentColor" strokeWidth="1.2" />
      <line x1="20" y1="24" x2="32" y2="4" stroke="currentColor" strokeWidth="1.2" />
      <line x1="44" y1="24" x2="32" y2="4" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}
