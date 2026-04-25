import { useEffect, useState } from 'react'
import { useLang } from '../context/LangContext'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'
import { deriveKeys, HD_KEY_COUNT } from '../lib/hdwallet'
import { useElectrum } from '../hooks/useElectrum'
import { useWallet } from '../hooks/useWallet'
import { useTransactionHistory } from '../hooks/useTransactionHistory'
import { sendFromWallet } from '../lib/spend'
import { encryptPrivkey, getSessionKey, isWalletUnlocked, isUnencryptedPrivkey } from '../lib/pinCrypto'
import { generateMnemonic, isValidMnemonic } from '../lib/hdwallet'
import { SetPinScreen, UnlockScreen } from '../components/wallet/PinScreens'
import { SeedPhrase } from '../components/wallet/SeedPhrase'
import { ImportModal } from '../components/wallet/ImportModal'
import { SendModal } from '../components/wallet/SendModal'
import { AddressTable } from '../components/wallet/AddressTable'
import { UtxoTab } from '../components/wallet/UtxoTab'
import { TxHistory } from '../components/wallet/TxHistory'

// ── DB helpers ────────────────────────────────────────────────────────────────

/** Re-encrypt any plain-hex private keys using the active session key.
 *  This heals keys created after a network-switch (which clears db.wallet). */
async function reencryptPlainKeys(): Promise<void> {
  const sessionKey = getSessionKey()
  if (!sessionKey) return
  const allKeys = await db.wallet.toArray()
  const plain = allKeys.filter(k => isUnencryptedPrivkey(k.privkey))
  if (plain.length === 0) return
  const encrypted = await Promise.all(
    plain.map(async k => ({ ...k, privkey: await encryptPrivkey(k.privkey, sessionKey) }))
  )
  await db.wallet.bulkPut(encrypted)
}

async function getOrCreateMnemonic(): Promise<string> {
  const existing = await db.settings.get('wallet_mnemonic')
  if (existing) return existing.value as string
  const mnemonic = generateMnemonic()
  await db.settings.put({ key: 'wallet_mnemonic', value: mnemonic })
  return mnemonic
}

async function initWallet() {
  const mnemonic = await getOrCreateMnemonic()
  const count = await db.wallet.count()
  if (count === 0) await db.wallet.bulkPut(deriveKeys(mnemonic))
  return mnemonic
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PinState = 'checking' | 'setup' | 'locked' | 'unlocked'

export default function WalletPage() {
  const { t } = useLang()
  const [pinState, setPinState] = useState<PinState>('checking')
  const [mnemonic, setMnemonic] = useState<string | null>(null)
  const [showImport, setShowImport] = useState(false)
  const [showSend, setShowSend] = useState(false)
  const [generatingMore, setGeneratingMore] = useState(false)
  const [walletTab, setWalletTab] = useState<'addresses' | 'utxos' | 'history'>('addresses')

  const keys = useLiveQuery(
    () => db.wallet.toArray().then(ks => ks.sort((a, b) => Number(a.id) - Number(b.id))),
    [],
  )
  const { client } = useElectrum()
  const { allUtxos, confirmedBalance, pendingBalance, utxosByAddress, loading, fetchError, refresh } = useWallet()
  const { history, fetching: histFetching, error: histError } = useTransactionHistory(walletTab === 'history')

  const hasData = Object.keys(utxosByAddress).length > 0

  useEffect(() => {
    async function check() {
      const m = await initWallet()
      setMnemonic(m)
      const saltSetting = await db.settings.get('wallet_pin_salt')
      if (!saltSetting) setPinState('setup')
      else if (isWalletUnlocked()) {
        await reencryptPlainKeys()
        setPinState('unlocked')
      }
      else setPinState('locked')
    }
    check()
  }, [])

  async function handleImport(newMnemonic: string) {
    if (!isValidMnemonic(newMnemonic)) throw new Error('invalid mnemonic')
    const salt = await db.settings.get('wallet_pin_salt')
    const pinCheck = await db.settings.get('wallet_pin_check')
    const newKeys = deriveKeys(newMnemonic)
    await db.wallet.clear()
    if (salt && pinCheck) {
      const sessionKey = getSessionKey()
      if (!sessionKey) throw new Error('wallet locked — unlock before importing')
      const encrypted = await Promise.all(
        newKeys.map(async k => ({ ...k, privkey: await encryptPrivkey(k.privkey, sessionKey) }))
      )
      await db.wallet.bulkPut(encrypted)
    } else {
      await db.wallet.bulkPut(newKeys)
    }
    await db.settings.put({ key: 'wallet_mnemonic', value: newMnemonic })
    setMnemonic(newMnemonic)
  }

  async function handleGenerateMore() {
    if (!mnemonic || !keys) return
    setGeneratingMore(true)
    try {
      const newKeys = deriveKeys(mnemonic, 10, keys.length)
      const saltSetting = await db.settings.get('wallet_pin_salt')
      if (saltSetting) {
        const sessionKey = getSessionKey()
        if (!sessionKey) throw new Error('wallet locked')
        const encrypted = await Promise.all(
          newKeys.map(async k => ({ ...k, privkey: await encryptPrivkey(k.privkey, sessionKey) }))
        )
        await db.wallet.bulkPut(encrypted)
      } else {
        await db.wallet.bulkPut(newKeys)
      }
    } finally {
      setGeneratingMore(false)
    }
  }

  async function handleSend(toAddress: string, amountSats: number) {
    if (!client) throw new Error('electrum not connected')
    const changeAddr = keys?.[0]?.address
    if (!changeAddr) throw new Error('no wallet keys')
    return sendFromWallet(allUtxos(), toAddress, amountSats, changeAddr, client)
  }

  // ── PIN gate ───────────────────────────────────────────────────────────────

  if (pinState === 'checking') return (
    <main className="flex-1 flex items-center justify-center">
      <p className="text-sm text-ink/30">loading…</p>
    </main>
  )
  if (pinState === 'setup') return <SetPinScreen onDone={() => setPinState('unlocked')} />
  if (pinState === 'locked') return <UnlockScreen onDone={() => { reencryptPlainKeys(); setPinState('unlocked') }} />

  // ── Unlocked ───────────────────────────────────────────────────────────────

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl mx-auto w-full space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold mb-1">wallet</h1>
          <div className="flex items-center gap-2">
            <p className="text-ink/40 text-sm">{keys?.length ?? HD_KEY_COUNT} addresses · BIP86 Taproot</p>
            <button
              onClick={refresh}
              disabled={loading}
              className={`text-ink/30 hover:text-ink/60 transition-colors disabled:opacity-30 ${loading ? 'animate-spin' : ''}`}
              title="refresh"
            >↻</button>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1.5">
          <p className="text-[10px] text-ink/30 uppercase tracking-wider">total balance</p>
          {loading && confirmedBalance === 0 ? (
            <div className="flex flex-col items-end gap-1.5">
              <div className="h-7 w-28 rounded bg-ink/10 animate-pulse" />
              <div className="h-3 w-16 rounded bg-ink/8 animate-pulse" />
            </div>
          ) : (
            <>
              <p className="text-xl sm:text-2xl font-mono font-semibold text-positive leading-none">
                {confirmedBalance > 0 ? confirmedBalance.toLocaleString() : '—'}
              </p>
              {confirmedBalance > 0 && <p className="text-xs text-positive/60">sats confirmed</p>}
              {pendingBalance > 0 && (
                <p className="text-xs font-mono text-amber-400/80">+{pendingBalance.toLocaleString()} pending</p>
              )}
              {confirmedBalance > 0 && (
                <button
                  onClick={() => setShowSend(true)}
                  className="text-xs px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light transition-all"
                >send</button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2.5 bg-caution/5 border border-caution/20 rounded-xl px-4 py-3.5">
        <span className="text-caution mt-0.5 shrink-0 leading-none">⚠</span>
        <p className="text-xs text-caution/80 leading-relaxed">{t('disclaimer.hot_wallet')}</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-ink/10">
        {(['addresses', 'utxos', 'history'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setWalletTab(tab)}
            className={`px-4 py-2 text-sm transition-colors border-b-2 -mb-px ${walletTab === tab ? 'border-brand text-ink' : 'border-transparent text-ink/40 hover:text-ink/70'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {walletTab === 'addresses' && (
        <>
          {keys && keys.length > 0
            ? <AddressTable keys={keys} utxosByAddress={utxosByAddress} hasData={hasData} loading={loading} />
            : <div className="text-center text-ink/30 text-sm py-20">initializing wallet…</div>
          }
          {mnemonic && <SeedPhrase mnemonic={mnemonic} />}
          {fetchError && (
            <p className="text-xs text-negative bg-negative/5 border border-negative/20 rounded-lg px-4 py-3">
              balance fetch failed: {fetchError}
            </p>
          )}
          <div className="flex items-center gap-3">
            <p className="text-xs text-ink/25 flex-1">private keys encrypted at rest · AES-256-GCM</p>
            <button
              onClick={handleGenerateMore}
              disabled={generatingMore || !mnemonic}
              className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors shrink-0 disabled:opacity-30"
            >
              {generatingMore ? 'generating…' : '+10 addresses'}
            </button>
            <button
              onClick={() => setShowImport(true)}
              className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors shrink-0"
            >
              import
            </button>
          </div>
        </>
      )}

      {walletTab === 'utxos' && (
        <UtxoTab
          utxos={allUtxos()}
          loading={loading}
          electrum={client}
          onConsolidated={refresh}
        />
      )}

      {walletTab === 'history' && (
        <TxHistory history={history} fetching={histFetching} error={histError} />
      )}

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showSend && <SendModal totalBalance={confirmedBalance} onSend={handleSend} onClose={() => setShowSend(false)} />}
    </main>
  )
}
