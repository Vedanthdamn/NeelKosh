# NeelKosh

A blockchain-based blue carbon registry and MRV (Monitoring, Reporting, Verification) system for
India's mangrove, seagrass and saltmarsh restoration. Built as a Smart India Hackathon prototype.

The pitch, in one line: a carbon credit is a claim, and this registry makes it a checkable one —
every credit traces from a hashed field report through an independent verifier's signature to
issuance, transfer and retirement, all on chain.

## The four services

| Service | What it does | Stack |
| --- | --- | --- |
| [`contracts/`](contracts/README.md) | ProjectRegistry, VerificationRegistry, CarbonCreditToken | Solidity, Hardhat |
| [`backend/`](backend/README.md) | Bridges off-chain MRV data to the contracts, caches on-chain state in SQLite | Node, Express, Prisma |
| [`mrv-engine/`](mrv-engine/README.md) | Simulates satellite-derived NDVI and carbon quantification (no live Sentinel-2 access for this demo — clearly labeled everywhere it appears) | Python, FastAPI |
| [`frontend/`](frontend/README.md) | Public registry, project detail, and the credit verification page | Next.js, Tailwind |

They talk to each other over plain HTTP, plus one shared filesystem contract:
[`shared/`](shared/) holds the deployed contract addresses and ABIs that `contracts/`'s deploy
scripts write and `backend/` reads — the one thing that isn't an HTTP call, since the backend
needs it before it can make any.

## Running the whole thing

```bash
scripts/start-demo.sh
```

Boots everything in the order each piece depends on the last — local Hardhat node, deploy
contracts, backend, mrv-engine, seed demo data, frontend — waiting for each one to actually
respond before starting the next rather than guessing with a fixed delay. Takes a couple of
minutes. When it's done:

- Frontend: http://localhost:3000
- Backend health: http://localhost:4000/health
- mrv-engine docs: http://localhost:8088/docs
- Hardhat RPC: http://localhost:8545

```bash
scripts/stop-demo.sh
```

stops all four. Logs for each service land in `.demo-logs/` (gitignored) if something needs
debugging.

**First time only**, install each service's dependencies (the start script checks for these and
tells you if one's missing, but doesn't install them itself):

```bash
(cd contracts && npm install)
(cd backend && npm install)
(cd frontend && npm install)
(cd mrv-engine && python3 -m venv .venv && source .venv/bin/activate && pip install -r requirements.txt && pip install -e .)
```

### Running it by hand instead

Each service's own README has the full detail, but in short, across four terminals, in order:

```bash
cd contracts && npx hardhat node                                    # 1. local chain
cd contracts && npm run deploy:local                                # 2. deploy (after 1 is up)
cd backend && cp .env.example .env && npx prisma migrate deploy && npm run dev   # 3. backend
cd mrv-engine && source .venv/bin/activate && uvicorn mrv_engine.api:app --port 8088  # 4. mrv-engine
node scripts/seed-demo.mjs                                          # 5. demo data (after 3 & 4 are up)
cd frontend && cp .env.example .env.local && npm run dev            # 6. frontend
```

## The demo user journey

1. **Register** a project at `/register` — draws a boundary on a map, writes to
   `ProjectRegistry` on chain.
2. **Submit MRV data** — `POST /api/mrv/submit` on the backend, typically fed by calling
   mrv-engine's `POST /calculate` first to get a simulated NDVI/tonnage reading for a reporting
   period. `scripts/seed-demo.mjs` does exactly this for the seeded demo projects; there's no
   dedicated frontend form for it in this prototype; it's the field-data step other MRV tooling
   would normally own.
3. **Verify** — `POST /api/mrv/:submissionId/verify` is the oracle step: approves as the
   verifier, then immediately mints as the oracle. See
   [`backend/src/services/oracleBridge.ts`](backend/src/services/oracleBridge.ts) for what
   "verified" actually means here.
4. **View on the dashboard** — `/projects` and `/projects/:id` on the frontend, reading from the
   backend's cache (never the chain directly, for speed).
5. **Retire** — `POST /api/credits/:tokenId/retire` burns credits with a stated reason,
   permanently.
6. **Verify lookup** — `/verify/:tokenId` on the frontend: the public, no-login page anyone can
   use to check a credit's complete chain of custody.

Steps 2, 3 and 5 are backend API calls in this prototype rather than frontend forms — the
frontend's job here is the public-facing registry and verification experience, not an internal
operator console for verifiers and the oracle bridge.

## Prototype scope, honestly

This is a hackathon prototype, not production infrastructure. Every place something is
simulated, faked for demo purposes, or scoped down says so explicitly in a comment or a
README — see in particular `mrv-engine/mrv_engine/ndvi.py` (synthetic satellite data),
`backend/README.md` (server-held demo wallets), and `contracts/README.md` (the issuance chain's
actual guarantees). If you're evaluating this and can't find where a number comes from, that's a
bug in the documentation — file it as such.
