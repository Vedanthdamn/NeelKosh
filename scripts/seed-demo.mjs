#!/usr/bin/env node
// Seeds realistic demo data through the real pipeline: backend auth -> backend API -> mrv-engine
// -> backend MRV submit/verify -> retire. This is what makes the frontend's dashboard, charts
// and verify page non-empty for a demo, and what puts real logged-in accounts behind the
// role-gated endpoints (POST /api/projects requires NGO, POST /api/mrv/:id/verify requires
// VERIFIER — see backend/src/routes/projects.ts and mrv.ts).
//
// Deliberately not contracts/scripts/seed-demo-data.ts, which writes straight to the contracts
// via ethers and bypasses the backend entirely — fine for testing the contracts layer in
// isolation (that script's own job), but it means the backend never sees a real report body, so
// NDVI never makes it into reportData and the growth chart on /projects/:id has nothing to plot.
// This script goes through the real HTTP APIs a real submission would use, end to end.
//
// Usage: node scripts/seed-demo.mjs
// Env:   BACKEND_URL (default http://127.0.0.1:4000), MRV_URL (default http://127.0.0.1:8088)
// Requires ethers at the repo root (npm install here) to sign the Sign-In With Ethereum
// challenge for each demo account — see package.json.

import { ethers } from "ethers";

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";
const MRV = process.env.MRV_URL || "http://127.0.0.1:8088";

/**
 * Demo accounts, all Hardhat's well-known local test keys so anyone running this demo already
 * knows every private key involved. Deliberately reuses wallets that already mean something
 * elsewhere in the system rather than picking arbitrary fresh addresses:
 *   - The two NGO wallets are accounts #4 and #5 — the same "implementer" wallet pool
 *     backend/src/config.ts defaults to, and specifically the two this script's own PROJECTS
 *     list below assigns as implementerAddress for the first two projects. Signing in as
 *     "Sundarbans NGO" and then registering the Sundarbans project as that same wallet is the
 *     point — it's the same organisation on both sides.
 *   - The verifier wallet is account #2, the exact key backend/src/config.ts uses to sign
 *     approveVerification on chain. The API-layer VERIFIER role and the on-chain VERIFIER_ROLE
 *     end up describing the same real-world party for this demo, which is what makes "the
 *     verifier logs in and approves a claim" a coherent story rather than two unrelated facts.
 *   - The two buyer wallets (#8, #9) are fresh — nothing else in the system currently expects a
 *     buyer's wallet to be any specific address.
 */
const DEMO_ACCOUNTS = [
  {
    label: "Sundarbans NGO",
    role: "NGO",
    organizationName: "Sundarbans Fishing Cooperative",
    privateKey: "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a", // account #4
  },
  {
    label: "Pichavaram NGO",
    role: "NGO",
    organizationName: "Tamil Nadu Coastal Restoration Trust",
    privateKey: "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba", // account #5
  },
  {
    label: "Demo Verifier",
    role: "VERIFIER",
    organizationName: "Independent MRV Verification Services",
    privateKey: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", // account #2
  },
  {
    label: "Demo Buyer — Corporate",
    role: "BUYER",
    organizationName: "GreenLeaf Corporation",
    privateKey: "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97", // account #8
  },
  {
    label: "Demo Buyer — Individual",
    role: "BUYER",
    organizationName: "",
    privateKey: "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6", // account #9
  },
];

// Every project's implementerAddress below is one of these two — the same two wallets logged in
// as "Sundarbans NGO" and "Pichavaram NGO" above, each now also implementing a second project.
// POST /api/projects requires the NGO role (backend/src/routes/projects.ts), so registering a
// project means signing in as whichever demo account's wallet matches its implementer; keeping
// every project's implementer within this fixed two-NGO pool is what makes that possible without
// inventing more demo accounts than the task asks for.
const IMPLEMENTERS = DEMO_ACCOUNTS.filter((a) => a.role === "NGO").map((a) => new ethers.Wallet(a.privateKey).address);

// halfDeg tuned per project so the drawn boundary's real geometric area (shoelace formula,
// computed independently by the frontend from the boundary alone) roughly matches the
// areaHectares fed to mrv-engine's biomass simulation below — otherwise the two numbers
// visibly disagree in the UI.
function squareBoundary(lat, lng, halfDeg) {
  return [
    { lat: lat + halfDeg, lng: lng - halfDeg },
    { lat: lat + halfDeg, lng: lng + halfDeg },
    { lat: lat - halfDeg, lng: lng + halfDeg },
    { lat: lat - halfDeg, lng: lng - halfDeg },
  ];
}

function halfDegForHectares(areaHectares, lat) {
  const sideKm = Math.sqrt(areaHectares * 0.01);
  const metersPerDegLat = 111.32;
  const metersPerDegLng = 111.32 * Math.cos((lat * Math.PI) / 180);
  return Math.max(sideKm / 2 / metersPerDegLat, sideKm / 2 / metersPerDegLng);
}

const PROJECTS = [
  {
    name: "Sundarbans Mangrove Restoration, West Bengal",
    lat: 21.9497,
    lng: 88.9468,
    implementerAddress: IMPLEMENTERS[0],
    species: "Rhizophora",
    areaHectares: 240,
    description:
      "Community-led restoration of degraded mangrove creeks in the Sundarbans delta, replanting Rhizophora along tidal channels lost to shrimp aquaculture conversion in the 1990s.",
    story:
      "Started in 2022 with the Sundarbans Fishing Cooperative after successive cyclones eroded the natural storm buffer the mangroves once provided. Local women's groups run the nursery and planting program.",
    periods: [
      { reportingPeriod: 3, vintage: 2022 },
      { reportingPeriod: 7, vintage: 2023 },
      { reportingPeriod: 11, vintage: 2024 },
    ],
  },
  {
    name: "Pichavaram Mangrove Restoration, Tamil Nadu",
    lat: 11.4306,
    lng: 79.7728,
    implementerAddress: IMPLEMENTERS[1],
    species: "Avicennia",
    areaHectares: 85,
    description:
      "Replanting Avicennia marina along silted-up tidal creeks adjoining the Pichavaram mangrove forest, restoring hydrological connectivity for natural regeneration.",
    story:
      "A joint effort with the Tamil Nadu Forest Department and a local fisherfolk collective, focused on creek desilting alongside planting so tidal flushing returns to degraded patches.",
    periods: [
      { reportingPeriod: 3, vintage: 2022 },
      { reportingPeriod: 7, vintage: 2023 },
    ],
  },
  {
    name: "Bhitarkanika Mangrove Restoration, Odisha",
    lat: 20.7191,
    lng: 86.899,
    implementerAddress: IMPLEMENTERS[0],
    species: "Sonneratia",
    areaHectares: 130,
    description:
      "Sonneratia apetala planting on accreting mudflats at the fringe of Bhitarkanika National Park, targeting newly formed land not yet under forest department protection.",
    story:
      "Launched after the 2023 cyclone season highlighted gaps in the park's buffer zone. Coordinated with the same field teams that run the park's saltwater crocodile monitoring program.",
    periods: [{ reportingPeriod: 4, vintage: 2023 }],
  },
  {
    name: "Gulf of Kutch Mangrove Restoration, Gujarat",
    lat: 22.4707,
    lng: 69.1082,
    implementerAddress: IMPLEMENTERS[1],
    species: "Mixed",
    areaHectares: 60,
    description:
      "Mixed-species restoration on arid-zone mudflats in the Gulf of Kutch Marine National Park buffer, one of the northernmost mangrove restoration sites in India.",
    story: "A pilot testing whether mixed-species planting outperforms monoculture Avicennia in this unusually saline, low-rainfall setting.",
    periods: [{ reportingPeriod: 5, vintage: 2023 }],
  },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// A service that just started accepting connections can still flake on its very first request
// (observed once in practice: a fresh mrv-engine process 404ing the first POST /calculate
// immediately after passing its own health check, then serving every request correctly after).
// Retrying a handful of times costs nothing on the common case and absorbs exactly that kind of
// one-off startup hiccup, whatever its root cause, without masking a real, persistent error —
// a genuine 400/500 still fails loudly once retries are exhausted.
async function withRetries(fn, { attempts = 4, delayMs = 750 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(delayMs);
    }
  }
  throw lastError;
}

async function postJson(url, body, token) {
  return withRetries(async () => {
    const headers = { "Content-Type": "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
    const data = await response.json();
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${JSON.stringify(data)}`);
    return data;
  });
}

async function getJson(url) {
  return withRetries(async () => {
    const response = await fetch(url);
    const data = await response.json();
    if (!response.ok) throw new Error(`${url} -> ${response.status}: ${JSON.stringify(data)}`);
    return data;
  });
}

/**
 * Runs the full Sign-In With Ethereum flow for one demo account: request a nonce, sign it with
 * the account's real private key, verify the signature, and register a User row if this wallet
 * doesn't have one yet. Safe to call repeatedly — a second run just logs the same account back
 * in (POST /api/auth/verify returns a fresh token for an already-registered wallet without
 * erroring), which is what makes re-running this whole script against a backend that already has
 * these accounts registered work without any special-casing.
 */
async function signIn(account) {
  const wallet = new ethers.Wallet(account.privateKey);

  const { message } = await postJson(`${BACKEND}/api/auth/nonce`, { walletAddress: wallet.address });
  const signature = await wallet.signMessage(message);
  const verified = await postJson(`${BACKEND}/api/auth/verify`, { walletAddress: wallet.address, signature });

  if (verified.registered) {
    return { wallet, token: verified.token, user: verified.user };
  }

  const registered = await postJson(
    `${BACKEND}/api/auth/register`,
    { role: account.role, organizationName: account.organizationName || undefined },
    verified.token
  );
  return { wallet, token: registered.token, user: registered.user };
}

async function main() {
  console.log("Signing in demo accounts...");
  const tokensByAddress = new Map();
  let verifierToken;
  for (const account of DEMO_ACCOUNTS) {
    const { wallet, token, user } = await signIn(account);
    tokensByAddress.set(wallet.address.toLowerCase(), token);
    if (account.role === "VERIFIER") verifierToken = token;
    console.log(
      `  ${user.role.padEnd(8)} ${(account.organizationName || account.label).padEnd(35)} ${wallet.address}`
    );
  }

  const existing = await getJson(`${BACKEND}/api/projects`);
  if (existing.projects.length > 0) {
    console.log(
      `\n${BACKEND} already has ${existing.projects.length} project(s) registered — skipping project seed.\n` +
        "Reset the backend's SQLite DB and redeploy the contracts if you want a fresh demo dataset."
    );
    return;
  }

  const results = [];

  for (const project of PROJECTS) {
    // Registration requires the NGO role (backend/src/routes/projects.ts) — sign in as whichever
    // demo account's wallet matches this project's implementer.
    const ngoToken = tokensByAddress.get(project.implementerAddress.toLowerCase());
    const registered = await postJson(
      `${BACKEND}/api/projects`,
      {
        name: project.name,
        ecosystem: "Mangrove",
        implementerAddress: project.implementerAddress,
        boundary: squareBoundary(project.lat, project.lng, halfDegForHectares(project.areaHectares, project.lat)),
        description: project.description,
        story: project.story,
      },
      ngoToken
    );
    console.log(`registered project ${registered.projectId}: ${project.name}`);

    const mintedTokenIds = [];

    for (const period of project.periods) {
      const calc = await postJson(`${MRV}/calculate`, {
        project_id: String(registered.projectId),
        area_hectares: project.areaHectares,
        species: project.species,
        reporting_period: period.reportingPeriod,
      });

      const rawTonnes = calc.tonnes_co2_incremental ?? calc.tonnes_co2;
      const tonnesCO2 = Math.max(1, Math.round(rawTonnes));

      const submitted = await postJson(
        `${BACKEND}/api/mrv/submit`,
        {
          projectId: registered.projectId,
          vintage: period.vintage,
          tonnesCO2,
          methodology: "Sentinel-2 NDVI biomass regression (VM0033-aligned), simulated",
          supportingDataRef: `mrv-engine synthetic composite, reporting_period=${period.reportingPeriod}`,
          reportData: {
            ndvi: calc.ndvi,
            agb_per_hectare: calc.agb_per_hectare,
            area_hectares: project.areaHectares,
            species: project.species,
            reporting_period: period.reportingPeriod,
            simulated: true,
          },
        },
        ngoToken
      );
      console.log(`  submitted vintage ${period.vintage}: ndvi=${calc.ndvi} tonnesCO2=${tonnesCO2} (submission ${submitted.submissionId})`);

      const verified = await postJson(`${BACKEND}/api/mrv/${submitted.submissionId}/verify`, {}, verifierToken);
      console.log(`  minted token ${verified.tokenId} for vintage ${period.vintage}`);
      mintedTokenIds.push(verified.tokenId);
    }

    results.push({ projectId: registered.projectId, name: project.name, mintedTokenIds });
  }

  // List part of three batches on the marketplace, and faucet-fund the two buyer accounts, so
  // /marketplace and the buy flow have real data on a completely fresh boot instead of the demo
  // presenter needing to know to do this manually before showing it to anyone.
  const listings = [
    { resultIndex: 0, amount: 500, pricePerTonneNKR: "450" }, // Sundarbans
    { resultIndex: 1, amount: 200, pricePerTonneNKR: "500" }, // Pichavaram
    { resultIndex: 2, amount: 300, pricePerTonneNKR: "600" }, // Bhitarkanika
  ];
  for (const { resultIndex, amount, pricePerTonneNKR } of listings) {
    const result = results[resultIndex];
    const project = PROJECTS[resultIndex];
    if (!result?.mintedTokenIds.length) continue;
    const lastPeriod = project.periods[project.periods.length - 1];
    const ngoToken = tokensByAddress.get(project.implementerAddress.toLowerCase());
    const listing = await postJson(
      `${BACKEND}/api/marketplace/listings`,
      { projectId: result.projectId, vintage: lastPeriod.vintage, amount, pricePerTonneNKR },
      ngoToken
    );
    console.log(`listed ${amount} of project ${result.projectId} (vintage ${lastPeriod.vintage}) at ${pricePerTonneNKR} NKR/t: listing #${listing.listingId}`);
  }

  const buyerAccounts = DEMO_ACCOUNTS.filter((a) => a.role === "BUYER");
  for (const account of buyerAccounts) {
    const address = new ethers.Wallet(account.privateKey).address;
    const token = tokensByAddress.get(address.toLowerCase());
    const faucet = await postJson(`${BACKEND}/api/marketplace/faucet`, {}, token);
    console.log(`faucet-funded ${account.label} (${address}): ${ethers.formatUnits(faucet.amount, 18)} NKR`);
  }

  // Retire a portion of two batches so the verify page and lifecycle table have real history.
  const first = results[0];
  if (first?.mintedTokenIds.length > 0) {
    const retired = await postJson(`${BACKEND}/api/credits/${first.mintedTokenIds[0]}/retire`, {
      amount: 200,
      retirementReason: "FY2023 scope 1 offset — corporate buyer demo retirement",
    });
    console.log(`retired 200 of token ${first.mintedTokenIds[0]}: retirement #${retired.retirementId}`);
  }
  const second = results[1];
  if (second?.mintedTokenIds.length > 0) {
    const retired = await postJson(`${BACKEND}/api/credits/${second.mintedTokenIds[0]}/retire`, {
      amount: 50,
      retirementReason: "Personal carbon footprint offset — individual buyer demo retirement",
    });
    console.log(`retired 50 of token ${second.mintedTokenIds[0]}: retirement #${retired.retirementId}`);
  }

  console.log("\nSeeded:");
  for (const r of results) console.log(`  project ${r.projectId} (${r.name}): tokens ${r.mintedTokenIds.join(", ")}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
