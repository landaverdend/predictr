import { useNostrUser } from '../hooks/useNostrUser'
import { db } from '../db'

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

      {/* Relay */}
      <section className="border border-ink/10 rounded-xl overflow-hidden">
        <div className="px-5 py-3 bg-elevated border-b border-ink/5">
          <p className="text-xs text-ink/40 uppercase tracking-wider font-medium">relay</p>
        </div>
        <div className="p-5">
          <p className="text-sm font-mono text-ink/70">ws://kratomstr.io:7777</p>
          <p className="text-xs text-ink/30 mt-1">hardcoded — regtest relay</p>
        </div>
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
