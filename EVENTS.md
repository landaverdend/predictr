# Event Specification

All events use custom kinds in the NIP-33 parameterized replaceable range (30000–39999) so relays keep only the latest version per `(pubkey, kind, d-tag)`.

---

## Kind 30050 — Oracle Announcement

Posted by the **oracle**. Defines a market by committing to two possible outcomes via SHA256 hashes. When the market resolves, the oracle reveals one preimage as a separate event (see below).

### Shape

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
    ["expiration", "<unix_timestamp>"]
  ],
  "content": "",
  "id": "...",
  "sig": "..."
}
```

### Tag Reference

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Unique market ID. Arbitrary string, e.g. a UUID or slug. Used for NIP-33 replaceability. |
| `question` | yes | Human-readable description of what is being resolved. |
| `yes_hash` | yes | `SHA256(yes_preimage)` — hex encoded. Funds locked to this hash pay out if YES wins. |
| `no_hash` | yes | `SHA256(no_preimage)` — hex encoded. Funds locked to this hash pay out if NO wins. |
| `resolution_blockheight` | yes | The Bitcoin block height at or after which the oracle commits to resolving. Also used as the contract timelock base. |
| `expiration` | yes | NIP-40 unix timestamp. Relay drops this event after expiry if the market is unresolved. |

### Oracle Commitment

By publishing this event, the oracle commits to revealing **exactly one** of the two preimages once `resolution_blockheight` is reached. The oracle's Nostr pubkey is the identity clients use to verify the resolution event.

> The oracle never needs to custody funds or interact with Bitcoin directly. It only posts a Nostr event.

---

## Kind 30051 — Market Offer

Posted by the **maker**. Declares intent to bet on one side of an oracle market. Contains no PSBT — the PSBT is exchanged privately over NIP-44 DMs after a taker responds.

### Shape

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
    ["amount", "10000"],
    ["status", "open"],
    ["expiration", "<unix_timestamp>"]
  ],
  "content": "",
  "id": "...",
  "sig": "..."
}
```

### Tag Reference

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Unique offer ID. Used for NIP-33 replaceability — maker overwrites this with `status: taken` once matched. |
| `e` | yes | Event ID of the Kind 30050 oracle announcement this offer is for. |
| `oracle` | yes | Oracle's pubkey. Duplicated here so clients can filter offers by oracle without fetching the announcement. |
| `market_id` | yes | The `d` tag of the oracle announcement. Allows clients to query all offers for a given market. |
| `side` | yes | `YES` or `NO` — the side the maker is taking. The taker always gets the opposite side. |
| `amount` | yes | Size of the position in satoshis. Both sides put up the same amount (binary market, 1:1). |
| `status` | yes | `open`, `taken`, or `cancelled`. Maker replaces this event to update. |
| `expiration` | yes | NIP-40 unix timestamp. Should not exceed the oracle's `resolution_blockheight` estimated time. |

### Lifecycle

```
open  →  taken      (maker matched with a taker, funding tx broadcast)
open  →  cancelled  (maker withdraws the offer)
open  →  (expired)  (NIP-40 expiry, relay drops automatically)
```

---

## Kind 30052 — Oracle Resolution

Posted by the **oracle** to reveal the winning preimage. Clients watch for this event to know when and how to claim their contract.

### Shape

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
  "content": "",
  "id": "...",
  "sig": "..."
}
```

### Tag Reference

| Tag | Required | Description |
|-----|----------|-------------|
| `d` | yes | Same `d` tag as the oracle announcement. Links resolution to market. |
| `e` | yes | Event ID of the Kind 30050 announcement being resolved. |
| `outcome` | yes | `YES` or `NO`. |
| `preimage` | yes | The raw preimage whose SHA256 matches the corresponding `yes_hash` or `no_hash` in the announcement. Clients verify this before using it to claim. |

### Verification

Before constructing a claim transaction, clients must verify:

```
SHA256(preimage) === yes_hash  (if outcome is YES)
SHA256(preimage) === no_hash   (if outcome is NO)
```

Both values come from the oracle announcement event. Never trust the resolution event alone.

---

## Relay Queries

### Fetch all open offers for a market

```json
{
  "kinds": [30051],
  "#market_id": ["<market_d_tag>"],
  "#oracle": ["<oracle_pubkey>"]
}
```

### Watch for resolution of a specific market

```json
{
  "kinds": [30052],
  "#d": ["<market_id>"],
  "authors": ["<oracle_pubkey>"]
}
```

### Fetch a maker's inbox (take requests only)

```json
{
  "kinds": [14],
  "#p": ["<maker_pubkey>"],
  "#e": ["<offer_id_1>", "<offer_id_2>"]
}
```

---

## Contract Derivation

Both parties derive the Taproot contract scripts deterministically from public information. No off-chain agreement needed beyond the PSBT exchange.

Given:
- `maker_pubkey` — from the Kind 30051 offer event
- `taker_pubkey` — provided in the take request DM
- `yes_hash`, `no_hash` — from the Kind 30050 oracle announcement
- `resolution_blockheight` — from the Kind 30050 oracle announcement

**Maker's contract** (maker took YES, so maker wins if oracle reveals yes_preimage):
```
Script 0: OP_SHA256 <yes_hash> OP_EQUALVERIFY <maker_pubkey> OP_CHECKSIG
Script 1: <resolution_blockheight + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <maker_pubkey> OP_CHECKSIG
```

**Taker's contract** (taker gets NO side):
```
Script 0: OP_SHA256 <no_hash> OP_EQUALVERIFY <taker_pubkey> OP_CHECKSIG
Script 1: <resolution_blockheight + 144> OP_CHECKLOCKTIMEVERIFY OP_DROP <taker_pubkey> OP_CHECKSIG
```

The funding transaction outputs both contracts. Either party can verify the outputs before signing.
