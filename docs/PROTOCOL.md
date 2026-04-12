# Protocol Specification

A P2P Bitcoin betting protocol over Nostr. Two parties bet on the outcome of an oracle-resolved event. No coordinator. No custodian.

---

## Nostr Events

All events use the NIP-33 parameterized replaceable range (30000–39999) so relays keep only the latest version per `(pubkey, kind, d-tag)`.

---

### Kind 30050 — Oracle Announcement

Posted by the **oracle**. Commits to two possible outcomes via SHA256 hashes. The oracle reveals one preimage when the market resolves.

```json
{
  "kind": 30050,
  "pubkey": "<oracle_pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["d", "<market_id>"],
    ["question", "Will BTC hit 100k before June 1 2026?"],
    ["yes_hash", "<sha256_hex>"],
    ["no_hash",  "<sha256_hex>"],
    ["resolution_blockheight", "895000"],
    ["image", "<url>"],
    ["r", "<relay_url>"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": "<description>"
}
```

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Unique market ID. Used for NIP-33 replaceability. |
| `question` | yes | Human-readable description of what is being resolved. |
| `yes_hash` | yes | `SHA256(yes_preimage)` hex. Unlocks the YES spending path. |
| `no_hash` | yes | `SHA256(no_preimage)` hex. Unlocks the NO spending path. |
| `resolution_blockheight` | yes | Block at or after which the oracle commits to posting the outcome. Used as timelock base. |
| `image` | no | Cover image URL for the market. |
| `r` | no | Relay hint. One tag per relay. Clients watch these for the resolution event. |
| `expiration` | yes | NIP-40 unix timestamp. Relay drops this event automatically on expiry. |

> The oracle never touches Bitcoin. It only posts a Nostr event.

---

### Kind 30051 — Market Offer

Posted by the **maker**. States a position on one side of a market at a given confidence level. No PSBT — negotiation happens over NIP-44 DMs after a taker responds.

```json
{
  "kind": 30051,
  "pubkey": "<maker_pubkey>",
  "created_at": 1234567890,
  "tags": [
    ["d", "<offer_id>"],
    ["e", "<oracle_announcement_event_id>"],
    ["oracle", "<oracle_pubkey>"],
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
| `d` | yes | Unique offer ID. Maker replaces with `status: taken` once matched. |
| `e` | yes | Event ID of the Kind 30050 oracle announcement. |
| `oracle` | yes | Oracle pubkey. Duplicated for relay filtering without fetching the announcement. |
| `market_id` | yes | The `d` tag of the oracle announcement. |
| `side` | yes | `YES` or `NO` — the side the maker is taking. Taker always gets the opposite. |
| `maker_stake` | yes | Sats the maker is putting up. Also what the taker wins if correct. |
| `confidence` | yes | Maker's confidence as an integer 1–99. Determines taker's required stake. |
| `status` | yes | `open`, `taken`, or `cancelled`. |
| `expiration` | yes | NIP-40 unix timestamp. |

**Implied taker stake:**
```
taker_stake = maker_stake * (100 - confidence) / confidence

e.g. 100,000 sats at 90% confidence → taker_stake = 11,111 sats
```

**Lifecycle:**
```
open  →  taken      (matched, funding tx broadcast)
open  →  cancelled  (maker withdraws)
open  →  (expired)  (NIP-40 drops automatically)
```

---

### Kind 30052 — Oracle Resolution

Posted by the **oracle** to reveal the winning preimage.

```json
{
  "kind": 30052,
  "pubkey": "<oracle_pubkey>",
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
| `d` | yes | Same `d` tag as the oracle announcement. |
| `e` | yes | Event ID of the Kind 30050 announcement. |
| `outcome` | yes | `YES` or `NO`. |
| `preimage` | yes | Raw preimage whose SHA256 matches `yes_hash` or `no_hash`. |

Clients **must** verify before constructing a claim tx:
```
SHA256(preimage) === yes_hash  (if outcome is YES)
SHA256(preimage) === no_hash   (if outcome is NO)
```

Never trust the resolution event alone — always verify against the announcement.

---

## Relay Queries

```json
// All open offers for a market
{ "kinds": [30051], "#market_id": ["<market_d_tag>"], "#oracle": ["<oracle_pubkey>"] }

// Watch for resolution
{ "kinds": [30052], "#d": ["<market_id>"], "authors": ["<oracle_pubkey>"] }

// Maker's inbox (take requests only)
{ "kinds": [14], "#p": ["<maker_pubkey>"], "#e": ["<offer_id_1>", "<offer_id_2>"] }
```

---

## Bitcoin Contract

### Funding Transaction

Two inputs, two outputs. Each output holds one party's stake in its own script.

```
input 0:   maker UTXO  (maker_stake sats)
input 1:   taker UTXO  (taker_stake sats)
output 0:  maker_stake sats  →  maker's HTLC script
output 1:  taker_stake sats  →  taker's HTLC script
```

### Script Paths

Both outputs use the same three script paths — only the timelock refund beneficiary differs.

**Output 0** (`maker_stake` sats):
```
Script 0: OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_pubkey> OP_CHECKSIG
Script 1: OP_SHA256 <no_hash>  OP_EQUALVERIFY <taker_pubkey> OP_CHECKSIG
Script 2: <resolution_blockheight + 144> OP_CLTV OP_DROP <maker_pubkey> OP_CHECKSIG
```

**Output 1** (`taker_stake` sats):
```
Script 0: OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_pubkey> OP_CHECKSIG
Script 1: OP_SHA256 <no_hash>  OP_EQUALVERIFY <taker_pubkey> OP_CHECKSIG
Script 2: <resolution_blockheight + 144> OP_CLTV OP_DROP <taker_pubkey> OP_CHECKSIG
```

### Outcomes

| Scenario | Output 0 | Output 1 |
|----------|----------|----------|
| Oracle reveals `yes_preimage` | Maker claims via Script 0 | Maker claims via Script 0 |
| Oracle reveals `no_preimage` | Taker claims via Script 1 | Taker claims via Script 1 |
| Oracle never resolves | Maker claims back via Script 2 | Taker claims back via Script 2 |

No cooperation needed in any scenario. Each party can act unilaterally.

### Script Derivation

Both parties derive all scripts deterministically from public data:

| Value | Source |
|-------|--------|
| `yes_hash`, `no_hash` | Kind 30050 tags |
| `resolution_blockheight` | Kind 30050 tag |
| `maker_pubkey` | Kind 30051 event author |
| `taker_pubkey` | Take request DM |
| `maker_stake` | Kind 30051 `maker_stake` tag |
| `taker_stake` | Derived: `maker_stake * (100 - confidence) / confidence` |

### Taker Verification (before signing)

The taker's client must verify the funding PSBT before signing:

1. Output 0 script matches the HTLC derived from public values
2. Output 1 script matches the HTLC derived from public values
3. Output 0 amount equals `maker_stake`
4. Output 1 amount equals `taker_stake`
5. Maker's input amount ≥ `maker_stake`
6. `yes_hash` / `no_hash` in the scripts match the oracle announcement
7. Taker's change output address matches the `change_address` sent in the take request
8. Taker's change amount equals `taker_input.amount - taker_stake - taker_fee_contribution`

---

## DM Negotiation (NIP-44)

All DMs include an unencrypted `e` tag referencing the offer event ID for inbox filtering.

### Round 1 — Take Request (Taker → Maker)

```json
{
  "type": "take_request",
  "taker_pubkey": "<hex>",
  "input": { "txid": "<hex>", "vout": 0, "amount": 11111 },
  "change_address": "bc1p..."
}
```

### Round 2 — Funding PSBT (Maker → Taker)

```json
{
  "type": "psbt_offer",
  "funding_psbt": "<base64>"
}
```

Maker's input is pre-signed (`SIGHASH_ALL | ANYONECANPAY`). Taker's input is unsigned.

### Taker Broadcasts

Taker verifies the PSBT (see checklist above), signs their input, and broadcasts. Maker updates the offer event to `status: taken` once they see the funding tx on-chain.

---

## Settlement

```
Oracle posts Kind 30052
  → winner verifies SHA256(preimage) matches announcement
  → winner builds claim tx spending both outputs via Script 0 or Script 1
  → winner broadcasts

Oracle never resolves (past resolution_blockheight + 144)
  → maker broadcasts claim tx spending output 0 via Script 2
  → taker broadcasts claim tx spending output 1 via Script 2
  → no coordination required
```
