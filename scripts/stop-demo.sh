#!/usr/bin/env bash
# Stops everything scripts/start-demo.sh started. Matches by command line rather than a PID
# file, since npx/npm wrap the real process in a child and a captured top-level PID isn't
# reliably the one that needs killing.

echo "Stopping NeelKosh demo services ..."

pkill -f "hardhat node" 2>/dev/null && echo "  stopped hardhat node"
pkill -f "tsx src/index.ts" 2>/dev/null && echo "  stopped backend"
pkill -f "uvicorn mrv_engine" 2>/dev/null && echo "  stopped mrv-engine"
pkill -f "next dev" 2>/dev/null && echo "  stopped frontend"

echo "Done."
