#!/usr/bin/env bash
# Stops everything scripts/start-demo.sh started. Matches by command line rather than a PID
# file, since npx/npm wrap the real process in a child and a captured top-level PID isn't
# reliably the one that needs killing.

echo "Stopping NeelKosh demo services ..."

pkill -f "hardhat node" 2>/dev/null && echo "  stopped hardhat node"
# Matching "src/index.ts" rather than "tsx src/index.ts": npx/tsx rewrite the actual process
# argv on exec (to something like "node --require .../tsx/preflight.cjs ... src/index.ts"), so
# the literal binary name never ends up adjacent to the script path in ps output, regardless of
# whether backend was started via start-demo.sh (npx tsx src/index.ts) or npm run dev (tsx watch
# src/index.ts). "src/index.ts" alone is specific enough within this repo — it's backend's only
# entry point; frontend and verifier-portal are Next app-router projects with no such file.
pkill -f "src/index.ts" 2>/dev/null && echo "  stopped backend"
pkill -f "uvicorn mrv_engine" 2>/dev/null && echo "  stopped mrv-engine"
pkill -f "next dev" 2>/dev/null && echo "  stopped frontend and verifier-portal"

echo "Done."
