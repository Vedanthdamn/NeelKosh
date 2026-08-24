# NeelKosh Frontend

Next.js (App Router) + TypeScript + Tailwind CSS. Reads the NeelKosh backend directly — no
separate data layer of its own.

## Visual identity

Two registers, tied to the subject rather than a light/dark toggle: a dark "deep water" register
(navy/teal, warm sand accent) for the landing page and `/verify` — the pitch and its proof — and
a light "mudflat" register (warm paper, same sand accent) for the working pages where the actual
project data lives (`/projects`, detail, `/register`). Fraunces for display type, IBM Plex Sans
for body, IBM Plex Mono for every hash, token ID, and coordinate — monospace marks exact,
checkable data. The recurring signature is a hand-authored branching motif
(`components/RootMotif.tsx`) that reads as both mangrove prop roots and a tidal creek delta.

## Running it

Needs the backend running (see `../backend/README.md`), which in turn needs the contracts
deployed locally and mrv-engine running for the full demo data flow.

```bash
npm install
cp .env.example .env.local
npm run dev
```

`NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:4000`) is the only configuration this app
needs — everything else comes from the backend at request time.

## Pages

| Route | Reads from | Wallet sign-in required |
| --- | --- | --- |
| `/` | `GET /api/projects` + `GET /api/projects/:id` (fanned out for aggregate totals) | no |
| `/projects` | `GET /api/projects` | no |
| `/projects/[id]` | `GET /api/projects/:id` | no |
| `/verify`, `/verify/[tokenId]` | `GET /api/credits/:tokenId/history` | no |
| `/register` | `POST /api/projects` | yes (NGO) |
| `/marketplace` | `GET /api/marketplace/listings` | no (browsing); yes to buy |
| `/marketplace/[listingId]` | `GET /api/marketplace/listings/:id`, faucet/approve/`POST /api/marketplace/purchase` | yes (BUYER) |
| `/my-credits` | `GET /api/credits/holdings/:address`, `POST /api/credits/:tokenId/retire` | yes (BUYER) |

Pages marked "wallet sign-in required" gate their form behind `lib/auth.ts`'s `useSession()`:
connect a wallet (`lib/wallet.ts`), sign a one-time nonce, and a first-time wallet is
auto-registered under that page's expected role. See the root README's "Wallet-based auth"
section for the underlying flow, which this frontend, `verifier-portal`, and
`scripts/seed-demo.mjs` all drive against the same backend endpoints.

## Notes

- Project area in hectares isn't stored on chain (`ProjectRegistry` only stores the boundary
  polygon) — `lib/geo.ts` derives it from the real boundary via a planar shoelace-formula
  approximation, rather than showing a fabricated number.
- The landing page's live counters fan out to every project's detail endpoint and sum
  client-side (server-side, via a React Server Component), since the backend has no dedicated
  aggregate endpoint. Fine at demo scale; a real deployment would want one.
