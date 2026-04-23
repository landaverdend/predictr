import type { NostrEvent } from 'nostr-tools'

export type Market = {
  id: string
  eventId: string
  pubkey: string
  question: string
  description: string
  resolutionBlockheight: number
  yesHash: string
  noHash: string
  imageUrl?: string
  relays: string[]
}

export type MarketStats = {
  openCount: number
  filledCount: number
  totalVolume: number   // sats — sum of full pots for filled offers
  yesVolume: number     // sats committed to YES side (open + filled)
  noVolume: number      // sats committed to NO side (open + filled)
}

export type Offer = {
  id: string        // d-tag
  makerPubkey: string
  side: 'YES' | 'NO'
  makerStake: number
  confidence: number
  status: string    // 'open' | 'filled' | etc.
  createdAt: number
}

export function tag(event: NostrEvent, name: string): string {
  return event.tags.find(t => t[0] === name)?.[1] ?? ''
}

export function parseMarket(event: NostrEvent): Market {
  const imageUri = tag(event, 'image')
  return {
    id: tag(event, 'd'),
    eventId: event.id,
    pubkey: event.pubkey,
    question: tag(event, 'question'),
    description: event.content,
    resolutionBlockheight: parseInt(tag(event, 'resolution_blockheight'), 10),
    yesHash: tag(event, 'yes_hash'),
    noHash: tag(event, 'no_hash'),
    imageUrl: imageUri || undefined,
    relays: event.tags.filter(t => t[0] === 'r').map(t => t[1]),
  }
}

export function computeStats(offers: Offer[]): MarketStats {
  let openCount = 0
  let filledCount = 0
  let totalVolume = 0
  let yesVolume = 0
  let noVolume = 0

  for (const o of offers) {
    const ts = takerStake(o)
    if (o.status === 'open') {
      openCount++
    } else {
      filledCount++
      totalVolume += o.makerStake + ts
      // Both sides locked in
      if (o.side === 'YES') { yesVolume += o.makerStake; noVolume += ts }
      else { noVolume += o.makerStake; yesVolume += ts }
    }
  }

  return { openCount, filledCount, totalVolume, yesVolume, noVolume }
}

export function parseOffer(event: NostrEvent): Offer {
  return {
    id: tag(event, 'd'),
    makerPubkey: event.pubkey,
    side: tag(event, 'side') as 'YES' | 'NO',
    makerStake: parseInt(tag(event, 'maker_stake'), 10),
    confidence: parseInt(tag(event, 'confidence'), 10),
    status: tag(event, 'status') || 'open',
    createdAt: event.created_at * 1000,
  }
}

export function takerStake(offer: Offer): number {
  return Math.ceil(offer.makerStake * (100 - offer.confidence) / offer.confidence)
}

export function truncate(pubkey: string) {
  return `${pubkey.slice(0, 6)}…${pubkey.slice(-6)}`
}

export function timeAgo(ts: number) {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}s ago`
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  return `${Math.floor(diff / 3600)}h ago`
}

export function isValidMarket(m: Market): boolean {
  return (
    !!m.id &&
    !!m.question &&
    !!m.yesHash &&
    !!m.noHash &&
    Number.isFinite(m.resolutionBlockheight) &&
    m.resolutionBlockheight > 0
  )
}

export function randomHex(bytes: number) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}
