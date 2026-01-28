import { getChainName } from "@/lib/chains";

interface ChainBadgeProps {
  chainId: number;
}

// SVG chain icons (simplified logos)
function ChainIcon({ chainId }: { chainId: number }) {
  const size = "w-3.5 h-3.5";

  switch (chainId) {
    case 1: // Ethereum
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 1.5L5.5 12.25L12 16L18.5 12.25L12 1.5Z" opacity="0.6" />
          <path d="M12 16L5.5 12.25L12 22.5L18.5 12.25L12 16Z" />
        </svg>
      );
    case 10: // Optimism
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
    case 137: // Polygon
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16.5 8.25L12 5.5L7.5 8.25V13.75L12 16.5L16.5 13.75V8.25Z" />
        </svg>
      );
    case 2020: // Ronin
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L4 6v6l8 10 8-10V6l-8-4zm0 2.5L18 8v4l-6 7.5L6 12V8l6-3.5z" />
        </svg>
      );
    case 8453: // Base
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="10" />
          <circle cx="12" cy="12" r="5" fill="white" />
        </svg>
      );
    case 42161: // Arbitrum
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2L3 7V17L12 22L21 17V7L12 2Z" />
        </svg>
      );
    case 59144: // Linea
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="10" width="16" height="4" rx="2" />
        </svg>
      );
    case 534352: // Scroll
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z" />
          <path d="M12 6c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
        </svg>
      );
    case 5000: // Mantle
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <rect x="4" y="4" width="16" height="16" rx="2" />
        </svg>
      );
    default:
      return (
        <svg className={size} viewBox="0 0 24 24" fill="currentColor">
          <circle cx="12" cy="12" r="8" />
        </svg>
      );
  }
}

function getChainStyle(chainId: number): string {
  const styles: Record<number, string> = {
    1: "bg-slate-100 text-slate-700",
    10: "bg-red-100 text-red-700",
    137: "bg-purple-100 text-purple-700",
    2020: "bg-blue-100 text-blue-700",
    8453: "bg-blue-100 text-blue-700",
    42161: "bg-sky-100 text-sky-700",
    59144: "bg-slate-100 text-slate-700",
    534352: "bg-amber-100 text-amber-700",
    5000: "bg-slate-100 text-slate-700",
  };
  return styles[chainId] ?? "bg-slate-100 text-slate-700";
}

export function ChainBadge({ chainId }: ChainBadgeProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-md text-xs font-medium ${getChainStyle(chainId)}`}
    >
      <ChainIcon chainId={chainId} />
      {getChainName(chainId)}
    </span>
  );
}
