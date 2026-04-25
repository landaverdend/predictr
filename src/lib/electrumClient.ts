/**
 * Unified Electrum-compatible client interface.
 *
 * Two backends:
 *   ElectrumWSBackend  — raw Electrum JSON-RPC over WebSocket
 *   MempoolBackend     — mempool.space REST + WebSocket API
 *
 * Auto-selected by URL scheme:
 *   ws:// / wss://   → ElectrumWSBackend
 *   http:// / https:// → MempoolBackend
 */

import { ElectrumWS, addressToScripthash } from './electrum'
import type { ElectrumUTXO } from './electrum'

export type { ElectrumUTXO }

export type TxHistoryItem = {
  txid: string
  height: number       // 0 = unconfirmed
  blockTime?: number   // unix timestamp (mempool only)
}

export interface ElectrumClient {
  connect(): Promise<void>
  close(): void
  getBlockHeight(): Promise<number>
  getUTXOs(address: string): Promise<ElectrumUTXO[]>
  getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }>
  getTxHistory(address: string): Promise<TxHistoryItem[]>
  broadcastTx(hex: string): Promise<string>
  subscribeScripthash(scripthash: string, onChange: () => void, address?: string): Promise<string | null>
  onNotification(method: string, handler: (params: unknown) => void): void
}

// ─── ElectrumWS backend (existing) ───────────────────────────────────────────

export class ElectrumWSBackend implements ElectrumClient {
  private ws: ElectrumWS

  constructor(url: string) {
    this.ws = new ElectrumWS(url)
  }

  connect() { return this.ws.connect() }
  close() { this.ws.close() }
  getBlockHeight() { return this.ws.getBlockHeight() }
  getUTXOs(address: string) { return this.ws.getUTXOs(address) }
  getBalance(address: string) { return this.ws.getBalance(address) }
  getTxHistory(address: string) { return this.ws.getTxHistory(address) }
  broadcastTx(hex: string) { return this.ws.broadcastTx(hex) }
  onNotification(method: string, handler: (params: unknown) => void) {
    this.ws.onNotification(method, handler)
  }
  async subscribeScripthash(scripthash: string, onChange: () => void) {
    return this.ws.subscribeScripthash(scripthash, onChange)
  }
}

// ─── mempool.space backend ────────────────────────────────────────────────────

type MempoolUTXO = {
  txid: string
  vout: number
  status: { confirmed: boolean; block_height?: number }
  value: number
}

function toElectrumUTXO(u: MempoolUTXO): ElectrumUTXO {
  return {
    tx_hash: u.txid,
    tx_pos: u.vout,
    height: u.status.confirmed ? (u.status.block_height ?? 1) : 0,
    value: u.value,
  }
}

function wsUrlFromBase(base: string) {
  return base.replace(/^https:\/\//, 'wss://').replace(/^http:\/\//, 'ws://').replace(/\/api\/?$/, '/api/v1/ws')
}

export class MempoolBackend implements ElectrumClient {
  private ws: WebSocket | null = null
  private blockHandlers: Array<(params: unknown) => void> = []
  private addressHandlers = new Map<string, () => void>()
  private tracked = new Set<string>()

  constructor(private base: string) {
    this.base = base.replace(/\/$/, '')
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(wsUrlFromBase(this.base))
      this.ws.onopen = () => {
        this.ws!.send(JSON.stringify({ action: 'want', data: ['blocks'] }))
        resolve()
      }
      this.ws.onerror = () => reject(new Error(`mempool.space connect failed: ${this.base}`))
      this.ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data as string)
          if (msg.block?.height) {
            for (const h of this.blockHandlers) h([{ height: msg.block.height }])
          }
          // Address activity — fire the registered callback
          const addr: string | undefined = msg['address']
          if (addr && this.addressHandlers.has(addr)) {
            this.addressHandlers.get(addr)!()
          }
        } catch { /* ignore */ }
      }
      this.ws.onclose = () => { this.blockHandlers = []; this.addressHandlers.clear() }
    })
  }

  close() { this.ws?.close(); this.ws = null }

  onNotification(method: string, handler: (params: unknown) => void) {
    if (method === 'blockchain.headers.subscribe') this.blockHandlers.push(handler)
  }

  async getBlockHeight(): Promise<number> {
    const res = await fetch(`${this.base}/blocks/tip/height`)
    if (!res.ok) throw new Error(`mempool ${res.status}`)
    return parseInt(await res.text(), 10)
  }

  async getUTXOs(address: string): Promise<ElectrumUTXO[]> {
    const res = await fetch(`${this.base}/address/${address}/utxo`)
    if (!res.ok) throw new Error(`mempool ${res.status}`)
    const utxos: MempoolUTXO[] = await res.json()
    return utxos.map(toElectrumUTXO)
  }

  async getBalance(address: string) {
    const utxos = await this.getUTXOs(address)
    return {
      confirmed: utxos.filter(u => u.height > 0).reduce((s, u) => s + u.value, 0),
      unconfirmed: utxos.filter(u => u.height === 0).reduce((s, u) => s + u.value, 0),
    }
  }

  async getTxHistory(address: string): Promise<TxHistoryItem[]> {
    const res = await fetch(`${this.base}/address/${address}/txs`)
    if (!res.ok) throw new Error(`mempool ${res.status}`)
    const txs: Array<{ txid: string; status: { confirmed: boolean; block_height?: number; block_time?: number } }> = await res.json()
    return txs.map(tx => ({
      txid: tx.txid,
      height: tx.status.confirmed ? (tx.status.block_height ?? 1) : 0,
      blockTime: tx.status.block_time,
    }))
  }

  async broadcastTx(hex: string): Promise<string> {
    const res = await fetch(`${this.base}/tx`, { method: 'POST', body: hex })
    if (!res.ok) throw new Error(await res.text())
    return res.text()
  }

  async subscribeScripthash(_sh: string, onChange: () => void, address?: string): Promise<string | null> {
    if (address && this.ws?.readyState === WebSocket.OPEN && !this.tracked.has(address)) {
      this.tracked.add(address)
      this.addressHandlers.set(address, onChange)
      this.ws.send(JSON.stringify({ 'track-address': address }))
    }
    return null
  }
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function isMempoolUrl(url: string) {
  return url.startsWith('http://') || url.startsWith('https://')
}

export function createClient(url: string): ElectrumClient {
  return isMempoolUrl(url) ? new MempoolBackend(url) : new ElectrumWSBackend(url)
}
