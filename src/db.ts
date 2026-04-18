import Dexie, { type Table } from 'dexie'

export type ContractRole = 'maker' | 'taker'
export type ContractStatus =
  | 'offer_pending'    // maker: offer published, waiting for taker DM
  | 'take_received'    // maker: received take_request, needs to send PSBT
  | 'psbt_sent'        // maker: sent funding PSBT to taker
  | 'awaiting_psbt'    // taker: sent take request, waiting for PSBT
  | 'funded'           // both: funding tx broadcast, watching for resolution
  | 'resolved'         // both: oracle revealed preimage, claim tx sent
  | 'refunded'         // both: timelock expired, refund claimed
  | 'cancelled'        // maker: offer cancelled before match

export type ContractSide = 'YES' | 'NO'
export type MessageDirection = 'in' | 'out'
export type MessageType = 'take_request' | 'psbt_offer'

export interface Contract {
  id: string                      // offer event id (maker) or take_request id (taker)
  role: ContractRole
  status: ContractStatus
  side: ContractSide              // maker's side; taker gets the opposite

  // market info
  marketId: string                // d tag from Kind 30050
  marketQuestion: string
  oraclePubkey: string
  announcementEventId: string     // Kind 30050 event id
  yesHash: string
  noHash: string
  resolutionBlockheight: number

  // counterparty
  counterpartyPubkey: string

  // stakes
  makerStake: number              // sats
  confidence: number              // 1–99
  takerStake: number              // derived: maker_stake * (100 - confidence) / confidence

  // bitcoin inputs
  makerInput?: { txid: string; vout: number; amount: number }
  takerInput?: { txid: string; vout: number; amount: number }
  takerChangeAddress?: string
  makerWalletKeyId?: string    // wallet key used for maker's funding input + DLC script
  makerWalletPubkey?: string   // x-only hex — used in DLC script leaves
  takerWalletKeyId?: string    // wallet key used for taker's funding input + DLC script
  takerWalletPubkey?: string   // x-only hex — used in DLC script leaves

  // contract lifecycle
  fundingPsbt?: string            // base64
  fundingTxid?: string

  // settlement
  outcome?: ContractSide
  winningPreimage?: string

  createdAt: number               // unix ms
  updatedAt: number
}

export interface Message {
  id: string                      // random hex
  contractId: string
  direction: MessageDirection
  type: MessageType
  payload: string                 // JSON string of the decrypted DM body
  createdAt: number               // unix ms
}

export interface KeyRecord {
  id: 'self'
  pubkey: string
}

export interface WalletKey {
  id: string        // random hex
  privkey: string   // hex
  pubkey: string    // hex x-only
  address: string   // P2TR regtest address
  createdAt: number
}

export interface OracleMarket {
  id: string                      // d-tag / marketId
  eventId: string                 // Kind 30050 event ID
  question: string
  description: string
  resolutionBlockheight: number
  yesHash: string
  noHash: string
  yesPreimage: string             // kept secret until resolution
  noPreimage: string
  resolvedOutcome?: 'YES' | 'NO'
  resolutionEventId?: string      // Kind 30052 event ID
  createdAt: number
}

class NostrDlcDb extends Dexie {
  contracts!: Table<Contract>
  messages!: Table<Message>
  keys!: Table<KeyRecord>
  wallet!: Table<WalletKey>
  oracleMarkets!: Table<OracleMarket>

  constructor() {
    super('nostr_dlc')
    this.version(1).stores({
      contracts: 'id, role, status, marketId, createdAt',
      messages: 'id, contractId, createdAt',
      keys: 'id',
    })
    this.version(2).stores({
      contracts: 'id, role, status, marketId, createdAt, updatedAt',
      messages: 'id, contractId, createdAt',
      keys: 'id',
    })
    this.version(3).stores({
      contracts: 'id, role, status, marketId, createdAt, updatedAt',
      messages: 'id, contractId, createdAt',
      keys: 'id',
      wallet: 'id',
    })
    this.version(4).stores({
      contracts: 'id, role, status, marketId, createdAt, updatedAt',
      messages: 'id, contractId, createdAt',
      keys: 'id',
      wallet: 'id',
      oracleMarkets: 'id, createdAt',
    })
    this.version(5).stores({
      contracts: 'id, role, status, marketId, createdAt, updatedAt',
      messages: 'id, contractId, createdAt',
      keys: 'id',
      wallet: 'id',
      oracleMarkets: 'id, createdAt',
    })
  }
}

export const db = new NostrDlcDb()
