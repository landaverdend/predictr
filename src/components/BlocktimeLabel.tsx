import { useRef, useState } from 'react'
import { projectedResolution } from '../lib/blocktime'

/**
 * Renders block height + projected time as two lines:
 *   block 2,344
 *   ~15 days · May 10, 4:10 AM ⓘ
 *
 * The ⓘ popover uses position:fixed to escape overflow:hidden parents.
 */
export function BlocktimeLabel({
  resolutionBlock,
  currentBlock,
  className = '',
}: {
  resolutionBlock: number
  currentBlock: number | null
  className?: string
}) {
  const info = projectedResolution(resolutionBlock, currentBlock)
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const btnRef = useRef<HTMLButtonElement>(null)

  function handleMouseEnter() {
    if (btnRef.current) {
      const r = btnRef.current.getBoundingClientRect()
      setPos({ top: r.top, left: r.left + r.width / 2 })
    }
    setOpen(true)
  }

  return (
    <span className={`flex flex-col gap-0.5 ${className}`}>
      <span className="font-mono">block {resolutionBlock.toLocaleString()}</span>
      {info && (
        <span className="flex items-center gap-1 flex-wrap">
          <span>{info.relative}</span>
          <span className="text-ink/25">·</span>
          <span className="text-ink/40">{info.absolute}</span>

          <button
            ref={btnRef}
            type="button"
            onMouseEnter={handleMouseEnter}
            onMouseLeave={() => setOpen(false)}
            onFocus={handleMouseEnter}
            onBlur={() => setOpen(false)}
            className="text-ink/25 hover:text-ink/50 transition-colors leading-none shrink-0"
            aria-label="Estimate disclaimer"
          >
            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="currentColor">
              <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1zm0 3a.75.75 0 1 1 0 1.5A.75.75 0 0 1 8 4zm-.25 3h1.5v4.5h-1.5V7z"/>
            </svg>
          </button>

          {open && pos && (
            <span
              className="pointer-events-none"
              style={{
                position: 'fixed',
                top: pos.top - 8,
                left: pos.left,
                transform: 'translate(-50%, -100%)',
                zIndex: 9999,
              }}
            >
              <span className="block w-52 bg-elevated border border-ink/20 rounded-lg px-3 py-2 text-[11px] text-ink/60 leading-relaxed shadow-xl">
                Rough estimate based on ~10 min avg block time. Actual resolution may be hours or days off.
              </span>
            </span>
          )}
        </span>
      )}
    </span>
  )
}
