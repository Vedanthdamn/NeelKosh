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

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/projects` | Register a project on chain, store off-chain metadata |
| `GET` | `/api/projects` | List projects (from cache) merged with metadata |
| `GET` | `/api/projects/:id` | Registration, reporting periods, credit totals |
| `POST` | `/api/mrv/submit` | Hash + store an MRV report, submit the hash on chain |
| `POST` | `/api/mrv/:submissionId/verify` | The oracle step: approve, then mint |
| `POST` | `/api/credits/:tokenId/retire` | Burn credits with a stated reason |
| `GET` | `/api/credits/:tokenId/history` | Full provenance for a credit batch |

## What "verified" means here

`src/services/oracleBridge.ts` carries the long-form answer, and it's worth reading before
demoing this. In short: putting a report hash on chain proves the report wasn't altered. It does
not prove the tonnage in it is true. What this system provides is a narrower, auditable claim —
an identified verifier approved exactly this tonnage, and the contracts enforce that the minted
amount matches what they signed. Trust comes from accountable verifiers and an inspectable
process, not from cryptography.

## Prototype scope

Wallets for the registrar, verifier, oracle and a fixed pool of implementer (NGO) addresses are
held server-side in this process. That is a demo affordance. In production the verifier and
oracle keys belong in a KMS or HSM, and implementer transactions (`submitForVerification`,
`retireCredits`) would be signed client-side by the organisation's own wallet — this backend
would never hold that key. Endpoints refuse rather than improvise when asked to act for an
address it holds no key for.

On-chain state fully rebuilds from the event log if SQLite is lost. Off-chain data — project
descriptions, photos, and full MRV report bodies — does not; it exists only in SQLite. A
submission the backend never saw is recorded from the log with its report body marked unknown
rather than reconstructed.
