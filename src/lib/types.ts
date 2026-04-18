export type TakerInput = {
  txid: string
  vout: number
  amount: number  // sats
}

export type TakeRequest = {
  type: 'take_request'
  taker_pubkey: string         // nostr pubkey — used by maker to DM back
  taker_wallet_pubkey: string  // x-only wallet pubkey — used in DLC script leaves
  input: TakerInput
  change_address: string
}

export type PsbtOffer = {
  type: 'psbt_offer'
  funding_psbt: string         // base64
  maker_wallet_pubkey: string  // x-only wallet pubkey — used in DLC script leaves
}
