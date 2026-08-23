# NeelKosh Contracts

Smart contracts for the blue carbon registry and MRV system. Three contracts, deployed together
and wired by role.

| Contract | Responsibility |
| --- | --- |
| `ProjectRegistry` | Which restoration sites exist, who runs them, whether they are in good standing |
| `VerificationRegistry` | MRV claims and the independent sign-off that gates issuance |
| `CarbonCreditToken` | ERC-1155 credits, one token unit per tonne of CO2 equivalent |

## The issuance chain

A credit only exists if every link holds:

1. A registrar onboards the project. Projects cannot self-register.
2. The implementing organisation files an MRV claim for a reporting period, pinned to a
   `dataHash` of the off-chain report. Only that organisation can claim for its own site.
3. An accredited verifier approves the claim. A verifier cannot approve their own submission.
4. The oracle bridge calls `mintCredits`, which consumes the approval in the same transaction
   that issues the credits. Credits go to the implementing organisation, not the caller.

Each `(project, vintage)` pair can be claimed and issued exactly once. Token ids pack the project
id and vintage year into one word, so credits from the same site in different years are distinct
batches — which is what ERC-1155 buys over ERC-20 here.

Retirement burns the tokens and writes a permanent certificate. Retired credits cannot be
transferred or retired again.

## Roles

| Role | Contract | Held by |
| --- | --- | --- |
| `REGISTRAR_ROLE` | ProjectRegistry | Registry staff |
| `VERIFIER_ROLE` | VerificationRegistry | Accredited third-party verifiers |
| `CREDIT_ISSUER_ROLE` | VerificationRegistry | The `CarbonCreditToken` contract, and nothing else |
| `MINTER_ROLE` | CarbonCreditToken | The backend oracle bridge |

## Running it

```bash
npm install
npx hardhat test
```

Deploy to a local node and seed it with demo data — two terminals:

```bash
npx hardhat node
```

```bash
npm run deploy:local
npm run seed:local
```

`deploy-local.ts` assigns the registrar, verifier and oracle roles to three of Hardhat's default
funded accounts (not the deployer), so the demo exercises the same access-control paths a real
deployment would. `seed-demo-data.ts` then registers four real Indian mangrove restoration
sites (Sundarbans, Pichavaram, Bhitarkanika, Gulf of Kutch), submits and approves MRV claims for
one or two reporting periods each, and mints the resulting credits — so the dashboard has data
to show instead of an empty state. Its `dataHash` values are hashes of placeholder strings, not
of any real MRV report; there is no off-chain verification pipeline behind this demo data.

Both scripts write to `../shared/contract-addresses.json` (keyed by network name) and
`../shared/abis/*.json`, at the repo root, so the backend and frontend can read deployed
addresses and ABIs without manual copying.

For Polygon Amoy, copy `.env.example` to `.env`, set `DEPLOYER_PRIVATE_KEY`, then:

```bash
npm run deploy:amoy
```

`ORACLE_ADDRESS`, `VERIFIER_ADDRESS` and `REGISTRAR_ADDRESS` default to the deployer so a demo
deploy needs no extra setup. Set them explicitly for anything beyond a demo.

## Prototype scope

`contracts/mocks/MockVerificationRegistry.sol` is a test double used only by the token's unit
tests. It is not deployed by any script and is not part of the system.

Boundary polygons are stored as microdegree vertices but are not checked for self-intersection or
overlap with other projects; that check belongs in the off-chain MRV pipeline.
