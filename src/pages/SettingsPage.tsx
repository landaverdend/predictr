import { useEffect, useState } from 'react'
import { useNostrUser } from '../hooks/useNostrUser'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext } from '../context/ElectrumContext'
import { DEFAULT_RELAY, BITCOIN_NETWORK_NAME, NETWORK_STORAGE_KEY, VALID_NETWORKS, type NetworkName } from '../lib/config'
import { db } from '../db'
import {
  getNostr,
  getSignerMode,
  getStoredBunker,
  connectBunker,
  disconnectBunker,
} from '../lib/signer'

type PingStatus = 'checking' | 'ok' | 'fail'

function pingRelay(url: string): Promise<boolean> {
  return new Promise(resolve => {
    let settled = false
    const done = (v: boolean) => { if (!settled) { settled = true; resolve(v) } }
    const timeout = setTimeout(() => { done(false); try { ws.close() } catch {} }, 4000)
    let ws: WebSocket
    try {
      ws = new WebSocket(url)
      ws.onopen = () => { clearTimeout(timeout); done(true); ws.close() }
      ws.onerror = () => { clearTimeout(timeout); done(false) }
    } catch { done(false) }
  })
}

function RelayManager() {
  const { relays, saveRelays } = useRelayContext()
  const [draft, setDraft] = useState<string[]>(relays)
  const [editingIdx, setEditingIdx] = useState<number | null>(null)
  const [savedValue, setSavedValue] = useState('')   // for escape-to-cancel
  const [input, setInput] = useState('')
  const [saving, setSaving] = useState(false)
  const [importMsg, setImportMsg] = useState('')
  const [pingStatus, setPingStatus] = useState<Record<string, PingStatus>>({})


  useEffect(() => { setDraft(relays) }, [relays.join(',')])

  // ping each url in the draft whenever the list changes
  useEffect(() => {
    draft.forEach(url => {
      if (!url.startsWith('ws')) return
      setPingStatus(prev => ({ ...prev, [url]: 'checking' }))
      pingRelay(url).then(ok =>
        setPingStatus(prev => ({ ...prev, [url]: ok ? 'ok' : 'fail' }))
      )
    })
  }, [draft.join(',')])

  const isDirty = draft.join(',') !== relays.join(',')

  function handleResetToDefault() {
    setDraft(prev => [...new Set([...prev, DEFAULT_RELAY])])
  }

  async function handleImportFromExtension() {
    const nostr = getNostr()
    if (!nostr?.getRelays) {
      setImportMsg('extension does not support getRelays')
      setTimeout(() => setImportMsg(''), 3000)
      return
    }
    try {
      const map = await nostr.getRelays!()
      const urls = Object.keys(map).filter(url => { try { return Boolean(new URL(url).hostname) } catch { return false } })
      if (urls.length) {
        setDraft(prev => {
          const next = [...new Set([...prev, ...urls])]
          const added = next.length - prev.length
          setImportMsg(added > 0 ? `imported ${added} relay${added > 1 ? 's' : ''}` : 'no new relays found')
          setTimeout(() => setImportMsg(''), 3000)
          return next
        })
      } else {
        setImportMsg('no relays found in extension')
        setTimeout(() => setImportMsg(''), 3000)
      }
    } catch {
      setImportMsg('import failed')
      setTimeout(() => setImportMsg(''), 3000)
    }
  }

  function handleAdd() {
    const url = input.trim()
    if (!url || draft.includes(url)) return
    setDraft(prev => [...prev, url])
    setInput('')
  }

  function handleRemove(idx: number) {
    setDraft(prev => prev.filter((_, i) => i !== idx))
    if (editingIdx === idx) setEditingIdx(null)
  }

  function startEdit(idx: number) {
    setEditingIdx(idx)
    setSavedValue(draft[idx])
  }

  function commitEdit(idx: number) {
    const url = draft[idx].trim()
    if (!url) setDraft(prev => prev.map((r, i) => i === idx ? savedValue : r))
    setEditingIdx(null)
  }

  async function handleSave() {
    setSaving(true)
    try { await saveRelays(draft) } finally { setSaving(false) }
  }

  const PING_DOT: Record<PingStatus, string> = {
    checking: 'bg-caution animate-pulse',
    ok:       'bg-positive',
    fail:     'bg-negative',
  }

  return (
    <div className="p-5 space-y-4">
      <div className="space-y-1.5">
        {draft.map((url, idx) => {
          const status = pingStatus[url]
          return (
            <div key={idx} className="flex items-center gap-2 bg-elevated rounded-lg px-3 py-2">
              {status && (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PING_DOT[status]}`} />
              )}
              {editingIdx === idx ? (
                <input
                  autoFocus
                  type="text"
                  value={url}
                  onChange={e => setDraft(prev => prev.map((r, i) => i === idx ? e.target.value : r))}
                  onBlur={() => commitEdit(idx)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') commitEdit(idx)
                    if (e.key === 'Escape') {
                      setDraft(prev => prev.map((r, i) => i === idx ? savedValue : r))
                      setEditingIdx(null)
                    }
                  }}
                  className="flex-1 bg-transparent text-sm font-mono text-ink/90 focus:outline-none"
                />
              ) : (
                <button
                  onClick={() => startEdit(idx)}
                  className="flex-1 text-left text-sm font-mono text-ink/70 hover:text-ink/90 transition-colors truncate"
                >
                  {url}
                </button>
              )}
              <button
                onClick={() => handleRemove(idx)}
                className="text-ink/20 hover:text-negative transition-colors text-lg leading-none shrink-0"
              >
                ×
              </button>
            </div>
          )
        })}
        {draft.length === 0 && (
          <p className="text-xs text-ink/30">no relays configured</p>
        )}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={handleResetToDefault}
          className="text-xs text-ink/40 hover:text-ink/70 underline transition-colors"
        >
          add default relay
        </button>
        <button
          onClick={handleImportFromExtension}
          className="text-xs text-ink/40 hover:text-ink/70 underline transition-colors"
        >
          import from extension
        </button>
        {importMsg && (
          <span className="text-xs text-ink/40">{importMsg}</span>
        )}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="wss://relay.example.com"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 min-w-0 bg-elevated border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="shrink-0 px-4 py-2.5 text-sm border border-ink/20 rounded-lg hover:bg-ink/5 disabled:opacity-30 transition-colors"
        >
          add
        </button>
      </div>

      <div className="flex justify-end pt-1 border-t border-ink/5">
        <button
          onClick={handleSave}
          disabled={!isDirty || saving}
          className="px-5 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>
    </div>
  )
}

function BunkerManager() {
  const stored = getStoredBunker()
  const mode = getSignerMode()
  const [uri, setUri] = useState('')
  const [status, setStatus] = useState<'idle' | 'connecting' | 'error'>('idle')
  const [error, setError] = useState('')
  const [, forceUpdate] = useState(0)

  async function handleConnect() {
    if (!uri.trim()) return
    setStatus('connecting')
    setError('')
    try {
      await connectBunker(uri.trim())
      setUri('')
      setStatus('idle')
      forceUpdate(n => n + 1)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'connection failed')
      setStatus('idle')
    }
  }

  function handleDisconnect() {
    disconnectBunker()
    forceUpdate(n => n + 1)
  }

  return (
    <div className="p-5 space-y-4">
      {mode === 'bunker' && stored ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-positive shrink-0" />
            <p className="text-sm text-ink/70">connected to bunker</p>
          </div>
          <p className="text-[11px] font-mono text-ink/30 break-all">{stored.bp.pubkey}</p>
          <p className="text-[11px] text-ink/30">{stored.bp.relays.join(', ')}</p>
          <button
            onClick={handleDisconnect}
            className="text-xs text-negative border border-negative/30 rounded-lg px-4 py-2 hover:bg-negative/5 transition-colors"
          >
            disconnect bunker
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-ink/50">
            Connect a NIP-46 remote signer (Amber, nsecBunker, etc.) as an alternative to a browser extension.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="bunker://<pubkey>?relay=wss://..."
              value={uri}
              onChange={e => { setUri(e.target.value); setError('') }}
              onKeyDown={e => e.key === 'Enter' && handleConnect()}
              className="flex-1 min-w-0 bg-elevated border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
            />
            <button
              onClick={handleConnect}
              disabled={!uri.trim() || status === 'connecting'}
              className="shrink-0 px-4 py-2.5 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              {status === 'connecting' ? 'connecting…' : 'connect'}
            </button>
          </div>
          {error && <p className="text-xs text-negative">{error}</p>}
        </div>
      )}
    </div>
  )
}

const MEMPOOL_URLS: Record<string, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  signet:  'https://mempool.space/signet/api',
  regtest: '',
}

const ELECTRUM_WS_DEFAULTS: Record<string, string> = {
  regtest: 'ws://nigiri.kratom.io:5050/electrum',
  testnet: 'wss://blackie.c3-soft.com:50004',
  signet:  '',   // no public signet Electrum WS — user must supply their own
  mainnet: 'wss://electrum.blockstream.info:50004',
}

function ElectrumManager() {
  const { url, saveUrl, error } = useElectrumContext()
  const [draft, setDraft] = useState(url)
  const [saving, setSaving] = useState(false)
  const [pingStatus, setPingStatus] = useState<PingStatus | null>(null)

  const isWS = draft.startsWith('ws')

  useEffect(() => { setDraft(url) }, [url])

  useEffect(() => {
    if (!isWS) { setPingStatus(null); return }
    setPingStatus('checking')
    pingRelay(draft).then(ok => setPingStatus(ok ? 'ok' : 'fail'))
  }, [draft, isWS])

  const isDirty = draft !== url
  const mempoolDefault = MEMPOOL_URLS[BITCOIN_NETWORK_NAME] ?? ''

  async function handleSave(override?: string) {
    const val = override ?? draft
    setSaving(true)
    try { await saveUrl(val) } finally { setSaving(false) }
  }

  function switchToMempool() {
    if (!mempoolDefault) return
    setDraft(mempoolDefault)
    handleSave(mempoolDefault)
  }

  const wsDefault = ELECTRUM_WS_DEFAULTS[BITCOIN_NETWORK_NAME] ?? ''

  function switchToElectrum() {
    setDraft(wsDefault)
    if (wsDefault) handleSave(wsDefault)
  }

  const PING_DOT: Record<PingStatus, string> = {
    checking: 'bg-caution animate-pulse',
    ok:       'bg-positive',
    fail:     'bg-negative',
  }

  const activeBackend = isWS ? 'electrum' : 'mempool'

  return (
    <div className="p-5 space-y-4">
      {/* Backend toggle */}
      <div className="flex rounded-lg border border-ink/10 overflow-hidden text-xs w-fit">
        <button
          onClick={switchToElectrum}
          className={`px-4 py-2 transition-colors ${activeBackend === 'electrum' ? 'bg-ink/10 text-ink/80' : 'text-ink/35 hover:text-ink/60'}`}
        >
          Electrum WS
        </button>
        <button
          onClick={switchToMempool}
          disabled={!mempoolDefault}
          className={`px-4 py-2 transition-colors disabled:opacity-30 disabled:cursor-not-allowed ${activeBackend === 'mempool' ? 'bg-ink/10 text-ink/80' : 'text-ink/35 hover:text-ink/60'}`}
        >
          mempool.space
        </button>
      </div>

      {/* URL input */}
      <div className="flex items-center gap-2 bg-elevated rounded-lg px-3 py-2">
        {pingStatus && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PING_DOT[pingStatus]}`} />
        )}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && isDirty && handleSave()}
          placeholder={isWS ? (wsDefault || 'wss://your-electrum-server:50004') : (mempoolDefault || 'https://mempool.space/api')}
          className="flex-1 bg-transparent text-sm font-mono text-ink/90 placeholder-ink/20 focus:outline-none"
        />
      </div>

      {error && <p className="text-xs text-negative font-mono">{error}</p>}

      <div className="flex justify-end pt-1 border-t border-ink/5">
        <button
          onClick={() => handleSave()}
          disabled={!isDirty || saving}
          className="px-5 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {saving ? 'saving…' : 'save'}
        </button>
      </div>
    </div>
  )
}

const NETWORK_LABELS: Record<NetworkName, string> = {
  regtest: 'regtest',
  testnet: 'testnet4',
  signet:  'signet',
  mainnet: 'mainnet',
}

// Default Electrum WS URL per network — kept in sync with ElectrumManager
const NETWORK_ELECTRUM_DEFAULTS: Record<NetworkName, string> = {
  regtest: 'ws://nigiri.kratom.io:5050/electrum',
  testnet: 'wss://blackie.c3-soft.com:50004',
  signet:  '',
  mainnet: 'wss://electrum.blockstream.info:50004',
}

const NETWORK_MEMPOOL_DEFAULTS: Record<NetworkName, string> = {
  mainnet: 'https://mempool.space/api',
  testnet: 'https://mempool.space/testnet4/api',
  signet:  'https://mempool.space/signet/api',
  regtest: '',
}

function NetworkSwitcher() {
  const [selected, setSelected] = useState<NetworkName>(BITCOIN_NETWORK_NAME)
  const [switching, setSwitching] = useState(false)

  const isDirty = selected !== BITCOIN_NETWORK_NAME

  async function handleSwitch() {
    if (!isDirty) return
    const confirmed = confirm(
      `Switch to ${NETWORK_LABELS[selected]}?\n\nYour wallet addresses will be re-derived for the new network. Cached UTXOs and transaction history will be cleared. Open contracts will remain but may reference the wrong network.`
    )
    if (!confirmed) { setSelected(BITCOIN_NETWORK_NAME); return }

    setSwitching(true)

    // Save new network
    localStorage.setItem(NETWORK_STORAGE_KEY, selected)

    // Update Electrum URL to the new network's default (prefer WS, fall back to mempool)
    const newElectrum = NETWORK_ELECTRUM_DEFAULTS[selected] || NETWORK_MEMPOOL_DEFAULTS[selected]
    if (newElectrum) await db.settings.put({ key: 'electrum_url', value: newElectrum })

    // Clear network-specific wallet data
    await db.wallet.clear()
    await db.transactions.clear()

    window.location.reload()
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex flex-wrap gap-2">
        {VALID_NETWORKS.map(net => (
          <button
            key={net}
            onClick={() => setSelected(net)}
            className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
              selected === net
                ? 'border-brand bg-brand/10 text-brand'
                : 'border-ink/10 text-ink/40 hover:text-ink/70 hover:border-ink/25'
            }`}
          >
            {NETWORK_LABELS[net]}
            {net === BITCOIN_NETWORK_NAME && selected !== net && (
              <span className="ml-1.5 text-[10px] text-ink/30">(current)</span>
            )}
          </button>
        ))}
      </div>
      {isDirty && (
        <p className="text-xs text-caution/80">
          Switching networks will re-derive wallet addresses and clear cached UTXOs.
        </p>
      )}
      <div className="flex justify-end pt-1 border-t border-ink/5">
        <button
          onClick={handleSwitch}
          disabled={!isDirty || switching}
          className="px-5 py-2 text-sm font-medium bg-brand text-white rounded-lg hover:bg-brand-light disabled:opacity-30 disabled:cursor-not-allowed transition-all"
        >
          {switching ? 'switching…' : 'switch network'}
        </button>
      </div>
    </div>
  )
}

export default function SettingsPage() {
  const user = useNostrUser()

  async function handleClearData() {
    if (!confirm('Clear all local data? This deletes your contracts, wallet keys, and cached markets.')) return
    await db.delete()
    window.location.reload()
  }

  return (
    <main className="flex-1 px-4 sm:px-6 py-10 max-w-2xl mx-auto w-full space-y-8">
      <div>
        <h1 className="text-2xl font-bold mb-1">settings</h1>
        <p className="text-ink/40 text-sm">app configuration and account</p>
      </div>

      {/* Nostr identity */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">nostr identity</p>
        </div>
        <div className="p-5 space-y-4">
          {user ? (
            <div className="flex items-center gap-4">
              {user.profile?.picture ? (
                <img
                  src={user.profile.picture}
                  alt={user.profile.name ?? user.pubkey.slice(0, 8)}
                  className="w-12 h-12 rounded-full object-cover ring-2 ring-brand/20"
                />
              ) : (
                <div className="w-12 h-12 rounded-full bg-brand/10 ring-2 ring-brand/20 flex items-center justify-center shrink-0">
                  <span className="text-sm font-mono text-brand">{user.pubkey.slice(0, 2)}</span>
                </div>
              )}
              <div className="min-w-0">
                {user.profile?.name && (
                  <p className="font-medium truncate">{user.profile.name}</p>
                )}
                {user.profile?.about && (
                  <p className="text-xs text-ink/50 mt-0.5 line-clamp-2">{user.profile.about}</p>
                )}
                <p className="text-[10px] font-mono text-ink/30 mt-1 break-all">{user.pubkey}</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-ink/40">no nostr extension found — install Alby or nos2x</p>
          )}
        </div>
      </section>

      {/* Bunker */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">remote signer (NIP-46)</p>
        </div>
        <BunkerManager />
      </section>

      {/* Relays */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">relays</p>
        </div>
        <RelayManager />
      </section>

      {/* Electrum / mempool */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">bitcoin backend</p>
        </div>
        <ElectrumManager />
      </section>

      {/* Network */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5 flex items-center justify-between">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">bitcoin network</p>
          <span className="text-[10px] font-mono text-ink/30 bg-ink/5 px-2 py-0.5 rounded">{BITCOIN_NETWORK_NAME}</span>
        </div>
        <NetworkSwitcher />
      </section>

      {/* Data */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">local data</p>
        </div>
        <div className="p-5 space-y-3">
          <p className="text-sm text-ink/50">
            All contract state, wallet keys, and cached events are stored locally in IndexedDB.
          </p>
          <button
            onClick={handleClearData}
            className="px-4 py-2 text-sm text-negative border border-negative/30 rounded-lg hover:bg-negative/5 transition-colors"
          >
            clear all local data
          </button>
        </div>
      </section>
    </main>
  )
}
