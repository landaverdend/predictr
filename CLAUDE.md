# nostr-dlc

A Bitcoin DLC (Discreet Log Contract) frontend. Users bet on binary outcomes (YES/NO) coordinated over Nostr, with funds locked in on-chain Bitcoin scripts resolved by oracle-revealed preimages.

## Stack

- **React 19** + Vite + TypeScript + Tailwind v4
- **nostr-tools** for relay/event handling; NIP-44 encrypted DMs for counterparty messaging
- **@scure/btc-signer** for PSBT construction and script building
- **Dexie** (IndexedDB) for local contract and message persistence
- Requires a **Nostr browser extension** (Alby, nos2x) that exposes `window.nostr` with NIP-44 support
- Relay configured in settings (default: `wss://relay.damus.io`)
- Targets **regtest** Bitcoin (`bcrt1` addresses); `REGTEST` network constant in `src/lib/contract.ts`

## How it works

### Roles

- **Oracle** — creates a market (Kind 8050 event) committing to two SHA256 hashes (`yes_hash`, `no_hash`). Preimages stored in `localStorage`. Reveals one preimage at resolution blockheight.
- **Maker** — takes a side (YES/NO) on a market, stakes sats, publishes a Kind 30051 standing offer event. Can accept multiple takers sequentially. Each acceptance creates a separate deal contract; the standing offer stays open until the maker explicitly closes it (republish Kind 30051 with `status: closed`).
- **Taker** — finds an open offer, sends a `take_request` DM (Kind 14, NIP-44) to maker with their UTXO info. Receives funding PSBT back, signs and broadcasts. After broadcasting, publishes a Kind 30053 fill receipt with the txid and both wallet pubkeys for on-chain script verification.

### Contract lifecycle (status field in `db.ts`)

**Maker side — two separate records:**
```
Standing offer:  offer_pending ──────────────────────────────→ closed
Deal contract:   (created per accepted taker) psbt_sent → funded → resolved | refunded
```

**Taker side:**
```
awaiting_psbt → psbt_received → funded → resolved | refunded
```

When a maker accepts a taker, a new deal contract is created with a random UUID and an `offerId` field pointing back to the standing offer. The standing offer remains `offer_pending` so additional takers can still take it. Take_request messages are reassigned from the standing offer to the deal contract after acceptance to prevent re-notification on reload.

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

- `take_request` — taker → maker: `{ type, taker_pubkey, taker_wallet_pubkey, input: { txid, vout, amount }, change_address }`
- `psbt_offer` — maker → taker: `{ type, funding_psbt, maker_wallet_pubkey }` (base64 PSBT)
- DMs are tagged with the offer a-tag (`30051:makerPubkey:dTag`) to correlate with the local contract record

### Nostr event kinds

| Kind  | Purpose |
|-------|---------|
| 8050  | Market announcement (oracle) |
| 30051 | Standing offer (maker) — parameterized replaceable; status: `open` \| `closed` |
| 30052 | Oracle resolution |
| 30053 | Fill receipt (taker posts after broadcast; includes `funding_txid`, `maker_wallet_pubkey`, `taker_wallet_pubkey`, stakes) |
| 14    | Encrypted DM (NIP-44) — `take_request` / `psbt_offer` |

Note: Kind 30051 is **never** marked `filled` on chain. The taker posts a separate Kind 30053 fill receipt after broadcasting, and the maker closes the standing offer manually when done.

### Fill receipt (Kind 30053) tags

```
d                  txid (funding tx)
a                  30051:makerPubkey:offerId
m                  marketId
funding_txid       txid (duplicate of d, explicit)
side               maker's side (YES | NO)
maker_wallet_pubkey  x-only hex — used in DLC script
taker_wallet_pubkey  x-only hex — used in DLC script
maker_stake        sats
taker_stake        sats
```

Both wallet pubkeys are included so anyone can reconstruct the DLC output scripts and verify the txid on-chain.

## Key files

| File | Purpose |
|------|---------|
| `src/db.ts` | Dexie schema — `Contract` (`offerId` links deal→standing), `Message`, `KeyRecord` types |
| `src/lib/kinds.ts` | Event kind constants including KIND_FILL (30053) |
| `src/lib/contract.ts` | DLC script builder + `buildFundingTx` |
| `src/lib/electrumClient.ts` | Electrum client interface + backends (WS, mempool) |
| `src/lib/feeEstimator.ts` | P2TR vbyte constants + dynamic fee helpers |
| `src/lib/market.ts` | Parse market/offer/fill events; `computeStats(offers, fills)` |
| `src/lib/offerFlow.ts` | `sendTakeRequest`, `sendFundingPsbt` (returns dealId), `publishFillEvent` |
| `src/lib/spend.ts` | `signAndBroadcastFunding`, `refundFunding`, `claimFunding`, `consolidateUtxos` |
| `src/lib/types.ts` | `TakeRequest` / `TakerInput` wire types |
| `src/hooks/useCheckOffers.ts` | Subscribes to Kind 14 inbox; stores take_requests on standing offer, psbt_offers on taker contract |
| `src/hooks/useWatchFunding.ts` | Polls Electrum for deal contract funding confirmation |
| `src/hooks/useElectrum.ts` | React hook wrapping `ElectrumWS` |
| `src/context/RelayContext.tsx` | Single shared relay connection; `subscribe` / `publish` |
| `src/pages/OraclePage.tsx` | Create/publish markets as oracle |
| `src/pages/MarketsPage.tsx` | Browse markets and open offers |
| `src/pages/InboxPage.tsx` | 4-tab contract manager: standing / taken / funded / settled |
| `src/components/markets/MarketDetail.tsx` | Market detail: standing offers tab + filled receipts tab |

## Contracts page tabs

| Tab | Contents |
|-----|---------|
| **standing** | `offer_pending` maker contracts — open offers awaiting takers. Inline close button. |
| **taken** | `take_received`, `awaiting_psbt`, `psbt_sent`, `psbt_received` — active negotiations. |
| **funded** | `funded` — contracts confirmed on-chain. |
| **settled** | `resolved`, `refunded`, `cancelled`, `closed` — completed. Resolved rows show claimed/unclaimed badge based on `claimTxid`. |

## Dev

```bash
npm run dev      # Vite dev server
npm run build    # tsc + vite build
```

No tests. No backend. All state is local (IndexedDB) + Nostr relay.

## Notes

- Fees are dynamic: `blockchain.estimatefee 2` via Electrum (sat/vbyte), fallback 1 sat/vb for regtest
- P2TR vbyte estimates: FUNDING=298, REFUND=138, CLAIM=253 (see `src/lib/feeEstimator.ts`)
- Nostr x-only pubkeys are converted to 33-byte compressed (0x02 prefix) for script use
- Electrum scripthash is SHA256(scriptPubKey) reversed, computed in-browser via `crypto.subtle`
- The taker's `witnessUtxo.script` in the PSBT is placeholder — taker corrects it before signing
- Private keys may be plain-hex after a network switch; `getDecryptedPrivkey` handles both encrypted and unencrypted keys transparently and `reencryptPlainKeys` re-encrypts them on wallet unlock
