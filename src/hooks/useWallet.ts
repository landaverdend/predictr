import { useState, useEffect } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Address, OutScript } from '@scure/btc-signer'
import { db, type WalletKey } from '../db'
import type { ElectrumUTXO } from '../lib/electrum'
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
  const [tick, setTick] = useState(0)

  function refresh() { setTick(t => t + 1) }

  useEffect(() => {
    if (!keys?.length || !client) return

    setLoading(true)
    Promise.all(keys.map(async k => {
      const utxos = await client.getUTXOs(k.address)
      return [k.address, utxos] as const
    })).then(results => {
      setUtxosByAddress(Object.fromEntries(results))
      setLoading(false)
    })
  }, [keys, client, tick])

  function allUtxos(): WalletUTXO[] {
    if (!keys) return []
    return keys.flatMap(key => {
      const script = OutScript.encode(Address(REGTEST).decode(key.address))
      return (utxosByAddress[key.address] ?? []).map(utxo => ({ utxo, key, script }))
    })
  }

  function pickUtxo(required: number): WalletUTXO | null {
    const eligible = allUtxos().filter(w => w.utxo.value >= required + 2000)
    if (!eligible.length) return null
    return eligible.sort((a, b) => a.utxo.value - b.utxo.value)[0]
  }

  const totalBalance = Object.values(utxosByAddress).flat().reduce((s, u) => s + u.value, 0)

  return { keys: keys ?? [], utxosByAddress, allUtxos, pickUtxo, totalBalance, loading, refresh }
}
