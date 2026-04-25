type Network = { bech32: string; pubKeyHash: number; scriptHash: number; wif: number }

const NETWORKS: Record<string, Network> = {
  regtest: { bech32: 'bcrt', pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  testnet: { bech32: 'tb',   pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  signet:  { bech32: 'tb',   pubKeyHash: 0x6f, scriptHash: 0xc4, wif: 0xef },
  mainnet: { bech32: 'bc',   pubKeyHash: 0x00, scriptHash: 0x05, wif: 0x80 },
}

export const NETWORK_STORAGE_KEY = 'bitcoin_network'
export const VALID_NETWORKS = ['regtest', 'testnet', 'signet', 'mainnet'] as const
export type NetworkName = typeof VALID_NETWORKS[number]

const _stored = localStorage.getItem(NETWORK_STORAGE_KEY)

export const BITCOIN_NETWORK_NAME: NetworkName =
  (VALID_NETWORKS.includes(_stored as NetworkName) ? _stored as NetworkName : null) ??
  'regtest'

export const BITCOIN_NETWORK: Network =
  NETWORKS[BITCOIN_NETWORK_NAME]

export const DEFAULT_ELECTRUM_URL = 'wss://bitcoin.grey.pw:50004'

export const DEFAULT_RELAY = 'wss://relay.damus.io'
