# nostr-dlc

A Bitcoin DLC (Discreet Log Contract) frontend. Users bet on binary outcomes (YES/NO) coordinated over Nostr, with funds locked in on-chain Bitcoin scripts resolved by oracle-revealed preimages.

## Stack

- **React 19** + Vite + TypeScript + Tailwind v4
- **nostr-tools** for relay/event handling; NIP-44 encrypted DMs for counterparty messaging
- **@scure/btc-signer** for PSBT construction and script building
- **Dexie** (IndexedDB) for local contract and message persistence
- Requires a **Nostr browser extension** (Alby, nos2x) that exposes `window.nostr` with NIP-44 support
- Hardcoded relay: `ws://kratomstr.io:7777`
- Targets **regtest** Bitcoin (`bcrt1` addresses); `REGTEST` network constant in `src/lib/contract.ts`

## How it works

### Roles

- **Oracle** — creates a market (Kind 30050 event) committing to two SHA256 hashes (`yes_hash`, `no_hash`). Preimages stored in `localStorage`. Reveals one preimage at resolution blockheight.
- **Maker** — takes a side (YES/NO) on a market, stakes sats, publishes a Kind 30051 offer event. Waits for taker DM, then builds and sends funding PSBT.
- **Taker** — finds an offer, sends a `take_request` DM (Kind 14, NIP-44) to maker with their UTXO info. Receives funding PSBT back, signs and broadcasts.

### Contract lifecycle (status field in `db.ts`)

```
offer_pending → take_received → psbt_sent → funded → resolved | refunded
awaiting_psbt → psbt_sent → funded → resolved | refunded
```

### DLC script structure (`src/lib/contract.ts`)

```
OP_IF
  OP_SHA256 <yesHash> OP_EQUALVERIFY <yesPubkey> OP_CHECKSIG
OP_ELSE
  OP_SHA256 <noHash>  OP_EQUALVERIFY <noPubkey>  OP_CHECKSIG
OP_ENDIF
```

Funded as P2WSH. Winner claims by providing the oracle's revealed preimage + their signature.

### Messaging (NIP-44 Kind 14 DMs)

- `take_request` — taker → maker: `{ type, taker_pubkey, input: { txid, vout, amount }, change_address }`
- `psbt_offer` — maker → taker: `{ type, funding_psbt }` (base64 PSBT)
- DMs are tagged with the offer's Nostr event ID (`e` tag) to correlate with the local contract record

### Nostr event kinds

| Kind  | Purpose |
|-------|---------|
| 30050 | Market announcement (oracle) |
| 30051 | Offer (maker) |
| 14    | Encrypted DM (NIP-44) — take_request / psbt_offer |

## Key files

| File | Purpose |
|------|---------|
| `src/db.ts` | Dexie schema — `Contract`, `Message`, `KeyRecord` types |
| `src/lib/contract.ts` | DLC script builder + `buildFundingPsbt` |
| `src/lib/electrum.ts` | WebSocket Electrum client (UTXO lookup, broadcast) |
| `src/lib/market.ts` | Parse market/offer events, helper utils |
| `src/lib/types.ts` | `TakeRequest` / `TakerInput` wire types |
| `src/hooks/useDMs.ts` | Subscribes to Kind 14 inbox, processes incoming messages, updates contract state |
| `src/hooks/useElectrum.ts` | React hook wrapping `ElectrumWS` |
| `src/context/RelayContext.tsx` | Single shared relay connection; `subscribe` / `publish` |
| `src/pages/OraclePage.tsx` | Create/publish markets as oracle |
| `src/pages/MarketsPage.tsx` | Browse markets and open offers |
| `src/pages/InboxPage.tsx` | Contract management for both maker and taker |

## Dev

```bash
npm run dev      # Vite dev server
npm run build    # tsc + vite build
```

No tests. No backend. All state is local (IndexedDB) + Nostr relay.

## Notes

- `FEE_PER_PARTY = 1000 sats` hardcoded in `contract.ts`
- Nostr x-only pubkeys are converted to 33-byte compressed (0x02 prefix) for script use
- Electrum scripthash is SHA256(scriptPubKey) reversed, computed in-browser via `crypto.subtle`
- The taker's `witnessUtxo.script` in the PSBT is placeholder (uses `takerChangeAddress`) — taker must correct it with their actual funding scriptPubKey before signing
