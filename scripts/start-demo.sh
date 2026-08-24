#!/usr/bin/env bash
# Boots the whole NeelKosh stack for a demo, in the order each piece depends on the last:
#
#   1. local Hardhat node        (contracts/)
#   2. deploy contracts to it    (contracts/scripts/deploy-local.ts)
#   3. backend API               (backend/) — needs the deployed addresses from step 2
#   4. mrv-engine                (mrv-engine/) — standalone, no dependency on the others
#   5. seed demo data            (scripts/seed-demo.mjs) — needs backend + mrv-engine running
#   6. frontend                  (frontend/) — needs the backend running
#   7. verifier-portal           (verifier-portal/) — needs the backend running
#
# Each service logs to .demo-logs/<service>.log. Stop everything with scripts/stop-demo.sh,
# which finds these same processes by the command line they were started with (not a PID file —
# npx/npm wrap the real process in a child, so an exact PID captured here isn't reliably the one
# that needs killing; pattern matching on the running command is simpler and more robust).
#
# Re-running this script is safe: seed-demo.mjs skips seeding if the backend already has
# projects, and each step waits for the previous one's port to actually respond before moving
# on, rather than guessing with a fixed sleep.
#
# Prerequisites (one-time, not run by this script): `npm install` in contracts/, backend/ and
# frontend/, and a Python venv with `pip install -r requirements.txt && pip install -e .` in
# mrv-engine/. See each service's README.

set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="$ROOT_DIR/.demo-logs"
mkdir -p "$LOG_DIR"

wait_for_port() {
  local name="$1" url="$2" timeout="${3:-60}"
  echo "  waiting for $name at $url ..."
  local waited=0
  until curl -sf -o /dev/null "$url"; do
    sleep 1
    waited=$((waited + 1))
    if [ "$waited" -ge "$timeout" ]; then
      echo "  $name did not respond within ${timeout}s — check $LOG_DIR/$name.log"
      exit 1
    fi
  done
  echo "  $name is up"
}

preflight() {
  local missing=0
  [ -d "$ROOT_DIR/node_modules" ] || { echo "node_modules missing at repo root — run: npm install"; missing=1; }
  [ -d "$ROOT_DIR/contracts/node_modules" ] || { echo "contracts/node_modules missing — run: cd contracts && npm install"; missing=1; }
  [ -d "$ROOT_DIR/backend/node_modules" ] || { echo "backend/node_modules missing — run: cd backend && npm install"; missing=1; }
  [ -d "$ROOT_DIR/frontend/node_modules" ] || { echo "frontend/node_modules missing — run: cd frontend && npm install"; missing=1; }
  [ -d "$ROOT_DIR/verifier-portal/node_modules" ] || { echo "verifier-portal/node_modules missing — run: cd verifier-portal && npm install"; missing=1; }
  [ -d "$ROOT_DIR/mrv-engine/.venv" ] || { echo "mrv-engine/.venv missing — see mrv-engine/README.md"; missing=1; }
  if [ "$missing" -eq 1 ]; then
    echo
    echo "Install the missing pieces above, then re-run this script."
    exit 1
  fi
}

echo "== NeelKosh demo startup =="
preflight

echo
echo "[1/6] Starting local Hardhat node ..."
(cd "$ROOT_DIR/contracts" && npx hardhat node > "$LOG_DIR/hardhat-node.log" 2>&1 &)
wait_for_port hardhat "http://127.0.0.1:8545" 30

echo
echo "[2/6] Deploying contracts ..."
if ! (cd "$ROOT_DIR/contracts" && npx hardhat run scripts/deploy-local.ts --network localhost > "$LOG_DIR/deploy.log" 2>&1); then
  echo "  deploy failed — check $LOG_DIR/deploy.log"
  exit 1
fi
echo "  contracts deployed"

echo
echo "[3/6] Starting backend ..."
rm -f "$ROOT_DIR/backend/prisma/dev.db"
(cd "$ROOT_DIR/backend" && npx prisma migrate deploy > "$LOG_DIR/backend-migrate.log" 2>&1)
(cd "$ROOT_DIR/backend" && npx tsx src/index.ts > "$LOG_DIR/backend.log" 2>&1 &)
wait_for_port backend "http://127.0.0.1:4000/health" 30

echo
echo "[4/6] Starting mrv-engine ..."
(cd "$ROOT_DIR/mrv-engine" && source .venv/bin/activate && uvicorn mrv_engine.api:app --port 8088 > "$LOG_DIR/mrv-engine.log" 2>&1 &)
wait_for_port mrv-engine "http://127.0.0.1:8088/health" 30

echo
echo "[5/6] Seeding demo data ..."
(cd "$ROOT_DIR" && node scripts/seed-demo.mjs 2>&1 | tee "$LOG_DIR/seed.log")

echo
echo "[6/7] Starting frontend ..."
(cd "$ROOT_DIR/frontend" && npx next dev -p 3000 > "$LOG_DIR/frontend.log" 2>&1 &)
wait_for_port frontend "http://127.0.0.1:3000" 60

echo
echo "[7/7] Starting verifier-portal ..."
(cd "$ROOT_DIR/verifier-portal" && npx next dev -p 3001 > "$LOG_DIR/verifier-portal.log" 2>&1 &)
wait_for_port verifier-portal "http://127.0.0.1:3001" 60

echo
echo "== Everything is up =="
echo "  Frontend:         http://localhost:3000"
echo "  Verifier portal:  http://localhost:3001"
echo "  Backend:          http://localhost:4000/health"
echo "  MRV engine:       http://localhost:8088/docs"
echo "  Hardhat RPC:      http://localhost:8545"
echo
echo "Logs:  $LOG_DIR/"
echo "Stop:  scripts/stop-demo.sh"
