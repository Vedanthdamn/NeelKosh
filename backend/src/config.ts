import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

dotenv.config();

export type ChainNetwork = "localhost" | "amoy";

const network: ChainNetwork = process.env.CHAIN_NETWORK === "amoy" ? "amoy" : "localhost";

const DEFAULT_RPC_URLS: Record<ChainNetwork, string> = {
  localhost: "http://127.0.0.1:8545",
  amoy: "https://rpc-amoy.polygon.technology",
};

/**
 * Hardhat's standard local test mnemonic ("test test test ... junk") deterministically derives
 * these keys, which every `npx hardhat node` invocation prints on startup. They are public
 * knowledge, funded only on an ephemeral local chain, and never hold real value — which is what
 * lets this backend run against localhost with zero .env setup. They must never be used, and
 * are never used by this config, once CHAIN_NETWORK is "amoy".
 */
const LOCAL_TEST_KEYS = {
  registrar: "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d",
  verifier: "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a",
  oracle: "0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6",
  implementers: [
    "0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a",
    "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba",
    "0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e",
    "0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356",
  ],
  // Matches the two buyer accounts deploy-local.ts/seed-demo-data.ts faucet-fund out of the box
  // (Hardhat's default accounts 8 and 9), so a fresh local demo has working buyer wallets with
  // zero .env setup, same as every other role here.
  buyers: [
    "0xdbda1821b80551c9d65939329250298aa3472ba22feea921c0cf5d620ea67b97",
    "0x2a871d0798f97d79848a013d4936a73bf4cc922c825d33c1cf7073dff6d409c6",
  ],
};

function requiredForAmoy(envVar: string): string {
  const value = process.env[envVar];
  if (!value) {
    throw new Error(
      `${envVar} must be set in .env when CHAIN_NETWORK=amoy — there is no safe local default for a funded network.`
    );
  }
  return value;
}

function resolvePrivateKey(envVar: string, localDefault: string): string {
  if (network === "amoy") return requiredForAmoy(envVar);
  return process.env[envVar] || localDefault;
}

function resolveImplementerKeys(): string[] {
  const fromEnv = process.env.IMPLEMENTER_PRIVATE_KEYS?.split(",").map((key) => key.trim()).filter(Boolean);
  if (network === "amoy") {
    if (!fromEnv || fromEnv.length === 0) {
      throw new Error(
        "IMPLEMENTER_PRIVATE_KEYS must be set in .env when CHAIN_NETWORK=amoy — there is no safe local default for a funded network."
      );
    }
    return fromEnv;
  }
  return fromEnv && fromEnv.length > 0 ? fromEnv : LOCAL_TEST_KEYS.implementers;
}

function resolveBuyerKeys(): string[] {
  const fromEnv = process.env.BUYER_PRIVATE_KEYS?.split(",").map((key) => key.trim()).filter(Boolean);
  if (network === "amoy") {
    if (!fromEnv || fromEnv.length === 0) {
      throw new Error(
        "BUYER_PRIVATE_KEYS must be set in .env when CHAIN_NETWORK=amoy — there is no safe local default for a funded network."
      );
    }
    return fromEnv;
  }
  return fromEnv && fromEnv.length > 0 ? fromEnv : LOCAL_TEST_KEYS.buyers;
}

const SHARED_DIR = path.join(__dirname, "..", "..", "shared");
const ADDRESSES_FILE = path.join(SHARED_DIR, "contract-addresses.json");

if (!fs.existsSync(ADDRESSES_FILE)) {
  throw new Error(`${ADDRESSES_FILE} not found. Run a contracts deploy script first.`);
}
const addressBook = JSON.parse(fs.readFileSync(ADDRESSES_FILE, "utf8"));
const deployment = addressBook[network];
if (!deployment) {
  throw new Error(
    `No deployment recorded for network "${network}" in ${ADDRESSES_FILE}. Deploy the contracts to this network first.`
  );
}

export const config = {
  port: Number(process.env.PORT) || 4000,
  network,
  chainId: deployment.chainId as number,
  rpcUrl: process.env.RPC_URL || DEFAULT_RPC_URLS[network],
  sharedDir: SHARED_DIR,
  // mrv-engine's photo-verification endpoints. Not network-dependent like the wallet keys above
  // — mrv-engine is a sibling service on this same machine (or wherever this backend is
  // deployed), not something that varies between localhost and Amoy.
  mrvEngineUrl: process.env.MRV_ENGINE_URL || "http://127.0.0.1:8088",
  contracts: deployment.contracts as {
    ProjectRegistry: string;
    VerificationRegistry: string;
    CarbonCreditToken: string;
    SimStablecoin: string;
    Marketplace: string;
  },
  wallets: {
    registrarPrivateKey: resolvePrivateKey("REGISTRAR_PRIVATE_KEY", LOCAL_TEST_KEYS.registrar),
    verifierPrivateKey: resolvePrivateKey("VERIFIER_PRIVATE_KEY", LOCAL_TEST_KEYS.verifier),
    oraclePrivateKey: resolvePrivateKey("ORACLE_PRIVATE_KEY", LOCAL_TEST_KEYS.oracle),
    implementerPrivateKeys: resolveImplementerKeys(),
    buyerPrivateKeys: resolveBuyerKeys(),
  },
};
