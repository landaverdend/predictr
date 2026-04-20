import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

/**
 * Returns a map of nav route -> unread count.
 * A contract is "unread" when seenAt is undefined — i.e. it was created or
 * updated by an incoming DM but the user hasn't opened the detail view yet.
 *
 * To add badges for other routes in the future, extend the returned object.
 */
export function useNavBadges(): Record<string, number> {
  const contractsCount = useLiveQuery(async () => {
    return db.contracts.filter(c => !c.seenAt).count()
  }, [], 0)

  return {
    '/contracts': contractsCount,
  }
}
