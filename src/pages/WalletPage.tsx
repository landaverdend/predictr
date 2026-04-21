import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WalletKey } from '../db';
import { generateMnemonic, deriveKeys, isValidMnemonic, HD_KEY_COUNT } from '../lib/hdwallet';
import { useElectrum } from '../hooks/useElectrum';

async function getOrCreateMnemonic(): Promise<string> {
  const existing = await db.settings.get('wallet_mnemonic');
  if (existing) return existing.value as string;
  const mnemonic = generateMnemonic();
  await db.settings.put({ key: 'wallet_mnemonic', value: mnemonic });
  return mnemonic;
}

async function initWallet() {
  const mnemonic = await getOrCreateMnemonic();
  const keys = deriveKeys(mnemonic);
  await db.wallet.bulkPut(keys);
  return mnemonic;
}

function SeedPhrase({ mnemonic }: { mnemonic: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = mnemonic.split(' ');

  function handleCopy() {
    navigator.clipboard.writeText(mnemonic)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="border border-ink/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">seed phrase</p>
          <p className="text-xs text-ink/40 mt-0.5">12 words · BIP39 · keep this secret</p>
        </div>
        <div className="flex items-center gap-2">
          {revealed && (
            <button onClick={handleCopy} className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors">
              {copied ? 'copied!' : 'copy'}
            </button>
          )}
          <button
            onClick={() => setRevealed((r) => !r)}
            className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors">
            {revealed ? 'hide' : 'reveal'}
          </button>
        </div>
      </div>

      {revealed ? (
        <div className="grid grid-cols-4 gap-2">
          {words.map((word, i) => (
            <div key={i} className="flex items-center gap-1.5 bg-elevated rounded px-2.5 py-1.5">
              <span className="text-[10px] text-ink/25 w-4 shrink-0">{i + 1}</span>
              <span className="text-xs font-mono text-ink/80">{word}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className="h-10 flex items-center justify-center">
          <p className="text-xs text-ink/25 tracking-widest select-none">{'• '.repeat(12).trim()}</p>
        </div>
      )}
    </div>
  );
}

function ImportModal({ onImport, onClose }: { onImport: (mnemonic: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const trimmed = value.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const isValid = isValidMnemonic(trimmed);

  async function handleConfirm() {
    if (!isValid) {
      setError('invalid mnemonic');
      setStatus('error');
      return;
    }
    setStatus('loading');
    setError('');
    try {
      await onImport(trimmed);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'import failed');
      setStatus('error');
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <div
        className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">import seed phrase</p>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>
        <p className="text-xs text-ink/40 leading-relaxed">
          paste your 12-word BIP39 seed phrase. this will replace your current wallet.
        </p>
        <textarea
          rows={3}
          placeholder="word1 word2 word3 ..."
          value={value}
          onChange={e => { setValue(e.target.value); setStatus('idle'); setError(''); }}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors resize-none"
          autoFocus
        />
        <div className="flex items-center justify-between text-xs">
          <span className={wordCount === 12 && isValid ? 'text-positive' : 'text-ink/30'}>
            {wordCount} / 12 words{wordCount === 12 && isValid ? ' · valid' : wordCount === 12 ? ' · invalid' : ''}
          </span>
          {status === 'error' && <span className="text-negative">{error}</span>}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors"
          >
            cancel
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={!isValid || status === 'loading'}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'loading' ? 'importing…' : 'import'}
          </button>
        </div>
      </div>
    </div>
  );
}

function KeyRow({ walletKey, balance }: { walletKey: WalletKey; balance: number | undefined }) {
  return (
    <tr className="border-t border-ink/5 hover:bg-elevated transition-colors">
      <td className="px-4 py-2.5 font-mono text-[11px] text-ink/30 text-center w-8">{walletKey.id}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-ink/70 break-all">{walletKey.address}</td>
      <td className="px-4 py-2.5 font-mono text-xs text-right whitespace-nowrap">
        {balance === undefined ? (
          <span className="text-ink/20">…</span>
        ) : balance > 0 ? (
          <span className="text-positive">{balance.toLocaleString()} sats</span>
        ) : (
          <span className="text-ink/20">—</span>
        )}
      </td>
    </tr>
  );
}

export default function WalletPage() {
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const keys = useLiveQuery(() => db.wallet.toArray().then((ks) => ks.sort((a, b) => Number(a.id) - Number(b.id))), []);
  const { client } = useElectrum();
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    initWallet().then(setMnemonic);
  }, []);

  async function handleImport(newMnemonic: string) {
    await db.settings.put({ key: 'wallet_mnemonic', value: newMnemonic });
    const keys = deriveKeys(newMnemonic);
    await db.wallet.clear();
    await db.wallet.bulkPut(keys);
    setMnemonic(newMnemonic);
  }

  useEffect(() => {
    if (!keys?.length || !client) return;
    keys.forEach(async (k) => {
      try {
        const { confirmed, unconfirmed } = await client.getBalance(k.address);
        setBalances((prev) => ({ ...prev, [k.address]: confirmed + unconfirmed }));
      } catch {
        /* ignore */
      }
    });
  }, [keys, client]);

  const totalBalance = Object.values(balances).reduce((s, v) => s + v, 0);

  return (
    <main className="flex-1 px-6 py-10 max-w-3xl mx-auto w-full space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold mb-1">wallet</h1>
          <p className="text-ink/40 text-sm">{HD_KEY_COUNT} addresses · BIP86 Taproot</p>
        </div>
        {totalBalance > 0 && (
          <div className="text-right">
            <p className="text-xs text-ink/30 uppercase tracking-wider">total balance</p>
            <p className="text-lg font-mono font-medium text-positive mt-0.5">{totalBalance.toLocaleString()} sats</p>
          </div>
        )}
      </div>

      {keys && keys.length > 0 && (
        <div className="border border-ink/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-elevated">
                <th className="px-4 py-2.5 text-center text-xs text-ink/30 uppercase tracking-wider font-normal w-8">#</th>
                <th className="px-4 py-2.5 text-left text-xs text-ink/30 uppercase tracking-wider font-normal">address</th>
                <th className="px-4 py-2.5 text-right text-xs text-ink/30 uppercase tracking-wider font-normal">balance</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <KeyRow key={k.id} walletKey={k} balance={balances[k.address]} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {!keys?.length && <div className="text-center text-ink/30 text-sm py-20">initializing wallet…</div>}

      {mnemonic && <SeedPhrase mnemonic={mnemonic} />}

      <div className="flex items-center gap-3">
        <p className="text-xs text-negative/50 flex-1">seed phrase and private keys stored unencrypted in IndexedDB — regtest only</p>
        <button
          onClick={() => setShowImport(true)}
          className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors shrink-0"
        >
          import
        </button>
      </div>

      {showImport && (
        <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />
      )}
    </main>
  );
}
