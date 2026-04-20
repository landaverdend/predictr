interface NavBadgeProps {
  count: number
}

/**
 * Red notification badge — shown on nav links when count > 0.
 * Caps display at 99+ to avoid overflow.
 */
export default function NavBadge({ count }: NavBadgeProps) {
  if (count <= 0) return null

  return (
    <span className="absolute -top-1.5 -right-2.5 min-w-[16px] h-4 px-0.5 rounded-full bg-negative flex items-center justify-center">
      <span className="text-[10px] font-bold text-white leading-none">
        {count > 99 ? '99+' : count}
      </span>
    </span>
  )
}
