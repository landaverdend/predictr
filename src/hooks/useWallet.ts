import { useState, useEffect, useRef } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Address, OutScript } from '@scure/btc-signer'
import { toast } from 'sonner'
import { db, type WalletKey } from '../db'
import type { ElectrumUTXO } from '../lib/electrumClient'
import { addressToScripthash } from '../lib/electrum'
import { useElectrum } from './useElectrum'
import { REGTEST } from '../lib/contract'

export type WalletUTXO = {
  utxo: ElectrumUTXO
  key: WalletKey
  script: Uint8Array
}

export function useWallet() {
  const keys = useLiveQuery(() => db.wallet.toArray(), [])
  const { client } = useElectrum()
  const [utxosByAddress, setUtxosByAddress] = useState<Record<string, ElectrumUTXO[]>>({})
  const [loading, setLoading] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [tick, setTick] = useState(0)

  // Track previously seen tx_hashes to detect newly arrived UTXOs
  const seenTxids = useRef<Set<string>>(new Set())
  // Whether this is the initial load (don't toast on first fetch)
  const initialLoad = useRef(true)

  function refresh() { setTick(t => t + 1) }

  // Fetch UTXOs for all keys, subscribe to changes
  useEffect(() => {
    if (!keys?.length || !client) return

    setLoading(true)
    setFetchError(null)

    async function fetchAll() {
      const results = await Promise.all(keys!.map(async k => {
        try {
          const utxos = await client!.getUTXOs(k.address)
          return [k.address, utxos] as const
        } catch (e) {
          console.warn('getUTXOs failed for', k.address, e)
          return [k.address, [] as ElectrumUTXO[]] as const
        }
      }))

      const byAddr = Object.fromEntries(results)

      // Detect new incoming UTXOs and fire toasts
      if (!initialLoad.current) {
        for (const [addr, utxos] of Object.entries(byAddr)) {
          for (const utxo of utxos) {
            const key = `${utxo.tx_hash}:${utxo.tx_pos}`
            if (!seenTxids.current.has(key)) {
              const pending = utxo.height === 0
              toast.success(
                `${pending ? 'Incoming transaction' : 'Transaction confirmed'}: +${utxo.value.toLocaleString()} sats`,
                { description: addr.slice(0, 14) + '…' + addr.slice(-8) }
              )
            }
          }
        }
      }

      // Update seen set
      for (const utxos of Object.values(byAddr)) {
        for (const u of utxos) {
          seenTxids.current.add(`${u.tx_hash}:${u.tx_pos}`)
        }
      }

      initialLoad.current = false
      setUtxosByAddress(byAddr)
      setLoading(false)
    }

    fetchAll().catch(e => {
      console.error('wallet fetch failed', e)
      setFetchError(e instanceof Error ? e.message : String(e))
      setLoading(false)
    })
  }, [keys, client, tick])

  // Subscribe to scripthash changes so wallet updates in real time
  useEffect(() => {
    if (!keys?.length || !client) return

    let cancelled = false

    async function subscribe() {
      for (const k of keys!) {
        try {
          const sh = await addressToScripthash(k.address)
          await client!.subscribeScripthash(sh, () => {
            if (!cancelled) refresh()
          }, k.address)
        } catch (e) {
          console.warn('scripthash subscribe failed for', k.address, e)
        }
      }
    }

    subscribe()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [keys, client])

  function allUtxos(): WalletUTXO[] {
    if (!keys) return []
    return keys.flatMap(key => {
      const script = OutScript.encode(Address(REGTEST).decode(key.address))
      return (utxosByAddress[key.address] ?? []).map(utxo => ({ utxo, key, script }))
    })
  }

  function pickUtxo(required: number): WalletUTXO | null {
    const eligible = allUtxos().filter(w => w.utxo.value >= required + 2000 && w.utxo.height > 0)
    if (!eligible.length) return null
    return eligible.sort((a, b) => a.utxo.value - b.utxo.value)[0]
  }

  const confirmedBalance = Object.values(utxosByAddress).flat().filter(u => u.height > 0).reduce((s, u) => s + u.value, 0)
  const pendingBalance = Object.values(utxosByAddress).flat().filter(u => u.height === 0).reduce((s, u) => s + u.value, 0)
  const totalBalance = confirmedBalance + pendingBalance

  return { keys: keys ?? [], utxosByAddress, allUtxos, pickUtxo, confirmedBalance, pendingBalance, totalBalance, loading, fetchError, refresh }
}
