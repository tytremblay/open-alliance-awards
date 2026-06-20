// A little gold trophy statuette, the ceremony's mascot.
export function Statuette({ className = '' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 64 120"
      className={className}
      aria-hidden="true"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="goldGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f5d676" />
          <stop offset="45%" stopColor="#d4af37" />
          <stop offset="100%" stopColor="#9a7b1f" />
        </linearGradient>
      </defs>
      <g fill="url(#goldGrad)">
        {/* head */}
        <circle cx="32" cy="20" r="13" />
        {/* shoulders / body */}
        <path d="M19 33 q13 12 26 0 l-3 34 q-10 6 -20 0 z" />
        {/* arms crossed */}
        <path d="M19 38 q13 9 26 0 l0 6 q-13 9 -26 0 z" opacity="0.85" />
        {/* pedestal */}
        <rect x="24" y="70" width="16" height="22" rx="2" />
        <rect x="16" y="92" width="32" height="9" rx="2" />
        <rect x="12" y="101" width="40" height="11" rx="3" />
      </g>
    </svg>
  )
}
