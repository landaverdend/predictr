import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type WalletKey } from '../db';
import { generateMnemonic, deriveKeys, isValidMnemonic, HD_KEY_COUNT } from '../lib/hdwallet';
import { useElectrum } from '../hooks/useElectrum';
import { useWallet } from '../hooks/useWallet';
import { sendFromWallet } from '../lib/spend';
import { Address } from '@scure/btc-signer';
import { REGTEST } from '../lib/contract';
import {
  generateSalt,
  derivePinKey,
  createPinVerifier,
  verifyPin,
  encryptPrivkey,
  setSessionKey,
  getSessionKey,
  isWalletUnlocked,
} from '../lib/pinCrypto';

// ── DB helpers ────────────────────────────────────────────────────────────────

async function getOrCreateMnemonic(): Promise<string> {
  const existing = await db.settings.get('wallet_mnemonic');
  if (existing) return existing.value as string;
  const mnemonic = generateMnemonic();
  await db.settings.put({ key: 'wallet_mnemonic', value: mnemonic });
  return mnemonic;
}

async function initWallet() {
  const mnemonic = await getOrCreateMnemonic();
  // Only derive and store keys when the wallet is empty — prevents overwriting
  // already-encrypted keys on subsequent mounts.
  const count = await db.wallet.count();
  if (count === 0) {
    const keys = deriveKeys(mnemonic);
    await db.wallet.bulkPut(keys);
  }
  return mnemonic;
}

async function encryptAndStoreKeys(keys: WalletKey[], pin: string, salt: Uint8Array) {
  const key = await derivePinKey(pin, salt);
  const encrypted = await Promise.all(
    keys.map(async (k) => ({
      ...k,
      privkey: await encryptPrivkey(k.privkey, key),
    })),
  );
  await db.wallet.bulkPut(encrypted);
  return key;
}

// ── Address validation ────────────────────────────────────────────────────────

function isValidAddress(addr: string): boolean {
  try {
    Address(REGTEST).decode(addr);
    return true;
  } catch {
    return false;
  }
}

// ── PIN modals ────────────────────────────────────────────────────────────────

function PinInput({
  value,
  onChange,
  placeholder = '• • • •',
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="password"
      inputMode="numeric"
      pattern="[0-9]*"
      maxLength={12}
      placeholder={placeholder}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      autoFocus={autoFocus}
      className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-center text-xl font-mono tracking-widest placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
    />
  );
}

function SetPinScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [confirm, setConfirm] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const pinValid = pin.length >= 4;
  const match = pin === confirm;
  const canSubmit = pinValid && match && confirm.length >= 4 && status !== 'loading';

  async function handleSet() {
    if (!canSubmit) return;
    setStatus('loading');
    setError('');
    try {
      const allKeys = await db.wallet.toArray();
      const salt = generateSalt();
      const cryptoKey = await encryptAndStoreKeys(allKeys, pin, salt);
      const verifier = await createPinVerifier(cryptoKey);
      await db.settings.put({ key: 'wallet_pin_salt', value: btoa(String.fromCharCode(...salt)) });
      await db.settings.put({ key: 'wallet_pin_check', value: verifier });
      setSessionKey(cryptoKey);
      onDone();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to set PIN');
      setStatus('error');
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">secure your wallet</h1>
          <p className="text-sm text-ink/40">choose a PIN to encrypt your private keys at rest</p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">PIN (4–12 digits)</label>
            <PinInput value={pin} onChange={v => { setPin(v); setStatus('idle'); setError(''); }} autoFocus />
          </div>
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">confirm PIN</label>
            <PinInput value={confirm} onChange={v => { setConfirm(v); setStatus('idle'); setError(''); }} />
            {confirm.length >= 4 && !match && (
              <p className="text-[11px] text-negative mt-1">PINs don't match</p>
            )}
          </div>
        </div>

        {status === 'error' && <p className="text-xs text-negative text-center">{error}</p>}

        <button
          onClick={handleSet}
          disabled={!canSubmit}
          className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          {status === 'loading' ? 'encrypting…' : 'set PIN'}
        </button>

        <p className="text-[11px] text-ink/25 text-center leading-relaxed">
          your private keys will be encrypted with AES-256-GCM using this PIN.<br />
          you'll enter it once per session.
        </p>
      </div>
    </main>
  );
}

function UnlockScreen({ onDone }: { onDone: () => void }) {
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  async function handleUnlock() {
    if (pin.length < 4) return;
    setStatus('loading');
    try {
      const saltSetting = await db.settings.get('wallet_pin_salt');
      const verifierSetting = await db.settings.get('wallet_pin_check');
      if (!saltSetting || !verifierSetting) throw new Error('PIN data missing');

      const salt = Uint8Array.from(atob(saltSetting.value as string), c => c.charCodeAt(0));
      const cryptoKey = await derivePinKey(pin, salt);
      const ok = await verifyPin(verifierSetting.value as string, cryptoKey);
      if (!ok) {
        setStatus('error');
        setPin('');
        return;
      }
      setSessionKey(cryptoKey);
      onDone();
    } catch {
      setStatus('error');
      setPin('');
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-10">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center space-y-1">
          <h1 className="text-xl font-bold">unlock wallet</h1>
          <p className="text-sm text-ink/40">enter your PIN to decrypt your keys</p>
        </div>

        <PinInput
          value={pin}
          onChange={v => { setPin(v); setStatus('idle'); }}
          autoFocus
        />

        {status === 'error' && (
          <p className="text-xs text-negative text-center">incorrect PIN</p>
        )}

        <button
          onClick={handleUnlock}
          disabled={pin.length < 4 || status === 'loading'}
          className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          {status === 'loading' ? 'unlocking…' : 'unlock'}
        </button>
      </div>
    </main>
  );
}

// ── Seed phrase ───────────────────────────────────────────────────────────────

function SeedPhrase({ mnemonic }: { mnemonic: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const words = mnemonic.split(' ');

  function handleCopy() {
    navigator.clipboard.writeText(mnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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

// ── Import modal ──────────────────────────────────────────────────────────────

function ImportModal({ onImport, onClose }: { onImport: (mnemonic: string) => Promise<void>; onClose: () => void }) {
  const [value, setValue] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');

  const trimmed = value.trim();
  const wordCount = trimmed ? trimmed.split(/\s+/).length : 0;
  const isValid = isValidMnemonic(trimmed);

  async function handleConfirm() {
    if (!isValid) { setError('invalid mnemonic'); setStatus('error'); return; }
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
      <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
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
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors">
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

// ── Send modal ────────────────────────────────────────────────────────────────

function SendModal({
  totalBalance,
  onSend,
  onClose,
}: {
  totalBalance: number;
  onSend: (toAddress: string, amountSats: number) => Promise<string>;
  onClose: () => void;
}) {
  const [toAddress, setToAddress] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [sendMax, setSendMax] = useState(false);
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [txid, setTxid] = useState('');

  const estimatedFee = 900;
  const maxSendable = Math.max(0, totalBalance - estimatedFee);
  const amount = sendMax ? maxSendable : parseInt(amountStr, 10);
  const addressValid = isValidAddress(toAddress);
  const amountValid = !isNaN(amount) && amount > 0 && amount <= maxSendable;
  const canSubmit = addressValid && amountValid && status !== 'loading';

  async function handleSend() {
    setStatus('loading');
    setError('');
    try {
      const result = await onSend(toAddress, amount);
      setTxid(result);
      setStatus('success');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'send failed');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
        <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
        <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
          <p className="text-sm font-medium text-positive">sent!</p>
          {txid && <p className="font-mono text-[11px] text-ink/40 break-all">{txid}</p>}
          <button type="button" onClick={onClose} className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light transition-all">
            done
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-base/70 backdrop-blur-sm" />
      <div className="relative w-full max-w-sm bg-surface border border-ink/10 rounded-xl p-7 space-y-5" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">send bitcoin</p>
          <button type="button" onClick={onClose} className="text-ink/30 hover:text-ink/60 transition-colors text-xl leading-none">×</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink/40 block mb-1.5">destination address</label>
            <input
              type="text"
              placeholder="bcrt1p…"
              value={toAddress}
              onChange={e => { setToAddress(e.target.value.trim()); setStatus('idle'); setError(''); }}
              className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
              autoFocus
            />
            {toAddress && !addressValid && <p className="text-[11px] text-negative mt-1">invalid address</p>}
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs text-ink/40">amount (sats)</label>
              <button
                type="button"
                onClick={() => { setSendMax(s => !s); setAmountStr(''); }}
                className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${sendMax ? 'border-brand text-brand' : 'border-ink/15 text-ink/40 hover:text-ink/70'}`}
              >
                send max
              </button>
            </div>
            {sendMax ? (
              <div className="bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono text-ink/50">
                {maxSendable.toLocaleString()} sats
              </div>
            ) : (
              <input
                type="number"
                placeholder="0"
                min="1"
                max={maxSendable}
                value={amountStr}
                onChange={e => { setAmountStr(e.target.value); setStatus('idle'); setError(''); }}
                className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
              />
            )}
          </div>
        </div>

        <div className="flex items-center justify-between text-xs text-ink/30">
          <span>available: {totalBalance.toLocaleString()} sats</span>
          <span>~{estimatedFee} sats fee</span>
        </div>

        {status === 'error' && <p className="text-xs text-negative">{error}</p>}

        <div className="flex gap-2">
          <button type="button" onClick={onClose} className="flex-1 py-3 rounded-lg text-sm border border-ink/10 text-ink/40 hover:bg-ink/5 transition-colors">
            cancel
          </button>
          <button
            type="button"
            onClick={handleSend}
            disabled={!canSubmit}
            className="flex-1 py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
          >
            {status === 'loading' ? 'sending…' : 'send'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Key table row ─────────────────────────────────────────────────────────────

function truncateAddr(addr: string) {
  return `${addr.slice(0, 10)}…${addr.slice(-6)}`
}

function CopyButton({ text, className = '' }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false)
  function handleCopy(e: React.MouseEvent) {
    e.stopPropagation()
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button
      onClick={handleCopy}
      title="copy address"
      className={`shrink-0 transition-colors ${copied ? 'text-positive' : 'text-ink/25 hover:text-ink/60'} ${className}`}
    >
      {copied ? (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
          <rect x="9" y="9" width="13" height="13" rx="2" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
        </svg>
      )}
    </button>
  )
}

function KeyRow({ walletKey, balance }: { walletKey: WalletKey; balance: number | undefined }) {
  const balanceEl = balance === undefined ? (
    <span className="text-ink/20">…</span>
  ) : balance > 0 ? (
    <span className="text-positive">{balance.toLocaleString()} sats</span>
  ) : (
    <span className="text-ink/20">—</span>
  )

  return (
    <tr className="group border-t border-ink/5 hover:bg-elevated transition-colors">
      <td className="px-3 py-3 font-mono text-[11px] text-ink/30 text-center w-8">{walletKey.id}</td>
      {/* Mobile: truncated address + copy icon to the right, balance below */}
      <td className="sm:hidden px-3 py-3">
        <div className="flex items-center gap-2">
          <p className="font-mono text-xs text-ink/70">{truncateAddr(walletKey.address)}</p>
          <CopyButton text={walletKey.address} />
        </div>
        <p className="font-mono text-xs mt-0.5">{balanceEl}</p>
      </td>
      {/* Desktop: full address with copy on hover */}
      <td className="hidden sm:table-cell px-3 py-3 font-mono text-xs text-ink/70 break-all">
        <div className="flex items-start gap-2">
          <span>{walletKey.address}</span>
          <CopyButton text={walletKey.address} className="opacity-0 group-hover:opacity-100 mt-0.5" />
        </div>
      </td>
      <td className="hidden sm:table-cell px-3 py-3 font-mono text-xs text-right whitespace-nowrap">{balanceEl}</td>
    </tr>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type PinState = 'checking' | 'setup' | 'locked' | 'unlocked'

export default function WalletPage() {
  const [pinState, setPinState] = useState<PinState>('checking');
  const [mnemonic, setMnemonic] = useState<string | null>(null);
  const [showImport, setShowImport] = useState(false);
  const [showSend, setShowSend] = useState(false);
  const [generatingMore, setGeneratingMore] = useState(false);

  const keys = useLiveQuery(
    () => db.wallet.toArray().then((ks) => ks.sort((a, b) => Number(a.id) - Number(b.id))),
    [],
  );
  const { client } = useElectrum();
  const { allUtxos, totalBalance, utxosByAddress, loading, refresh } = useWallet();

  const balances: Record<string, number> = {};
  for (const [addr, utxos] of Object.entries(utxosByAddress)) {
    balances[addr] = utxos.reduce((s, u) => s + u.value, 0);
  }

  // Check PIN state on mount
  useEffect(() => {
    async function check() {
      const m = await initWallet();
      setMnemonic(m);
      const saltSetting = await db.settings.get('wallet_pin_salt');
      if (!saltSetting) {
        setPinState('setup');
      } else if (isWalletUnlocked()) {
        setPinState('unlocked');
      } else {
        setPinState('locked');
      }
    }
    check();
  }, []);

  // ── handlers ──────────────────────────────────────────────────────────────

  async function handleImport(newMnemonic: string) {
    const salt = await db.settings.get('wallet_pin_salt');
    const pinCheck = await db.settings.get('wallet_pin_check');

    // Derive plain keys first
    const newKeys = deriveKeys(newMnemonic);
    await db.wallet.clear();

    if (salt && pinCheck) {
      // Wallet is encrypted — re-encrypt new keys with existing session key
      // (wallet must be unlocked to import)
      const sessionKey = getSessionKey();
      if (!sessionKey) throw new Error('wallet locked — unlock before importing');
      const encrypted = await Promise.all(
        newKeys.map(async (k) => ({ ...k, privkey: await encryptPrivkey(k.privkey, sessionKey) }))
      );
      await db.wallet.bulkPut(encrypted);
    } else {
      await db.wallet.bulkPut(newKeys);
    }

    await db.settings.put({ key: 'wallet_mnemonic', value: newMnemonic });
    setMnemonic(newMnemonic);
  }

  async function handleGenerateMore() {
    if (!mnemonic || !keys) return;
    setGeneratingMore(true);
    try {
      const startIdx = keys.length;
      const newKeys = deriveKeys(mnemonic, 10, startIdx);

      const saltSetting = await db.settings.get('wallet_pin_salt');
      if (saltSetting) {
        const sessionKey = getSessionKey();
        if (!sessionKey) throw new Error('wallet locked');
        const encrypted = await Promise.all(
          newKeys.map(async (k) => ({ ...k, privkey: await encryptPrivkey(k.privkey, sessionKey) }))
        );
        await db.wallet.bulkPut(encrypted);
      } else {
        await db.wallet.bulkPut(newKeys);
      }
    } finally {
      setGeneratingMore(false);
    }
  }

  async function handleSend(toAddress: string, amountSats: number) {
    if (!client) throw new Error('electrum not connected');
    const changeAddr = keys?.[0]?.address;
    if (!changeAddr) throw new Error('no wallet keys');
    return sendFromWallet(allUtxos(), toAddress, amountSats, changeAddr, client);
  }

  // ── PIN gate ───────────────────────────────────────────────────────────────

  if (pinState === 'checking') {
    return <main className="flex-1 flex items-center justify-center"><p className="text-sm text-ink/30">loading…</p></main>;
  }

  if (pinState === 'setup') {
    return <SetPinScreen onDone={() => setPinState('unlocked')} />;
  }

  if (pinState === 'locked') {
    return <UnlockScreen onDone={() => setPinState('unlocked')} />;
  }

  // ── Unlocked wallet ────────────────────────────────────────────────────────

  return (
    <main className="flex-1 px-4 sm:px-6 py-8 max-w-3xl mx-auto w-full space-y-6">
      {/* Header: title + balance + send */}
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold mb-1">wallet</h1>
          <div className="flex items-center gap-2">
            <p className="text-ink/40 text-sm">{keys?.length ?? HD_KEY_COUNT} addresses · BIP86 Taproot</p>
            <button
              onClick={refresh}
              disabled={loading}
              className={`text-ink/30 hover:text-ink/60 transition-colors disabled:opacity-30 ${loading ? 'animate-spin' : ''}`}
              title="refresh balances"
            >
              ↻
            </button>
          </div>
        </div>
        <div className="text-right shrink-0 space-y-1.5">
          <p className="text-[10px] text-ink/30 uppercase tracking-wider">total balance</p>
          <p className="text-xl sm:text-2xl font-mono font-semibold text-positive leading-none">
            {totalBalance > 0 ? totalBalance.toLocaleString() : '—'}
          </p>
          {totalBalance > 0 && <p className="text-xs text-positive/60">sats</p>}
          {totalBalance > 0 && (
            <button
              onClick={() => setShowSend(true)}
              className="text-xs px-4 py-2 rounded-lg bg-brand text-white hover:bg-brand-light transition-all"
            >
              send
            </button>
          )}
        </div>
      </div>

      {keys && keys.length > 0 && (
        <div className="border border-ink/10 rounded-xl overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="bg-elevated">
                <th className="px-3 py-2.5 text-center text-xs text-ink/30 uppercase tracking-wider font-normal w-8">#</th>
                {/* Mobile header: combined address/balance col */}
                <th className="sm:hidden px-3 py-2.5 text-left text-xs text-ink/30 uppercase tracking-wider font-normal">address · balance</th>
                {/* Desktop headers */}
                <th className="hidden sm:table-cell px-3 py-2.5 text-left text-xs text-ink/30 uppercase tracking-wider font-normal">address</th>
                <th className="hidden sm:table-cell px-3 py-2.5 text-right text-xs text-ink/30 uppercase tracking-wider font-normal">balance</th>
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
        <p className="text-xs text-negative/50 flex-1">
          private keys encrypted at rest with AES-256-GCM · seed phrase unencrypted · regtest only
        </p>
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

      {showImport && <ImportModal onImport={handleImport} onClose={() => setShowImport(false)} />}
      {showSend && (
        <SendModal
          totalBalance={totalBalance}
          onSend={handleSend}
          onClose={() => setShowSend(false)}
        />
      )}
    </main>
  );
}
