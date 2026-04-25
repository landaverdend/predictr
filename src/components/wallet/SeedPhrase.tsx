import { useState } from 'react'

export function SeedPhrase({ mnemonic }: { mnemonic: string }) {
  const [revealed, setRevealed] = useState(false)
  const [copied, setCopied] = useState(false)
  const words = mnemonic.split(' ')

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
            onClick={() => setRevealed(r => !r)}
            className="text-xs text-ink/40 hover:text-ink/70 border border-ink/15 rounded px-3 py-1.5 transition-colors"
          >
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
  )
}
