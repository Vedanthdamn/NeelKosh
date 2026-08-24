# NeelKosh

NeelKosh is a blockchain-based registry and MRV (Monitoring, Reporting, Verification) system for
blue carbon restoration projects — mangrove, seagrass, and saltmarsh sites, mostly along the
Indian coastline. It was built as a prototype for Smart India Hackathon.

## The problem

Blue carbon credits are currently issued through a process most participants can't inspect.
A project reports a sequestration figure, a consultant reviews it and signs a PDF, and the
credit gets sold. The satellite or field data behind the number, the verifier's reasoning, and
the exact report a credit was minted against are typically not available to anyone outside that
transaction. If a claim later turns out to be wrong, there is usually no record showing where
the process broke down.

NeelKosh restructures that process around three properties: every claim is tied to a
cryptographic hash of the report it's based on, every approval is signed by an identified
verifier and recorded permanently, and issuance is enforced by a smart contract that can only
mint the exact tonnage a verifier approved — not more, not twice. None of this proves a claim is
scientifically correct. It proves who approved what, when, and against which specific piece of
evidence, and makes that trail inspectable by anyone, not just the transacting parties.

## Architecture

Five services, plus a shared filesystem contract between two of them:

```
 mrv-engine                    backend                       contracts
 (Python, FastAPI)             (Node, Express, Prisma)        (Solidity, Hardhat)

 synthetic NDVI/carbon +   ->  oracle bridge: hashes    ---->  ProjectRegistry
 explainable photo checks      reports, submits claims         VerificationRegistry
 (geofence, duplicate,         on chain, approves and          CarbonCreditToken (ERC-1155)
 vegetation plausibility)      mints, tracks retirement,       SimStablecoin (ERC-20 "NKR")
                                runs the marketplace            Marketplace
                                       |
                                       |  cached reads (SQLite, synced from
                                       |  on-chain events — neither frontend
                                       v  queries the chain directly)
                          ------------------------
                          |                       |
                      frontend              verifier-portal
                   (Next.js, Tailwind)    (Next.js, dense/operational)
                   public registry,        MRV review queue,
                   marketplace, buyer       fraud-check indicators,
                   wallet flows             approve/reject
```

- **`contracts/`** — `ProjectRegistry` (which sites exist and who's accountable for them),
  `VerificationRegistry` (MRV claims and the independent sign-off that gates issuance),
  `CarbonCreditToken` (an ERC-1155 credit token, one unit per tonne of CO2 equivalent, with
  permanent burn-based retirement), `SimStablecoin` (a faucet-only ERC-20 standing in for a real
  payment rail), and `Marketplace` (lists and sells credits, splitting payment three ways between
  the selling NGO, a platform treasury, and a community fund). See
  [`contracts/README.md`](contracts/README.md).
- **`backend/`** — the bridge between off-chain MRV data and the contracts. Registers projects,
  hashes and submits MRV reports (optionally with a geotagged photo run through mrv-engine's
  anti-fraud checks), runs the two-step oracle process (verifier approval, then minting), handles
  retirement, drives the marketplace (listings, purchases, faucet), and maintains a SQLite cache
  of on-chain state so neither frontend is making one RPC call per list item. See
  [`backend/README.md`](backend/README.md).
- **`mrv-engine/`** — generates the NDVI and carbon-sequestration figures the backend's MRV
  submissions are built from (currently synthetic; see "What's simulated" below), plus three
  independent, explainable anti-fraud checks on a submitted site photo — geofence, duplicate
  detection, and a vegetation-plausibility heuristic. See [`mrv-engine/README.md`](mrv-engine/README.md).
- **`frontend/`** — the public registry: project listings and detail (map, growth chart, credit
  history), project registration, the marketplace (browse listings, connect a wallet, faucet,
  approve, buy), a buyer's held credits and retirement history, and the credit verification
  lookup page. See [`frontend/README.md`](frontend/README.md).
- **`verifier-portal/`** — a separate app, not a route inside `frontend/`, for accredited
  verifiers: a queue of pending MRV submissions with green/amber/red fraud-check indicators, a
  detail page (fraud-check reasoning, geofence map, MRV data), and approve/reject wired to the
  same backend. Deliberately styled dense and operational rather than the public site's marketing
  register.
- **`shared/`** — not a service. `contracts/`'s deploy scripts write deployed contract addresses
  and ABIs here; `backend/` reads them at startup, and both frontends read the marketplace
  contracts' ABIs/addresses directly for the pieces of the buy flow a connected wallet signs
  itself. The one integration point that isn't an HTTP call, because the backend needs it before
  it can make any.

## Running it locally

```bash
scripts/start-demo.sh
```

Starts all five services in dependency order — local Hardhat node, contract deployment, backend,
mrv-engine, demo data seeding, frontend, verifier-portal — waiting for each one to actually
respond before starting the next. Takes a couple of minutes on first run.

- Frontend: http://localhost:3000
- Verifier portal: http://localhost:3001
- Backend health check: http://localhost:4000/health
- mrv-engine interactive docs: http://localhost:8088/docs
- Hardhat RPC: http://localhost:8545

```bash
scripts/stop-demo.sh
```

stops all five. Per-service logs are written to `.demo-logs/` (gitignored).

**First run only** — install each service's dependencies (`start-demo.sh` checks for these and
tells you what's missing, but doesn't install anything itself):

```bash
npm install   # repo root — ethers, for scripts/seed-demo.mjs to sign in as each demo account
(cd contracts && npm install)
(cd backend && npm install)
(cd frontend && npm install)
(cd verifier-portal && npm install)
(cd mrv-engine && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && pip install -e .)
```

To run each piece by hand instead, in order, across separate terminals:

```bash
cd contracts && npx hardhat node                                              # 1. local chain
cd contracts && npm run deploy:local                                          # 2. deploy (after 1 is up)
cd backend && cp .env.example .env && npx prisma migrate deploy && npm run dev   # 3. backend
cd mrv-engine && source .venv/bin/activate && uvicorn mrv_engine.api:app --port 8088  # 4. mrv-engine
node scripts/seed-demo.mjs                                                    # 5. demo data (after 3 and 4 are up)
cd frontend && cp .env.example .env.local && npm run dev                      # 6. frontend (port 3000)
cd verifier-portal && cp .env.example .env.local && npm run dev -- -p 3001    # 7. verifier portal (port 3001)
```

Each service's own README has network configuration for Polygon Amoy instead of the local chain.

### The user journey this supports

1. **Register** a project — `/register` on the frontend: connect a wallet, sign in (see
   "Wallet-based auth" below; a new wallet is auto-registered as NGO), draw a boundary on a map,
   submit. Writes to `ProjectRegistry` and requires the NGO role.
2. **Submit MRV data** — `POST /api/mrv/submit` on the backend, fed by a reading from
   mrv-engine's `POST /calculate` and, optionally, a geotagged site photo run through
   mrv-engine's fraud checks (geofence, duplicate detection, vegetation plausibility).
   `scripts/seed-demo.mjs` does this for the seeded demo projects; there's no dedicated frontend
   form for it, since this prototype's public-frontend scope is the registry and verification
   experience, not an operator console — submission is an NGO/operator action, which is what
   `verifier-portal` and the seed script model.
3. **Verify** — the verifier portal (`verifier-portal`, http://localhost:3001): sign in as
   VERIFIER, see the pending-submission queue with green/amber/red fraud-check indicators,
   open a submission to see the reasoning and geofence map, then approve or reject. Approval
   drives `POST /api/mrv/:submissionId/verify` on the backend, which approves as the verifier and
   mints as the oracle in the same call. See
   [`backend/src/services/oracleBridge.ts`](backend/src/services/oracleBridge.ts) for what
   "verified" means here and what it doesn't.
4. **View on the dashboard** — `/projects` and `/projects/:id` on the frontend, reading from the
   backend's cache.
5. **List and buy** — the selling NGO lists minted credits on `/marketplace`; a buyer connects a
   wallet, signs in (auto-registered as BUYER), claims demo funds from the SimStablecoin faucet,
   approves the `Marketplace` contract to spend, and buys. The purchase price splits three ways
   on-chain (NGO, platform treasury, community fund) in the same transaction — see
   [`contracts/README.md`](contracts/README.md) for the split mechanics.
6. **View holdings and retire** — `/my-credits` on the frontend lists a connected buyer's
   balances; `POST /api/credits/:tokenId/retire` burns credits against a stated reason,
   permanently.
7. **Verify lookup** — `/verify/:tokenId` on the frontend: a public page for checking any
   credit's complete chain of custody — origin, mint, purchase (with the split), and
   retirement — no login required.

### Wallet-based auth

Three roles — NGO, VERIFIER, BUYER — plus ADMIN (not self-registerable; see
[`backend/src/utils/roles.ts`](backend/src/utils/roles.ts)). No passwords: a wallet's signature
over a one-time nonce is the credential, the standard Sign-In With Ethereum pattern.
`POST /api/auth/nonce` issues a message to sign, `POST /api/auth/verify` recovers the signer and
returns a session JWT, `POST /api/auth/register` lets a first-time wallet pick a role and
organisation name. Both frontends drive this for real: the main frontend on `/register` (NGO),
the marketplace buy flow and `/my-credits` (BUYER), and `verifier-portal` in its entirety
(VERIFIER); `scripts/seed-demo.mjs` also drives it directly to seed demo projects, submissions,
and listings without a browser (5 demo accounts, all Hardhat's well-known local test keys,
printed with their roles on every run).

## What's simulated, and what isn't

**Simulated:** every NDVI reading and biomass/carbon figure mrv-engine produces. This prototype
has no Google Earth Engine or Sentinel-2 access, so `mrv-engine/mrv_engine/ndvi.py` generates a
synthetic logistic growth curve instead — deterministic per project so repeated calls return a
stable value, but not derived from an actual satellite image. This is stated at the top of every
module that touches it, not left implicit.

This is also the specific integration point where real data would plug in. `ndvi.py`'s module
docstring includes the concrete replacement: an Earth Engine query against
`COPERNICUS/S2_SR_HARMONIZED`, filtered to the project's registered boundary and reporting
period, cloud-masked, reduced to a mean NDVI over the polygon. The function signature doesn't
change — callers in `biomass.py` and the API layer wouldn't need touching. What would need
recalibrating is `biomass.py`'s NDVI-to-biomass regression coefficients, which are illustrative
placeholders tuned only to sit within the right order of magnitude for tropical mangrove
biomass; a real deployment calibrates those against field plots for the actual species and
region.

**Also demo-scoped:** `backend/`'s registrar, verifier, and oracle wallets are held
server-side in the Node process, and a fixed pool of "implementer" wallets stands in for
NGOs' own wallets. That's a deliberate simplification for a hackathon demo, not an oversight —
see `backend/README.md`'s "Prototype scope" section for what a production deployment would do
differently (KMS-held operational keys, client-side signing for implementer transactions).

**Not simulated:** the contracts, deployed and tested against a real EVM (locally via Hardhat,
or Polygon Amoy). The two-step verification process, the exact-tonnage minting constraint, the
report-hash linkage between an MRV submission and the credit it produces, the burn-based
retirement that makes a credit permanently unspendable — all of that is real, enforced by the
Solidity code in `contracts/`, not mocked or simulated anywhere in the stack. The gap this
prototype leaves for a production version is entirely on the input side (real satellite data,
real field calibration, real key management) — not in how the ledger itself behaves once it has
a number to work with.
