const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l'

function convertBits(data: number[], from: number, to: number, pad: boolean): Uint8Array {
  let acc = 0, bits = 0
  const result: number[] = []
  const maxv = (1 << to) - 1
  for (const value of data) {
    acc = (acc << from) | value
    bits += from
    while (bits >= to) {
      bits -= to
      result.push((acc >> bits) & maxv)
    }
  }
  if (pad && bits > 0) result.push((acc << (to - bits)) & maxv)
  return new Uint8Array(result)
}

export async function addressToScripthash(address: string): Promise<string> {
  const lower = address.toLowerCase()
  const sep = lower.lastIndexOf('1')
  if (sep < 1) throw new Error('invalid bech32 address')

  const data5 = lower.slice(sep + 1, -6).split('').map(c => CHARSET.indexOf(c))
  if (data5.some(v => v < 0)) throw new Error('invalid bech32 character')

  const version = data5[0]
  const program = convertBits(data5.slice(1), 5, 8, false)

  // scriptPubKey: OP_0/OP_1 <push> <witness program>
  const script = new Uint8Array(2 + program.length)
  script[0] = version === 0 ? 0x00 : 0x50 + version   // OP_0 or OP_1..OP_16
  script[1] = program.length                            // direct push (20 or 32)
  script.set(program, 2)

  const hashBuf = await crypto.subtle.digest('SHA-256', script)
  const reversed = new Uint8Array(hashBuf).reverse()
  return Array.from(reversed).map(b => b.toString(16).padStart(2, '0')).join('')
}

export type ElectrumUTXO = {
  tx_hash: string
  tx_pos: number
  value: number      // sats
  height: number
}

type Pending = {
  resolve: (v: unknown) => void
  reject: (e: Error) => void
}

type NotificationHandler = (params: unknown) => void

export class ElectrumWS {
  private ws: WebSocket | null = null
  private pending = new Map<number, Pending>()
  private notifications = new Map<string, NotificationHandler>()
  // per-scripthash change callbacks (keyed by scripthash hex)
  private scripthashHandlers = new Map<string, () => void>()
  private id = 1

  constructor(private url: string) { }

  onNotification(method: string, handler: NotificationHandler) {
    this.notifications.set(method, handler)
  }

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error(`failed to connect to ${this.url}`))

      this.ws.onmessage = e => {
        try {
          String(e.data).split('\n').filter(Boolean).forEach(line => {
            const msg = JSON.parse(line)
            // Push notification (no id, has method)
            if (msg.method && msg.id === undefined) {
              // Route per-scripthash notifications
              if (msg.method === 'blockchain.scripthash.subscribe' && Array.isArray(msg.params)) {
                const [sh] = msg.params
                this.scripthashHandlers.get(sh)?.()
              }
              this.notifications.get(msg.method)?.(msg.params)
              return
            }
            const p = this.pending.get(msg.id)
            if (!p) return
            this.pending.delete(msg.id)
            msg.error ? p.reject(new Error(msg.error.message ?? String(msg.error))) : p.resolve(msg.result)
          })
        } catch { /* malformed frame */ }
      }

      this.ws.onclose = () => {
        for (const p of this.pending.values()) p.reject(new Error('connection closed'))
        this.pending.clear()
        this.scripthashHandlers.clear()
      }
    })
  }

  /** Subscribe to status changes for a scripthash. Returns the initial status hash (or null). */
  async subscribeScripthash(scripthash: string, onChange: () => void): Promise<string | null> {
    this.scripthashHandlers.set(scripthash, onChange)
    return this.request<string | null>('blockchain.scripthash.subscribe', [scripthash])
  }

  private request<T>(method: string, params: unknown[]): Promise<T> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('electrum not connected'))
        return
      }
      const id = this.id++
      this.pending.set(id, { resolve: resolve as (v: unknown) => void, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
    })
  }

  async getUTXOs(address: string): Promise<ElectrumUTXO[]> {
    const scripthash = await addressToScripthash(address)
    return this.request('blockchain.scripthash.listunspent', [scripthash])
  }

  async getTxHistory(address: string): Promise<{ txid: string; height: number }[]> {
    const scripthash = await addressToScripthash(address)
    const items = await this.request<{ tx_hash: string; height: number }[]>('blockchain.scripthash.get_history', [scripthash])
    return items.map(i => ({ txid: i.tx_hash, height: i.height }))
  }

  async getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }> {
    const scripthash = await addressToScripthash(address)
    return this.request('blockchain.scripthash.get_balance', [scripthash])
  }

  async broadcastTx(hex: string): Promise<string> {
    return this.request('blockchain.transaction.broadcast', [hex])
  }

  async getBlockHeight(): Promise<number> {
    const result = await this.request<{ height: number }>('blockchain.headers.subscribe', [])
    return result.height
  }

  /**
   * Returns the estimated fee rate in sat/vbyte for confirmation within 2 blocks.
   * `blockchain.estimatefee` returns BTC/kB; multiply by 1e5 to get sat/vbyte.
   * Falls back to 1 sat/vbyte if the node can't estimate (e.g. on regtest).
   */
  async getFeeRate(): Promise<number> {
    try {
      const btcPerKb = await this.request<number>('blockchain.estimatefee', [2])
      if (btcPerKb > 0) return Math.max(1, Math.ceil(btcPerKb * 1e5))
    } catch { /* ignore */ }
    return 1
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}
