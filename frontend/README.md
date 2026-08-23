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

| Route | Reads from |
| --- | --- |
| `/` | `GET /api/projects` + `GET /api/projects/:id` (fanned out for aggregate totals) |
| `/projects` | `GET /api/projects` |
| `/projects/[id]` | `GET /api/projects/:id` |
| `/verify`, `/verify/[tokenId]` | `GET /api/credits/:tokenId/history` |
| `/register` | `POST /api/projects` |

## Notes

- Project area in hectares isn't stored on chain (`ProjectRegistry` only stores the boundary
  polygon) — `lib/geo.ts` derives it from the real boundary via a planar shoelace-formula
  approximation, rather than showing a fabricated number.
- The landing page's live counters fan out to every project's detail endpoint and sum
  client-side (server-side, via a React Server Component), since the backend has no dedicated
  aggregate endpoint. Fine at demo scale; a real deployment would want one.
