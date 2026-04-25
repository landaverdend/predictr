import { useEffect, useState } from 'react'
import { useRelayContext } from '../../context/RelayContext'
import { useLang } from '../../context/LangContext'
import { useElectrumContext } from '../../context/ElectrumContext'
import { db } from '../../db'
import { KIND_MARKET_ANNOUNCEMENT } from '../../lib/kinds'
import { getNostr } from '../../lib/signer'
import { BlocktimeLabel } from '../BlocktimeLabel'
import { dateToBlock, estimatedResolutionDate, toDatetimeLocal } from '../../lib/blocktime'

function randomHex(bytes: number): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sha256hex(hex: string): Promise<string> {
  const bytes = Uint8Array.from(hex.match(/.{2}/g)!.map(b => parseInt(b, 16)))
  const hash = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('')
}

export function CreateMarketForm() {
  const { publish, relays: savedRelays } = useRelayContext()
  const { t } = useLang()
  const { blockHeight } = useElectrumContext()
  const [question, setQuestion] = useState('')
  const [description, setDescription] = useState('')
  const [resolutionBlockheight, setResolutionBlockheight] = useState('')
  const [resMode, setResMode] = useState<'block' | 'date'>('block')
  const [dateInput, setDateInput] = useState('')
  const [imageUri, setImageUri] = useState('')
  const [imageUploading, setImageUploading] = useState(false)
  const [imageError, setImageError] = useState('')
  const [relays, setRelays] = useState<string[]>(savedRelays)
  const [relayInput, setRelayInput] = useState('')

  // Sync once when saved relays load from DB (they start empty until async load completes)
  useEffect(() => {
    if (savedRelays.length > 0) setRelays(savedRelays)
  }, [savedRelays.join(',')])

  // Default blockheight to current once known, only if user hasn't typed anything
  useEffect(() => {
    if (blockHeight !== null && resolutionBlockheight === '') {
      setResolutionBlockheight(String(blockHeight))
    }
  }, [blockHeight])
  const [status, setStatus] = useState<'idle' | 'publishing' | 'done' | 'error'>('idle')
  const [error, setError] = useState('')

  async function handleImageUpload(file: File) {
    const nostr = getNostr()
    if (!nostr) { setImageError('no nostr signer'); return }
    setImageUploading(true)
    setImageError('')
    try {
      const uploadUrl = 'https://nostr.build/api/v2/nip96/upload'
      const pubkey = await nostr.getPublicKey()
      const authEvent = await nostr.signEvent({
        kind: 27235,
        pubkey,
        created_at: Math.floor(Date.now() / 1000),
        tags: [['u', uploadUrl], ['method', 'POST']],
        content: '',
      })
      const form = new FormData()
      form.append('file', file)
      const res = await fetch(uploadUrl, {
        method: 'POST',
        headers: { Authorization: `Nostr ${btoa(JSON.stringify(authEvent))}` },
        body: form,
      })
      if (!res.ok) throw new Error(`upload failed: ${res.status}`)
      const data = await res.json()
      const url = data.nip94_event?.tags?.find((t: string[]) => t[0] === 'url')?.[1]
      if (!url) throw new Error('no url in response')
      setImageUri(url)
    } catch (err) {
      setImageError(err instanceof Error ? err.message : 'upload failed')
    } finally {
      setImageUploading(false)
    }
  }

  function handleDateChange(dateStr: string) {
    setDateInput(dateStr)
    if (dateStr && blockHeight !== null) {
      const block = dateToBlock(new Date(dateStr), blockHeight)
      setResolutionBlockheight(String(block))
    }
  }

  function switchMode(mode: 'block' | 'date') {
    if (mode === resMode) return
    setResMode(mode)
    if (mode === 'date' && blockHeight !== null) {
      // Pre-fill date from existing block value if set
      const block = parseInt(resolutionBlockheight)
      if (!isNaN(block)) {
        setDateInput(toDatetimeLocal(estimatedResolutionDate(block, blockHeight)))
      }
    }
  }

  function addRelay() {
    const url = relayInput.trim()
    if (!url || relays.includes(url)) return
    setRelays(prev => [...prev, url])
    setRelayInput('')
  }

  function removeRelay(url: string) {
    setRelays(prev => prev.filter(r => r !== url))
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const nostr = getNostr()
    if (!nostr) throw new Error('no nostr signer found — install Alby, nos2x, or connect a bunker')

    setStatus('publishing')
    setError('')

    try {
      const yesPreimage = randomHex(32)
      const noPreimage = randomHex(32)
      const yesHash = await sha256hex(yesPreimage)
      const noHash = await sha256hex(noPreimage)
      const marketId = randomHex(16)
      const pubkey = await nostr.getPublicKey()
      const now = Date.now()

      const signed = await nostr.signEvent({
        kind: KIND_MARKET_ANNOUNCEMENT,
        pubkey,
        created_at: Math.floor(now / 1000),
        tags: [
          ['d', marketId],
          ['question', question],
          ['yes_hash', yesHash],
          ['no_hash', noHash],
          ['resolution_blockheight', resolutionBlockheight],
          ...(imageUri ? [['image', imageUri]] : []),
          ...relays.map(r => ['r', r]),
        ],
        content: description,
      })

      await publish(signed)

      await db.oracleMarkets.put({
        id: marketId,
        eventId: signed.id,
        question,
        description,
        resolutionBlockheight: parseInt(resolutionBlockheight),
        yesHash,
        noHash,
        yesPreimage,
        noPreimage,
        createdAt: now,
      })

      setStatus('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error')
      setStatus('error')
    }
  }

  if (status === 'done') {
    return (
      <div className="border border-positive/20 bg-positive/5 rounded-lg p-6 text-center space-y-2">
        <p className="text-positive font-medium">{t('create.published_title')}</p>
        <p className="text-xs text-ink/40">{t('create.published_body')}</p>
        <button
          onClick={() => { setStatus('idle'); setQuestion(''); setDescription(''); setResolutionBlockheight(''); setDateInput(''); setResMode('block'); setImageUri('') }}
          className="mt-4 text-xs text-ink/40 hover:text-ink/70 underline"
        >
          {t('create.create_another')}
        </button>
      </div>
    )
  }

  return (
    <form className="space-y-6" onSubmit={handleSubmit}>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label className="text-xs text-ink/50 uppercase tracking-wider">{t('create.question')}</label>
          <span className="text-[10px] text-ink/30">{t('create.question_hint')}</span>
        </div>
        <input
          type="text"
          placeholder="Will BTC hit 100k before June 1 2026?"
          value={question}
          onChange={e => setQuestion(e.target.value)}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">
          {t('create.description')} <span className="normal-case text-ink/30">{t('create.optional')}</span>
        </label>
        <textarea
          placeholder="Any additional context about how this market will be resolved..."
          value={description}
          onChange={e => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors resize-none"
        />
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">
          {t('create.image')} <span className="normal-case text-ink/30">{t('create.optional')}</span>
        </label>
        {imageUri ? (
          <div className="relative group">
            <img
              src={imageUri}
              alt="preview"
              className="w-full h-52 object-cover rounded-xl border border-ink/10"
            />
            <button
              type="button"
              onClick={() => setImageUri('')}
              className="absolute top-3 right-3 text-xs bg-base/90 border border-ink/20 rounded-lg px-3 py-1.5 text-ink/60 hover:text-ink hover:border-ink/40 transition-colors backdrop-blur-sm"
            >
              {t('create.remove')}
            </button>
          </div>
        ) : (
          <label className={`relative flex flex-col items-center justify-center w-full h-44 border-2 border-dashed border-ink/20 rounded-xl cursor-pointer bg-ink/[0.02] hover:bg-ink/[0.04] hover:border-ink/35 transition-all group ${imageUploading ? 'opacity-50 pointer-events-none' : ''}`}>
            {imageUploading ? (
              <div className="flex flex-col items-center gap-2">
                <svg className="w-6 h-6 text-ink/30 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2"/>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z"/>
                </svg>
                <span className="text-xs text-ink/40">uploading…</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2.5">
                <div className="w-10 h-10 rounded-full bg-ink/5 group-hover:bg-ink/10 flex items-center justify-center transition-colors">
                  <svg className="w-5 h-5 text-ink/35 group-hover:text-ink/55 transition-colors" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"/>
                  </svg>
                </div>
                <div className="text-center">
                  <p className="text-sm text-ink/50 group-hover:text-ink/70 transition-colors">{t('create.upload_prompt')}</p>
                  <p className="text-xs text-ink/25 mt-0.5">PNG, JPG, GIF up to 10 MB</p>
                </div>
              </div>
            )}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) handleImageUpload(f) }}
            />
          </label>
        )}
        {imageError && <p className="text-xs text-negative">{imageError}</p>}
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs text-ink/50 uppercase tracking-wider">{t('create.blockheight')}</label>
          {/* Mode toggle */}
          <div className="flex rounded-lg border border-ink/10 overflow-hidden text-[11px]">
            <button
              type="button"
              onClick={() => switchMode('date')}
              className={`px-3 py-1 transition-colors ${resMode === 'date' ? 'bg-ink/10 text-ink/80' : 'text-ink/35 hover:text-ink/60'}`}
            >
              date &amp; time
            </button>
            <button
              type="button"
              onClick={() => switchMode('block')}
              className={`px-3 py-1 transition-colors ${resMode === 'block' ? 'bg-ink/10 text-ink/80' : 'text-ink/35 hover:text-ink/60'}`}
            >
              block height
            </button>
          </div>
        </div>

        {resMode === 'date' ? (
          <>
            <input
              type="datetime-local"
              value={dateInput}
              min={toDatetimeLocal(new Date())}
              onChange={e => handleDateChange(e.target.value)}
              className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm text-ink/90 placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors [color-scheme:dark]"
            />
            {resolutionBlockheight && blockHeight !== null && (
              <BlocktimeLabel
                resolutionBlock={parseInt(resolutionBlockheight)}
                currentBlock={blockHeight}
                className="text-xs text-ink/40 flex-wrap"
                relativeLabel="will resolve"
              />
            )}
          </>
        ) : (
          <>
            <input
              type="text"
              inputMode="numeric"
              placeholder="895000"
              value={resolutionBlockheight}
              onChange={e => setResolutionBlockheight(e.target.value.replace(/\D/g, ''))}
              className="w-full bg-ink/5 border border-ink/10 rounded-lg px-4 py-3 text-sm placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors font-mono"
            />
            {resolutionBlockheight && blockHeight !== null && (
              <BlocktimeLabel
                resolutionBlock={parseInt(resolutionBlockheight)}
                currentBlock={blockHeight}
                className="text-xs text-ink/40 flex-wrap"
                relativeLabel="will resolve"
              />
            )}
          </>
        )}
        <p className="text-xs text-ink/30">{t('create.blockheight_help')}</p>
      </div>

      <div className="space-y-1.5">
        <label className="text-xs text-ink/50 uppercase tracking-wider">{t('create.relays')}</label>
        <div className="space-y-2">
          {relays.map(url => (
            <div key={url} className="flex items-center justify-between bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5">
              <span className="text-sm font-mono text-ink/70">{url}</span>
              <button type="button" onClick={() => removeRelay(url)} className="text-ink/20 hover:text-ink/60 transition-colors text-lg leading-none ml-4">×</button>
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-2">
          <input
            type="text"
            placeholder="wss://relay.example.com"
            value={relayInput}
            onChange={e => setRelayInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && (e.preventDefault(), addRelay())}
            className="flex-1 bg-ink/5 border border-ink/10 rounded-lg px-4 py-2.5 text-sm font-mono placeholder-ink/20 focus:outline-none focus:border-ink/30 transition-colors"
          />
          <button
            type="button"
            onClick={addRelay}
            disabled={!relayInput.trim()}
            className="px-4 py-2.5 text-sm border border-ink/20 rounded-lg hover:bg-ink/5 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
          >
            {t('create.add')}
          </button>
        </div>
      </div>

      {status === 'error' && <p className="text-xs text-negative">{error}</p>}

      <button
        type="submit"
        disabled={!question || !resolutionBlockheight || status === 'publishing'}
        className="w-full py-3 rounded-lg text-sm font-medium bg-brand text-white hover:bg-brand-light disabled:opacity-20 disabled:cursor-not-allowed transition-all"
      >
        {status === 'publishing' ? t('create.publishing') : t('create.publish')}
      </button>
    </form>
  )
}
