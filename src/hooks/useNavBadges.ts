import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/**
 * Returns a map of nav route -> unread count.
 * Uses an indexed `unread` boolean field so Dexie's liveQuery
 * can track changes precisely without a full table scan.
 */
export function useNavBadges(): Record<string, number> {
  const contractsCount = useLiveQuery(
    () => db.contracts.filter(c => c.unread === true).count(),
    [],
    0,
  )

  return {
    '/contracts': contractsCount,
  }
}
