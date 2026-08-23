# NeelKosh Backend

Express + TypeScript API bridging off-chain MRV data to the on-chain contracts, with a SQLite
cache (via Prisma) so the frontend never queries the chain directly for list views.

## Running it

Needs a local chain with the contracts deployed first:

```bash
cd ../contracts && npx hardhat node
```

```bash
cd ../contracts && npm run deploy:local
```

Then:

```bash
npm install
cp .env.example .env
npx prisma migrate deploy
npm run dev
```

Reads `../shared/contract-addresses.json` and `../shared/abis/` — the same files the contracts
deploy scripts write, so addresses are never copy-pasted. Set `CHAIN_NETWORK=amoy` to point at
Polygon Amoy instead; on amoy the wallet keys in `.env` are required, since the local test-key
defaults would be meaningless on a funded network.

## Endpoints

| Method | Path | Purpose | Requires |
| --- | --- | --- | --- |
| `POST` | `/api/auth/nonce` | Issue a one-time message for a wallet to sign | — |
| `POST` | `/api/auth/verify` | Verify the signature, issue a session JWT | — |
| `POST` | `/api/auth/register` | First-time wallet picks a role and org name | valid session token |
| `POST` | `/api/projects` | Register a project on chain, store off-chain metadata | `NGO` role |
| `GET` | `/api/projects` | List projects (from cache) merged with metadata | — |
| `GET` | `/api/projects/:id` | Registration, reporting periods, credit totals | — |
| `POST` | `/api/mrv/submit` | Hash + store an MRV report (optionally with a photo — see below), submit the hash on chain | — |
| `POST` | `/api/mrv/:submissionId/verify` | The oracle step: approve, then mint | `VERIFIER` role |
| `POST` | `/api/credits/:tokenId/retire` | Burn credits with a stated reason | — |
| `GET` | `/api/credits/:tokenId/history` | Full provenance for a credit batch | — |
| `GET` | `/api/marketplace/listings` | Active, still-stocked listings merged with project details | — |
| `POST` | `/api/marketplace/listings` | List a credit batch for sale | `NGO` role, project's own implementer |
| `POST` | `/api/marketplace/purchase` | Buy some or all of a listing | `BUYER` role |
| `POST` | `/api/marketplace/faucet` | Claim 10,000 NKR (SimStablecoin), once per 24h | `BUYER` role |
| `GET` | `/api/marketplace/purchases/:buyerAddress` | Purchase history for one buyer | — |

See [`src/routes/auth.ts`](src/routes/auth.ts) for the Sign-In With Ethereum flow and
[`src/middleware/auth.ts`](src/middleware/auth.ts) for `requireAuth`/`requireRole`. Roles: NGO,
VERIFIER, BUYER, ADMIN — ADMIN is not self-registerable (see
[`src/utils/roles.ts`](src/utils/roles.ts)).

## What "verified" means here

`src/services/oracleBridge.ts` carries the long-form answer, and it's worth reading before
demoing this. In short: putting a report hash on chain proves the report wasn't altered. It does
not prove the tonnage in it is true. What this system provides is a narrower, auditable claim —
an identified verifier approved exactly this tonnage, and the contracts enforce that the minted
amount matches what they signed. Trust comes from accountable verifiers and an inspectable
process, not from cryptography.

## Anti-fraud photo verification

`POST /api/mrv/submit` accepts an optional multipart field `photo` — a geotagged site photo. When
present, it's forwarded to mrv-engine's `POST /photo/verify-submission` (see
`../mrv-engine/mrv_engine/photo/`), which runs three explainable checks — does the photo's EXIF
GPS fall inside the project boundary, is it a near-duplicate of a photo already submitted for
this project, does it even look like vegetation — and returns `clear` / `review` / `reject` with
plain-English reasons.

This is advisory only. It's stored on the `MrvReport` row (`photoHash`, `photoVerification`) and
returned in the submit response and in `GET /api/projects/:id`'s `reportingPeriods`, for a human
verifier to read — it never blocks the on-chain submission or influences
`POST /api/mrv/:submissionId/verify` in any way. See `src/services/photoVerification.ts` for the
client and `src/routes/mrv.ts` for exactly where it sits in the submit flow: after the on-chain
transaction has already succeeded, so a photo-check failure (a corrupt upload, mrv-engine being
briefly down) can only ever leave `photoVerification: null` on an otherwise-successful
submission, never fail it.

Duplicate detection is durable across restarts on this side of the boundary: before calling
mrv-engine, this backend queries every prior `photoHash` on file for the project and passes them
in explicitly, rather than relying on mrv-engine's own in-memory fallback store (which exists so
mrv-engine's photo endpoints are independently testable, not for production use — see that
service's own docs).

## Marketplace

`POST /api/marketplace/listings` is gated to the project's own implementer, not just any `NGO` —
`requireRole` only proves "an NGO," so the route separately checks the caller against
`ProjectRegistry`'s cached implementer address. It also grants `Marketplace`'s ERC-1155 escrow
approval (`creditToken.setApprovalForAll`) the first time on the seller's behalf, since this
backend already holds their key for the demo.

`POST /api/marketplace/purchase` reads the listing straight from the chain, not the cache, before
acting — a money-moving call should check the same authoritative state `buyCredits` itself will
check. It also pre-checks the buyer's stablecoin balance and `Marketplace` allowance itself and
fails with a specific "you need N more NKR" / "approve at least N NKR" message rather than
propagating `buyCredits`'s raw revert. Unlike the seller's ERC-1155 approval above, this
deliberately does **not** auto-approve the ERC-20 spend on the buyer's behalf — an allowance is
consent to a specific amount, worth surfacing rather than silently granting, even though this
backend holds the buyer's demo key too. The exact 3-way split recorded is read back off the
`CreditsPurchased` event the transaction itself emitted, not recomputed from the marketplace
contract's current split percentages — those can change later via `setSplitBps`, and a settled
purchase keeps the split it actually paid at.

`GET /api/marketplace/listings` and the purchase history endpoint are cache reads, backed by two
new tables (`MarketplaceListing`, `MarketplacePurchase`) kept in sync by `src/services/eventSync.ts`
from `CreditsListed`, `ListingCancelled` and `CreditsPurchased`. Event-sync, not the routes'
write-through inserts, is the real source of truth here — a listing or a purchase can happen
directly on chain without going through this backend at all (a buyer connecting their own wallet
straight to `Marketplace` is exactly what a real, non-demo purchase looks like), the same way
`ProjectRegistered` already is for the project cache. Verified live: a purchase made by a wallet
outside this backend's buyer pool, calling `Marketplace` directly and never touching
`POST /api/marketplace/purchase`, still shows up correctly in purchase history and correctly
decrements the listing's remaining amount, purely from the event-sync listener; a full backfill
from block zero after wiping SQLite reproduces the exact same rows with no duplicates.

## Prototype scope

Wallets for the registrar, verifier, oracle and fixed pools of implementer (NGO) and buyer
addresses are held server-side in this process. That is a demo affordance. In production the
verifier and oracle keys belong in a KMS or HSM, and implementer/buyer transactions
(`submitForVerification`, `retireCredits`, `listCredits`, `buyCredits`, `claimFaucet`) would be
signed client-side by each party's own wallet — this backend would never hold that key. Endpoints
refuse rather than improvise when asked to act for an address it holds no key for.

On-chain state fully rebuilds from the event log if SQLite is lost. Off-chain data — project
descriptions, photos, and full MRV report bodies — does not; it exists only in SQLite. A
submission the backend never saw is recorded from the log with its report body marked unknown
rather than reconstructed.

Submitted photos themselves are not persisted anywhere — only the verification *result* is. The
photo lives in memory for the duration of the request (forwarded to mrv-engine, then discarded).
A production deployment would need durable photo storage (S3 or similar) so a verifier can view
the actual image later, not just the numbers a check produced from it.
