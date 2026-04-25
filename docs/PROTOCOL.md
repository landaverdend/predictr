# Protocol Specification

A P2P Bitcoin prediction market protocol over Nostr. Two parties bet on the outcome of an oracle-resolved binary event. No coordinator. No custodian. Funds are held in on-chain Bitcoin scripts; resolution is triggered by an oracle-published preimage.

---

## Nostr Event Kinds

| Kind  | Author  | Purpose                        | Replaceability |
|-------|---------|--------------------------------|----------------|
| 30050 | Oracle  | Market announcement            | NIP-33 (d-tag) |
| 30051 | Maker   | Open offer                     | NIP-33 (d-tag) |
| 30052 | Oracle  | Resolution / preimage reveal   | NIP-33 (d-tag) |
| 14    | Any     | NIP-44 encrypted DM            | Ephemeral      |

---

## Kind 30050 — Market Announcement

Posted by the **oracle**. Commits to two possible outcomes via SHA256 hashes. The oracle reveals exactly one preimage at resolution time.

```json
{
  "kind": 30050,
  "pubkey": "<oracle_pubkey_hex>",
  "created_at": 1234567890,
  "tags": [
    ["d", "<market_id>"],
    ["question", "Will BTC hit 100k before June 1 2026?"],
    ["yes_hash", "<sha256_hex_32_bytes>"],
    ["no_hash",  "<sha256_hex_32_bytes>"],
    ["resolution_blockheight", "895000"],
    ["image", "<url>"],
    ["r", "<relay_url>"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": "<human-readable description>"
}
```

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Unique market identifier. Used for NIP-33 replaceability. |
| `question` | yes | Human-readable binary question being resolved. |
| `yes_hash` | yes | `SHA256(yes_preimage)` as 64-char hex. Used in the YES script path. |
| `no_hash` | yes | `SHA256(no_preimage)` as 64-char hex. Used in the NO script path. |
| `resolution_blockheight` | yes | Block height at or after which the oracle posts the outcome event. Also the base for the CLTV refund timelock (`blockheight + 144`). |
| `image` | no | Cover image URL. |
| `r` | no | Relay hint. Repeat for multiple relays. |
| `expiration` | no | NIP-40 expiry timestamp. Relay drops the event after this. |

> The oracle never touches Bitcoin directly — it only posts a Nostr event containing the winning preimage.

---

## Kind 30051 — Maker Offer

Posted by the **maker** to advertise a position. No funds are committed on-chain until a taker responds and the funding transaction is broadcast.

```json
{
  "kind": 30051,
  "pubkey": "<maker_nostr_pubkey_hex>",
  "created_at": 1234567890,
  "tags": [
    ["d", "<offer_id>"],
    ["e", "<oracle_announcement_event_id>"],
    ["oracle", "<oracle_pubkey_hex>"],
    ["market_id", "<market_d_tag>"],
    ["side", "YES"],
    ["maker_stake", "100000"],
    ["confidence", "90"],
    ["status", "open"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": ""
}
```

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Unique offer ID. The maker replaces this event with `status: taken` once matched. |
| `e` | yes | Event ID of the Kind 30050 market announcement. |
| `oracle` | yes | Oracle pubkey. Duplicated for relay filtering without fetching the announcement. |
| `market_id` | yes | The `d` tag of the market announcement. |
| `side` | yes | `YES` or `NO` — the side the maker is taking. The taker always gets the opposite side. |
| `maker_stake` | yes | Sats the maker is putting up. |
| `confidence` | yes | Integer 1–99. The maker's stated probability the market resolves in their favour. Determines the taker's required stake. |
| `status` | yes | `open`, `taken`, or `cancelled`. |
| `expiration` | no | NIP-40 expiry timestamp. |

**Taker stake formula:**
```
taker_stake = ceil(maker_stake × (100 − confidence) / confidence)

Example: 100,000 sats at 90% confidence → taker_stake = 11,111 sats
```

**Offer lifecycle:**
```
open → taken      (matched; funding tx broadcast by taker)
open → cancelled  (maker withdraws offer)
open → (expired)  (NIP-40 drops event automatically)
```

---

## Kind 30052 — Oracle Resolution

Posted by the **oracle** when the market outcome is known. Contains the winning preimage.

```json
{
  "kind": 30052,
  "pubkey": "<oracle_pubkey_hex>",
  "created_at": 1234567890,
  "tags": [
    ["d", "<market_id>"],
    ["e", "<oracle_announcement_event_id>"],
    ["outcome", "YES"],
    ["preimage", "<hex_preimage>"]
  ],
  "content": ""
}
```

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Same `d` tag as the market announcement. |
| `e` | yes | Event ID of the Kind 30050 announcement. |
| `outcome` | yes | `YES` or `NO`. |
| `preimage` | yes | The raw preimage whose SHA256 matches `yes_hash` or `no_hash`. |

Clients **must** verify before constructing a claim transaction:
```
SHA256(preimage) === yes_hash   when outcome is YES
SHA256(preimage) === no_hash    when outcome is NO
```

Never trust the resolution event alone — always cross-check against the announcement hashes.

---

## Kind 14 — NIP-44 Encrypted DMs

All contract negotiation happens via NIP-44 encrypted direct messages (Kind 14). Each DM includes an unencrypted `e` tag referencing the offer event ID so clients can filter their inbox by open contracts.

### Message 1: Take Request (Taker → Maker)

Sent by the taker to express intent to fill a specific offer.

```json
{
  "type": "take_request",
  "taker_pubkey": "<taker_nostr_pubkey_hex>",
  "taker_wallet_pubkey": "<taker_x_only_wallet_pubkey_hex>",
  "input": {
    "txid": "<utxo_txid_hex>",
    "vout": 0,
    "amount": 12111
  },
  "change_address": "bcrt1p..."
}
```

| Field | Description |
|-------|-------------|
| `type` | Literal `"take_request"`. |
| `taker_pubkey` | Taker's Nostr pubkey (hex). The maker uses this to address the reply DM. |
| `taker_wallet_pubkey` | Taker's x-only BIP86 wallet pubkey (32-byte hex). Inserted into the DLC script leaves. |
| `input.txid` | UTXO the taker will spend as their contract input. |
| `input.vout` | Output index within that transaction. |
| `input.amount` | Value of the UTXO in satoshis. Must cover `taker_stake + fee (1000 sats)`. |
| `change_address` | Taker's address for any change output. |

### Message 2: Funding PSBT (Maker → Taker)

Sent by the maker in reply. Contains the partially-signed funding transaction.

```json
{
  "type": "psbt_offer",
  "funding_psbt": "<base64_encoded_psbt>",
  "maker_wallet_pubkey": "<maker_x_only_wallet_pubkey_hex>"
}
```

| Field | Description |
|-------|-------------|
| `type` | Literal `"psbt_offer"`. |
| `funding_psbt` | Base64-encoded PSBT. Maker's input (index 0) is pre-signed with `SIGHASH_ALL \| ANYONECANPAY`. Taker's input (index 1) is unsigned. |
| `maker_wallet_pubkey` | Maker's x-only BIP86 wallet pubkey (32-byte hex). Lets the taker independently reconstruct and verify the contract scripts. |

**Nostr event wrapper for both DMs:**
```json
{
  "kind": 14,
  "tags": [
    ["p", "<recipient_pubkey>"],
    ["e", "<offer_event_id>"]
  ],
  "content": "<nip44_encrypted_json>"
}
```

The `e` tag is unencrypted so relays and clients can filter without decrypting.

---

## Bitcoin Contract

### Funding Transaction Structure

```
Input  0:  maker UTXO  (covers maker_stake + 1000 sats fee)
Input  1:  taker UTXO  (covers taker_stake + 1000 sats fee)

Output 0:  maker_stake sats  →  maker's Taproot script
Output 1:  taker_stake sats  →  taker's Taproot script
Output 2:  maker change (optional, omitted if zero)
Output 3:  taker change (optional, omitted if zero)
```

Fee: `1000 sats per party`, hardcoded (`FEE_PER_PARTY = 1000`).

### Script Structure (P2TR with script-path spending)

Both outputs use the same three Tapscript leaves. Only the CLTV refund beneficiary differs between them.

**Output 0** — holds `maker_stake` sats:
```
Leaf 0 (YES path):  OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_wallet_pubkey> OP_CHECKSIG
Leaf 1 (NO path):   OP_SHA256 <no_hash>  OP_EQUALVERIFY <taker_wallet_pubkey> OP_CHECKSIG
Leaf 2 (CLTV):      <resolution_blockheight + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <maker_wallet_pubkey> OP_CHECKSIG
```

**Output 1** — holds `taker_stake` sats:
```
Leaf 0 (YES path):  OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_wallet_pubkey> OP_CHECKSIG
Leaf 1 (NO path):   OP_SHA256 <no_hash>  OP_EQUALVERIFY <taker_wallet_pubkey> OP_CHECKSIG
Leaf 2 (CLTV):      <resolution_blockheight + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <taker_wallet_pubkey> OP_CHECKSIG
```

The scripts are committed as a P2TR output with `TAPROOT_UNSPENDABLE_KEY` as the internal key (key-path spending is disabled).

All values (`yes_hash`, `no_hash`, `resolutionBlockheight`, `maker_wallet_pubkey`, `taker_wallet_pubkey`) are public and known to both parties before the funding transaction is signed. Either party can independently derive all scripts.

### Outcome Summary

| Scenario | Who spends | Which leaf | Both outputs |
|----------|-----------|------------|--------------|
| Oracle reveals `yes_preimage` | Maker | Leaf 0 | Maker claims both |
| Oracle reveals `no_preimage` | Taker | Leaf 1 | Taker claims both |
| Oracle never resolves (past CLTV) | Maker (output 0) | Leaf 2 | Each party claims their own |
| Oracle never resolves (past CLTV) | Taker (output 1) | Leaf 2 | Each party claims their own |

No cooperation required in any outcome. Every party can act unilaterally with only their private key and the oracle's public data.

### Taker PSBT Verification Checklist

Before signing, the taker's client must verify:

1. PSBT has at least 2 inputs and 2 outputs.
2. Input 1 `txid` + `vout` match the UTXO in the take request.
3. Output 0 script matches the Taproot script derived from `(yes_hash, no_hash, maker_wallet_pubkey, taker_wallet_pubkey, resolutionBlockheight)`.
4. Output 1 script matches the same derivation.
5. Output 0 `amount` equals `maker_stake`.
6. Output 1 `amount` equals `taker_stake`.
7. `takerInput.amount − takerChange ≤ taker_stake + 2000` — taker is not being drained beyond agreed stake + reasonable fee.

---

## Contract Lifecycle

**Maker state machine:**
```
offer_pending   → take_received   (taker DM arrives)
take_received   → psbt_sent       (maker sends funding PSBT)
psbt_sent       → funded          (funding tx seen on-chain)
funded          → resolved        (oracle reveals preimage; maker claims)
funded          → refunded        (CLTV expires; maker reclaims output 0)
```

**Taker state machine:**
```
awaiting_psbt   → psbt_received   (maker's PSBT DM arrives)
psbt_received   → funded          (taker signs and broadcasts)
funded          → resolved        (oracle reveals preimage; taker claims)
funded          → refunded        (CLTV expires; taker reclaims output 1)
```

---

## Relay Queries

```json
// All active markets
{ "kinds": [30050] }

// All open offers for a specific market
{ "kinds": [30051], "#market_id": ["<market_d_tag>"], "#oracle": ["<oracle_pubkey>"] }

// Watch for resolution
{ "kinds": [30052], "#d": ["<market_id>"], "authors": ["<oracle_pubkey>"] }

// Maker inbox — filter by known offer event IDs
{ "kinds": [14], "#p": ["<maker_pubkey>"], "#e": ["<offer_id_1>", "<offer_id_2>"] }

// Taker inbox — filter by known offer event IDs
{ "kinds": [14], "#p": ["<taker_pubkey>"], "#e": ["<offer_id_1>", "<offer_id_2>"] }
```
