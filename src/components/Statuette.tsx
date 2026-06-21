import trophyUrl from '../assets/trophy.png'

// The Open Alliance Awards trophy — the ceremony's mascot.
export function Statuette({ className = '' }: { className?: string }) {
  return (
    <img
      src={trophyUrl}
      className={className}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  )
}
