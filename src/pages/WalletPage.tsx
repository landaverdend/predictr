import { useEffect, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { p2tr, utils } from '@scure/btc-signer'
import { db, type WalletKey } from '../db'
import { REGTEST } from '../lib/contract'
import { randomHex } from '../lib/market'
import { useElectrum } from '../hooks/useElectrum'

function generateKey(): WalletKey {
  const privkey = utils.randomPrivateKeyBytes()
  const pubkey = utils.pubSchnorr(privkey)
  const { address } = p2tr(pubkey, undefined, REGTEST)
  const toHex = (b: Uint8Array) => Array.from(b).map(x => x.toString(16).padStart(2, '0')).join('')
  return {
    id: randomHex(8),
    privkey: toHex(privkey),
    pubkey: toHex(pubkey),
    address: address!,
    createdAt: Date.now(),
  }
}

function KeyRow({ walletKey, balance }: { walletKey: WalletKey; balance: number | undefined }) {
  return (
    <tr className="border-t border-white/5 hover:bg-white/[0.02] transition-colors">
      <td className="px-4 py-3 font-mono text-xs text-white/70 break-all">{walletKey.address}</td>
      <td className="px-4 py-3 font-mono text-xs text-white/70 text-right whitespace-nowrap">
        {balance === undefined ? <span className="text-white/20">…</span> : `${balance.toLocaleString()} sats`}
      </td>
      <td className="px-4 py-3 font-mono text-xs text-white/30 text-right whitespace-nowrap">
        {new Date(walletKey.createdAt).toLocaleDateString()}
      </td>
    </tr>
  )
}

export default function WalletPage() {
  const keys = useLiveQuery(() => db.wallet.toArray().then(ks => ks.sort((a, b) => b.createdAt - a.createdAt)), [])
  const { clientRef, ready } = useElectrum()
  const [balances, setBalances] = useState<Record<string, number>>({})

  useEffect(() => {
    if (!keys?.length || !ready) return
    const client = clientRef.current
    if (!client) return

    keys.forEach(async k => {
      try {
        const { confirmed, unconfirmed } = await client.getBalance(k.address)
        setBalances(prev => ({ ...prev, [k.address]: confirmed + unconfirmed }))
      } catch { /* ignore */ }
    })
  }, [keys, ready])

  function handleGenerate() {
    db.wallet.put(generateKey())
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">wallet</h1>
          <p className="text-white/40 text-sm">in-app bitcoin keypairs for signing contracts</p>
        </div>
        <button
          onClick={handleGenerate}
          className="px-4 py-2 text-sm font-medium bg-white text-black rounded-lg hover:bg-white/90 transition-colors"
        >
          + new address
        </button>
      </div>

      {keys === undefined && (
        <p className="text-xs text-white/30">loading…</p>
      )}

      {keys?.length === 0 && (
        <div className="border border-white/10 rounded-xl p-10 text-center text-white/30 text-sm">
          no addresses yet — generate one to get started
        </div>
      )}

      {keys && keys.length > 0 && (
        <div className="border border-white/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-white/5">
                <th className="px-4 py-2.5 text-left text-xs text-white/30 uppercase tracking-wider font-normal">address</th>
                <th className="px-4 py-2.5 text-right text-xs text-white/30 uppercase tracking-wider font-normal">balance</th>
                <th className="px-4 py-2.5 text-right text-xs text-white/30 uppercase tracking-wider font-normal">created</th>
              </tr>
            </thead>
            <tbody>
              {keys.map(k => <KeyRow key={k.id} walletKey={k} balance={balances[k.address]} />)}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs text-red-400/50">
        private keys stored unencrypted in IndexedDB — regtest only
      </p>
    </main>
  )
}
