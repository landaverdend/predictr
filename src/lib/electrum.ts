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

async function addressToScripthash(address: string): Promise<string> {
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

export class ElectrumWS {
  private ws: WebSocket | null = null
  private pending = new Map<number, Pending>()
  private id = 1

  constructor(private url: string) {}

  connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url)

      this.ws.onopen = () => resolve()
      this.ws.onerror = () => reject(new Error(`failed to connect to ${this.url}`))

      this.ws.onmessage = e => {
        try {
          // electrum sends newline-delimited JSON; may get multiple per frame
          String(e.data).split('\n').filter(Boolean).forEach(line => {
            const msg = JSON.parse(line)
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
      }
    })
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

  async getBalance(address: string): Promise<{ confirmed: number; unconfirmed: number }> {
    const scripthash = await addressToScripthash(address)
    return this.request('blockchain.scripthash.get_balance', [scripthash])
  }

  async broadcastTx(hex: string): Promise<string> {
    return this.request('blockchain.transaction.broadcast', [hex])
  }

  close() {
    this.ws?.close()
    this.ws = null
  }
}
