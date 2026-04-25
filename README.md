# predictr

A browser-based Bitcoin bet coordinator. Two parties take opposite sides of a binary YES/NO outcome, coordinated over Nostr, with funds locked in Taproot scripts resolved by an oracle revealing a hash preimage. There is no order book, no secondary market, and no way to exit a position early — once both sides fund, the contract runs to resolution.

This is a **hash-revealed binary outcome contract** — it uses the same hashlock + timelock primitives as an HTLC, but with two competing hashlocks (one per outcome) adjudicated by a neutral third-party oracle rather than a single preimage known ahead of time by a recipient. The oracle has no on-chain presence; it simply publishes the winning preimage to Nostr when the outcome is known.

No backend. All state is local (IndexedDB via Dexie) plus a Nostr relay.

---

## Roles

### Oracle
Creates a market by publishing a Kind 8050 event committing to two SHA256 hashes — one for each outcome. The preimages are kept secret and stored locally. At resolution, the oracle publishes a Kind 8052 event revealing the winning preimage.

> **Note:** Oracles here are single-key — one party controls both preimages and can unilaterally determine the outcome. Multisig oracles (requiring M-of-N independent parties to cooperate on resolution) would be a natural extension to prevent a single oracle from manipulating outcomes.

### Maker
Takes a side (YES or NO) on a market and stakes sats. Publishes a Kind 30051 standing offer event. When a taker responds, the maker reviews the take request, constructs the funding PSBT, signs their input with `SIGHASH_ALL|ANYONECANPAY`, and sends it to the taker via encrypted DM.

A standing offer remains open until the maker explicitly closes it. The maker can accept multiple takers against the same offer — each acceptance creates an independent deal contract while the standing offer stays open for additional takers.

### Taker
Finds an open offer, sends a `take_request` DM to the maker, waits for the funding PSBT, validates it, adds and signs their own input, and broadcasts the fully-signed transaction. After broadcasting, publishes a Kind 30053 fill receipt with the txid and both wallet pubkeys so anyone can verify the contract on-chain.

---

## Contract Script

Each party gets their own output in the funding transaction. Both outputs share the same YES and NO leaves but have different CLTV leaves (each party can only refund their own output).

```
OP_IF (YES leaf)
  OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_wallet_pubkey> OP_CHECKSIG
OP_ELSE (NO leaf)
  OP_SHA256 <no_hash>  OP_EQUALVERIFY <taker_wallet_pubkey> OP_CHECKSIG
OP_ENDIF

(CLTV leaf — per output)
  <resolutionBlockheight + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <party_wallet_pubkey> OP_CHECKSIG
```

Funded as P2TR (Taproot) using an unspendable internal key. The three leaves are compiled into a Huffman tree; walk order is `[no=0, cltv=1, yes=2]`.

The scripts use **wallet pubkeys** (stored in IndexedDB), not Nostr pubkeys, so parties can sign refunds and claims without their Nostr extension.

---

## Funding Transaction Structure

```
Inputs:
  [0] maker UTXO  — signed SIGHASH_ALL|ANYONECANPAY by maker
  [1] taker UTXO  — signed SIGHASH_ALL by taker

Outputs:
  [0] maker contract output  (makerStake sats)
  [1] taker contract output  (takerStake sats)
  [2] maker change (optional)
  [3] taker change (optional)
```

Fees are dynamic: fetched from `blockchain.estimatefee 2` (Electrum) or `/api/v1/fees/recommended` (mempool), falling back to 1 sat/vbyte for regtest.

---

## Contract Lifecycle

**Maker — two separate local records:**
```
Standing offer:  offer_pending ─────────────────────────────→ closed
Deal contract:   psbt_sent → funded → resolved | refunded
```

**Taker:**
```
awaiting_psbt → psbt_received → funded → resolved | refunded
```

When the maker accepts a taker, a new **deal contract** is created with a random ID and an `offerId` back-reference to the standing offer. The standing offer stays `offer_pending` so more takers can fill it. The maker closes the standing offer manually when done.

The contracts page shows four tabs:

| Tab | Contents |
|-----|---------|
| **standing** | Open maker offers — close button available |
| **taken** | Active negotiations (PSBT exchange in progress) |
| **funded** | On-chain confirmed contracts |
| **settled** | Resolved, refunded, or closed — resolved rows show claimed/unclaimed status |

---

## Messaging Protocol

All DMs are **Kind 14** events encrypted with **NIP-44** (XChaCha20-Poly1305). Each DM is tagged with the offer a-tag (`30051:makerPubkey:offerId`) to correlate with the local contract record.

### `take_request` (taker → maker)
```json
{
  "type": "take_request",
  "taker_pubkey": "<nostr pubkey — for DM reply>",
  "taker_wallet_pubkey": "<x-only hex — for contract script>",
  "input": { "txid": "...", "vout": 0, "amount": 10000 },
  "change_address": "bcrt1q..."
}
```

### `psbt_offer` (maker → taker)
```json
{
  "type": "psbt_offer",
  "funding_psbt": "<base64 PSBT — maker input signed, taker input unsigned>",
  "maker_wallet_pubkey": "<x-only hex — for contract script>"
}
```

---

## Nostr Event Kinds

| Kind  | Type | Purpose |
|-------|------|---------|
| 8050  | Regular (immutable) | Market announcement — oracle commits to yes/no hashes |
| 8052  | Regular (immutable) | Resolution — oracle reveals winning preimage and outcome |
| 30051 | Parameterized replaceable | Standing offer — maker's stake, side, confidence; status `open` or `closed` (never `filled`) |
| 30053 | Parameterized replaceable | Fill receipt — taker posts after broadcast; d-tag is the funding txid |
| 14    | Ephemeral | Encrypted DM (NIP-44) — `take_request` / `psbt_offer` |

Kinds 8050 and 8052 are non-replaceable to prevent retroactive manipulation of market terms or outcomes.

Kind 30051 is **never** marked filled on-chain. Proof of funding lives in Kind 30053, which includes both wallet pubkeys so the DLC script can be reconstructed and the txid verified on-chain by anyone.

### Fill receipt (Kind 30053) tags

| Tag | Value |
|-----|-------|
| `d` | funding txid |
| `a` | `30051:makerPubkey:offerId` |
| `m` | marketId |
| `funding_txid` | funding txid (explicit) |
| `side` | maker's side (`YES` \| `NO`) |
| `maker_wallet_pubkey` | x-only hex |
| `taker_wallet_pubkey` | x-only hex |
| `maker_stake` | sats |
| `taker_stake` | sats |

---

## Settlement

### Claim (winner)
The winner spends **both** contract outputs (indices 0 and 1) in a single transaction using the oracle-revealed preimage. The witness for each input is manually constructed as:

```
[sig, preimage, leaf_script, control_block]
```

Both outputs go to a single payout address chosen by the winner.

### Refund (either party)
After `resolutionBlockheight + 144` blocks, each party can spend their own output via the CLTV leaf. The maker refunds output 0; the taker refunds output 1.

---

## PSBT Validation (taker-side)

Before signing the funding PSBT, the taker validates:
1. At least 2 inputs and 2 outputs are present
2. Input 1 references the expected UTXO (`txid:vout` from the `take_request`)
3. Output 0 and 1 scripts match those produced by locally rebuilding the contract scripts from the agreed parameters
4. Output amounts match the agreed stakes
5. Total deducted from the taker's UTXO does not exceed `takerStake + fee`
