import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WalletKey } from '../db';
import { generateMnemonic, deriveKeys, HD_KEY_COUNT } from '../lib/hdwallet';
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
  const words = mnemonic.split(' ');

  return (
    <div className="border border-ink/10 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">seed phrase</p>
          <p className="text-xs text-ink/40 mt-0.5">12 words · BIP39 · keep this secret</p>
        </div>
        <button
          onClick={() => setRevealed((r) => !r)}
          className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors">
          {revealed ? 'hide' : 'reveal'}
        </button>
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
  const keys = useLiveQuery(() => db.wallet.toArray().then((ks) => ks.sort((a, b) => Number(a.id) - Number(b.id))), []);
  const { client } = useElectrum();
  const [balances, setBalances] = useState<Record<string, number>>({});

  useEffect(() => {
    initWallet().then(setMnemonic);
  }, []);

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

      <p className="text-xs text-negative/50">seed phrase and private keys stored unencrypted in IndexedDB — regtest only</p>
    </main>
  );
}
