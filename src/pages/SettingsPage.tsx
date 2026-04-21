import { useEffect, useState } from 'react'
import { useNostrUser } from '../hooks/useNostrUser'
import { useRelayContext } from '../context/RelayContext'
import { useElectrumContext, DEFAULT_ELECTRUM_URL } from '../context/ElectrumContext'
import { db } from '../db'

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

      <div className="flex gap-2">
        <input
          type="text"
          placeholder="wss://relay.example.com"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleAdd()}
          className="flex-1 bg-elevated border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />
        <button
          onClick={handleAdd}
          disabled={!input.trim()}
          className="px-4 py-2.5 text-sm border border-ink/20 rounded-lg hover:bg-ink/5 disabled:opacity-30 transition-colors"
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

function ElectrumManager() {
  const { url, saveUrl, error } = useElectrumContext()
  const [draft, setDraft] = useState(url)
  const [saving, setSaving] = useState(false)
  const [pingStatus, setPingStatus] = useState<PingStatus | null>(null)

  useEffect(() => { setDraft(url) }, [url])

  useEffect(() => {
    if (!draft.startsWith('ws')) { setPingStatus(null); return }
    setPingStatus('checking')
    pingRelay(draft).then(ok => setPingStatus(ok ? 'ok' : 'fail'))
  }, [draft])

  const isDirty = draft !== url

  async function handleSave() {
    setSaving(true)
    try { await saveUrl(draft) } finally { setSaving(false) }
  }

  const PING_DOT: Record<PingStatus, string> = {
    checking: 'bg-caution animate-pulse',
    ok:       'bg-positive',
    fail:     'bg-negative',
  }

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-2 bg-elevated rounded-lg px-3 py-2">
        {pingStatus && (
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${PING_DOT[pingStatus]}`} />
        )}
        <input
          type="text"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && isDirty && handleSave()}
          placeholder={DEFAULT_ELECTRUM_URL}
          className="flex-1 bg-transparent text-sm font-mono text-ink/90 placeholder-ink/20 focus:outline-none"
        />
      </div>
      {error && (
        <p className="text-xs text-negative font-mono">{error}</p>
      )}
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

export default function SettingsPage() {
  const user = useNostrUser()

  async function handleClearData() {
    if (!confirm('Clear all local data? This deletes your contracts, wallet keys, and cached markets.')) return
    await db.delete()
    window.location.reload()
  }

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full space-y-8">
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

      {/* Relays */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">relays</p>
        </div>
        <RelayManager />
      </section>

      {/* Electrum */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">electrum server</p>
        </div>
        <ElectrumManager />
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
