# nostr_dlc — P2P Bitcoin Prediction Markets over Nostr

A trustless, browser-native P2P betting market where users post bets on Nostr, negotiate directly via encrypted DMs, and settle on-chain using Bitcoin Taproot contracts.

No coordinator. No custodian. No backend.

---

## Core Concepts

### Bitcoin Contracts (DLC-style)

Settlement uses **Taproot smart contracts** with oracle-gated spending paths. When a market resolves, the oracle reveals a SHA256 preimage that unlocks the winner's contract.

Each funded bet produces two mirrored contracts — one for each side:

```
Script 0: OP_SHA256 <outcome_hash> OP_EQUALVERIFY <holder_pubkey> OP_CHECKSIG
Script 1: <resolution_height + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <holder_pubkey> OP_CHECKSIG
```

- **Path 0**: Holder claims using the oracle's revealed preimage (only the correct side can claim)
- **Path 1**: Timelock refund to the same holder if the oracle never resolves

Both parties can always recover their funds unilaterally. No third party required.

### Oracle

A simple Schnorr signer that commits to an outcome by revealing a SHA256 preimage. Posts the preimage as a Nostr event when the market resolves. Could be a trusted third party, a multisig oracle committee, or a self-sovereign oracle for personal bets.

### Nostr

Used for three things:
1. **Public offer discovery** — market feed of open bets
2. **Private negotiation** — encrypted DMs (NIP-44) to pass PSBTs between maker and taker
3. **Settlement signal** — oracle posts resolution preimage as a Nostr event

---

## Protocol Flow

### 1. Maker Posts a Bet

Maker publishes a **NIP-33 parameterized replaceable event** (Kind 30xxx):

```json
{
  "kind": 30042,
  "tags": [
    ["d", "<offer_id>"],
    ["oracle", "<oracle_pubkey>"],
    ["market", "<market_event_id>"],
    ["amount", "10000"],
    ["side", "YES"],
    ["expiration", "<unix_timestamp>"],
    ["status", "open"]
  ],
  "content": "Will BTC hit 100k before June?"
}
```

No PSBT in the public event — just the terms.

### 2. Taker Expresses Interest

Taker sends an encrypted DM (NIP-44) to the maker, tagged with the offer event ID so the maker's inbox can filter it:

```json
{
  "kind": 14,
  "tags": [
    ["p", "<maker_pubkey>"],
    ["e", "<offer_event_id>"]
  ],
  "content": "<encrypted: { type: 'take_request', taker_pubkey, input, change_address }>"
}
```

### 3. Maker Accepts

Maker sees the request in their inbox, clicks accept. App constructs the full PSBT:
- Maker's input (pre-signed, `SIGHASH_ALL | ANYONECANPAY`)
- Taker's input (unsigned placeholder)
- Output 0: Maker's Taproot contract
- Output 1: Taker's Taproot contract

Maker sends PSBT to taker via encrypted DM.

### 4. Taker Signs and Broadcasts

Taker's app receives the PSBT, adds their signature, and broadcasts via WebSocket Electrum. Sends the txid back to maker via DM.

### 5. Maker Closes the Offer

Maker publishes a replacement NIP-33 event with `status: "taken"`. Relay overwrites the original offer. Market feed stays clean.

### 6. Settlement

Oracle posts the resolution preimage to Nostr. Winner's app detects it, constructs the claim transaction, and broadcasts. No coordinator needed.

---

## Inbox Filtering

Since NIP-44 DMs have unencrypted tags, the maker's app subscribes to only protocol-relevant messages:

```json
{ "kinds": [14], "#p": ["<maker_pubkey>"], "#e": ["<offer_id_1>", "<offer_id_2>"] }
```

Only DMs tied to open offers appear in the inbox.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Key management + signing | NIP-07 browser extension (Alby) |
| Bitcoin Taproot contracts | secp256k1 / Schnorr (same curve as Nostr) |
| UTXO queries + broadcast | WebSocket Electrum |
| Offer discovery | Nostr NIP-33 replaceable events |
| PSBT negotiation | Nostr NIP-44 encrypted DMs |
| Oracle resolution | Nostr event (preimage reveal) |
| Offer expiry | Nostr NIP-40 expiration tags |

**No backend server. No database. No Lightning required.**

---

## Trust Model

| Actor | Can steal funds? | Can censor? | Can cheat? |
|-------|-----------------|-------------|-----------|
| Oracle | No | N/A | Yes (lie about outcome) — mitigate with multisig oracle |
| Nostr relays | No | Yes (drop events) | No |
| Maker | No | N/A | No (contracts enforced on-chain) |
| Taker | No | N/A | No |

The only trusted party is the oracle. Everything else is enforced by Bitcoin script.

---

## Double-Accept Handling

The maker is online during the DM negotiation phase (they're responding to inbox messages). They simply choose the first taker they want to match with and ignore the rest. No race condition.

---

## Relay Cleanliness

- **NIP-33**: Maker replaces their offer event when taken or cancelled
- **NIP-40**: Expiration tag set to oracle resolution time — untaken offers self-destruct
- Stale offers that slip through are harmless — takers attempt broadcast and get a conflict error from Electrum if the UTXO is already spent

---

## Prior Art

Built on learnings from [aggeus](../aggeus/) — a more complete coordinator-based prediction market using the same Taproot contract primitives. This project strips the coordinator and Lightning payment layers in favor of direct P2P negotiation over Nostr.
