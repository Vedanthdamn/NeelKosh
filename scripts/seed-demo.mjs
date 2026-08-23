#!/usr/bin/env node
// Seeds realistic demo data through the real pipeline: backend API -> mrv-engine -> backend MRV
// submit/verify -> retire. This is what makes the frontend's dashboard, charts and verify page
// non-empty for a demo.
//
// Deliberately not contracts/scripts/seed-demo-data.ts, which writes straight to the contracts
// via ethers and bypasses the backend entirely — fine for testing the contracts layer in
// isolation (that script's own job), but it means the backend never sees a real report body, so
// NDVI never makes it into reportData and the growth chart on /projects/:id has nothing to plot.
// This script goes through the real HTTP APIs a real submission would use, end to end.
//
// Usage: node scripts/seed-demo.mjs
// Env:   BACKEND_URL (default http://127.0.0.1:4000), MRV_URL (default http://127.0.0.1:8088)

const BACKEND = process.env.BACKEND_URL || "http://127.0.0.1:4000";
const MRV = process.env.MRV_URL || "http://127.0.0.1:8088";

// These are Hardhat's well-known local test accounts #4-7 — the same "implementer" wallet pool
// backend/src/config.ts defaults to on localhost. Registering a project with an implementer
// address this backend doesn't hold a key for would make the MRV-submit step below fail (by
// design — see backend/README.md's "Prototype scope" section).
const IMPLEMENTERS = [
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
  "0x9965507D1a55bcC2695C58ba16FB37d819B0A4dc",
  "0x976EA74026E726554dB657fA54763abd0C3a0aa9",
  "0x14dC79964da2C08b23698B3D3cc7Ca32193d9955",
];

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
    implementerAddress: IMPLEMENTERS[2],
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
    implementerAddress: IMPLEMENTERS[3],
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

async function postJson(url, body) {
  return withRetries(async () => {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
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

async function main() {
  const existing = await getJson(`${BACKEND}/api/projects`);
  if (existing.projects.length > 0) {
    console.log(
      `${BACKEND} already has ${existing.projects.length} project(s) registered — skipping seed.\n` +
        "Reset the backend's SQLite DB and redeploy the contracts if you want a fresh demo dataset."
    );
    return;
  }

  const results = [];

  for (const project of PROJECTS) {
    const registered = await postJson(`${BACKEND}/api/projects`, {
      name: project.name,
      ecosystem: "Mangrove",
      implementerAddress: project.implementerAddress,
      boundary: squareBoundary(project.lat, project.lng, halfDegForHectares(project.areaHectares, project.lat)),
      description: project.description,
      story: project.story,
    });
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

      const submitted = await postJson(`${BACKEND}/api/mrv/submit`, {
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
      });
      console.log(`  submitted vintage ${period.vintage}: ndvi=${calc.ndvi} tonnesCO2=${tonnesCO2} (submission ${submitted.submissionId})`);

      const verified = await postJson(`${BACKEND}/api/mrv/${submitted.submissionId}/verify`, {});
      console.log(`  minted token ${verified.tokenId} for vintage ${period.vintage}`);
      mintedTokenIds.push(verified.tokenId);
    }

    results.push({ projectId: registered.projectId, name: project.name, mintedTokenIds });
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
