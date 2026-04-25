export const BLOCK_SECONDS = 10 * 60 // ~10 min per block

export function estimatedResolutionDate(
  resolutionBlock: number,
  currentBlock: number,
): Date {
  const blocksRemaining = resolutionBlock - currentBlock
  return new Date(Date.now() + blocksRemaining * BLOCK_SECONDS * 1000)
}

/** Compact relative label: "~45 min", "~6 hrs", "~3 days", "resolved" */
export function formatRelative(date: Date): string {
  const diffMs = date.getTime() - Date.now()
  if (diffMs <= 0) return 'resolved'

  const diffMin = diffMs / 60_000
  if (diffMin < 90)  return `~${Math.round(diffMin)} min`

  const diffHr = diffMs / 3_600_000
  if (diffHr < 48)   return `~${Math.round(diffHr)} hrs`

  const diffDay = diffMs / 86_400_000
  if (diffDay < 14)  return `~${Math.round(diffDay)} days`

  return `~${Math.round(diffDay)} days`
}

/** Absolute datetime string: "Apr 3 at 2:30 PM" */
export function formatAbsolute(date: Date): string {
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

export interface BlocktimeInfo {
  relative: string   // "~6 hrs"
  absolute: string   // "Apr 3 at 2:30 PM"
  date: Date
}

/** Convert a target Date to the nearest block number */
export function dateToBlock(date: Date, currentBlock: number): number {
  const ms = date.getTime() - Date.now()
  return Math.max(currentBlock + 1, Math.round(currentBlock + ms / (BLOCK_SECONDS * 1000)))
}

/** Format a Date as a datetime-local input value string */
export function toDatetimeLocal(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/**
 * Returns relative + absolute projected resolution info, or null if
 * currentBlock is unknown.
 */
export function projectedResolution(
  resolutionBlock: number,
  currentBlock: number | null,
): BlocktimeInfo | null {
  if (currentBlock === null) return null
  const date = estimatedResolutionDate(resolutionBlock, currentBlock)
  return {
    relative: formatRelative(date),
    absolute: formatAbsolute(date),
    date,
  }
}
