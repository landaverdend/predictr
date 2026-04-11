import { useState } from 'react'

export default function OraclePage() {
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [resolutionBlockheight, setResolutionBlockheight] = useState('')

  return (
    <main className="flex-1 px-6 py-10 max-w-2xl mx-auto w-full">
      <h1 className="text-2xl font-bold mb-1">create market</h1>
      <p className="text-white/40 text-sm mb-8">
        as an oracle, you commit to resolving this market by revealing a preimage at the resolution block
      </p>

      <form className="space-y-6" onSubmit={e => e.preventDefault()}>

        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-wider">question</label>
          <input
            type="text"
            placeholder="Will BTC hit 100k before June 1 2026?"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-wider">description <span className="normal-case text-white/30">(optional)</span></label>
          <textarea
            placeholder="Any additional context about how this market will be resolved..."
            value={description}
            onChange={e => setDescription(e.target.value)}
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors resize-none"
          />
        </div>

        <div className="space-y-1.5">
          <label className="text-xs text-white/50 uppercase tracking-wider">resolution blockheight</label>
          <input
            type="number"
            placeholder="895000"
            value={resolutionBlockheight}
            onChange={e => setResolutionBlockheight(e.target.value)}
            className="w-full bg-white/5 border border-white/10 rounded-lg px-4 py-3 text-sm placeholder-white/20 focus:outline-none focus:border-white/30 transition-colors font-mono"
          />
          <p className="text-xs text-white/30">
            the block at or after which you commit to publishing the outcome
          </p>
        </div>

        <div className="border border-white/10 rounded-lg p-4 space-y-2">
          <p className="text-xs text-white/50 uppercase tracking-wider mb-3">outcome commitments</p>
          <div className="flex items-center justify-between">
            <span className="text-sm text-green-400">YES</span>
            <span className="text-xs text-white/30 font-mono">preimage generated on publish</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-red-400">NO</span>
            <span className="text-xs text-white/30 font-mono">preimage generated on publish</span>
          </div>
          <p className="text-xs text-white/20 pt-1 border-t border-white/5 mt-2">
            two random preimages will be generated. their SHA256 hashes are committed to on-chain. you reveal one when the market resolves.
          </p>
        </div>

        <button
          type="submit"
          disabled={!question || !resolutionBlockheight}
          className="w-full py-3 rounded-lg text-sm font-medium bg-white text-black hover:bg-white/90 disabled:opacity-20 disabled:cursor-not-allowed transition-all"
        >
          publish market
        </button>

      </form>
    </main>
  )
}
