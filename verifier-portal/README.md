# NeelKosh Verifier Portal

Next.js (App Router) + TypeScript. A separate app from `../frontend`, not a route inside it —
built for accredited verifiers doing MRV review, not the public. Reads the same NeelKosh backend
directly, no separate data layer of its own.

## Visual identity

Deliberately dense and operational rather than the main frontend's marketing register: a queue
table, indicator chips, and a detail view meant for someone reviewing submissions all day, not a
one-time visitor.

## Running it

Needs the backend running (see `../backend/README.md`), which in turn needs the contracts
deployed and mrv-engine running for fraud-check results to be present on submissions.

```bash
npm install
cp .env.example .env.local
npm run dev -- -p 3001
```

`NEXT_PUBLIC_BACKEND_URL` (default `http://localhost:4000`) is the only configuration this app
needs. `scripts/start-demo.sh` runs this alongside the main frontend, pinned to port 3001 so it
doesn't collide with the main frontend's 3000.

## Pages

| Route | Reads from | Wallet sign-in required |
| --- | --- | --- |
| `/login` | `POST /api/auth/nonce`, `POST /api/auth/verify` | connects and signs in |
| `/queue` | `GET /api/mrv/pending` (fraud-check indicators per submission) | yes (VERIFIER) |
| `/queue/[submissionId]` | `GET /api/mrv/:submissionId`, `POST /api/mrv/:submissionId/verify`, `POST /api/mrv/:submissionId/reject` | yes (VERIFIER) |
| `/history` | `GET /api/mrv/decided/:verifierAddress` — this verifier's own past approvals/rejections | yes (VERIFIER) |

Every page other than `/login` is gated by `components/RequireVerifier.tsx`, which checks the
signed-in session's role is `VERIFIER` — not just that a session exists — and signs out and
redirects to `/login` on mismatch. The backend's own role check on each endpoint is the real
enforcement boundary; this is a UX guard, not a security one.

## Notes

- Approving a submission here calls the same `POST /api/mrv/:submissionId/verify` endpoint that
  approves as the verifier and mints as the oracle in one call — see
  `backend/src/services/oracleBridge.ts` for what that step actually does on-chain.
- The fraud-check indicators (geofence, duplicate photo, vegetation plausibility) come from
  mrv-engine at submission time and are stored with the submission, not recomputed by this app.
