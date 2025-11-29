/**
 * Stellend Shared Configuration
 *
 * Common utilities, types, and configuration for all Stellend scripts.
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";

// ============================================================================
// NETWORK CONFIGURATION
// ============================================================================

export interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  friendbotUrl: string;
}

export const NETWORKS: Record<string, NetworkConfig> = {
  futurenet: {
    rpcUrl: "https://rpc-futurenet.stellar.org",
    networkPassphrase: "Test SDF Future Network ; October 2022",
    friendbotUrl: "https://friendbot-futurenet.stellar.org",
  },
  testnet: {
    rpcUrl: "https://soroban-testnet.stellar.org",
    networkPassphrase: "Test SDF Network ; September 2015",
    friendbotUrl: "https://friendbot.stellar.org",
  },
};

// ============================================================================
// CONSTANTS
// ============================================================================

// Scaling factor for amounts (7 decimals for Stellar assets)
export const AMOUNT_SCALE = 10_000_000;

// Price scaling factor (matches contract)
export const PRICE_SCALE = 10_000_000;

// Default amounts for seeding
export const SEED_AMOUNTS = {
  // Total USDC to mint for whale
  WHALE_USDC_MINT: 1_000_000, // 1,000,000 USDC
  // USDC to supply to pool
  POOL_USDC_SUPPLY: 500_000, // 500,000 USDC
  // XLM for pool testing
  POOL_XLM_SUPPLY: 100_000, // 100,000 XLM
  // User funding amounts
  USER_XLM: 10_000, // 10,000 XLM
  USER_USDC: 10_000, // 10,000 USDC
};

// Asset codes
export const ASSET_CODES = {
  XLM: "native",
  USDC: "USDC",
};

// ============================================================================
// TYPES
// ============================================================================

export interface DeploymentInfo {
  network: string;
  timestamp: string;
  contracts: {
    pool?: string;
    oracle?: string;
    interestRateModel?: string;
  };
  tokens: {
    xlm?: string; // Wrapped XLM (SAC)
    usdc?: string; // Mock USDC (SAC)
    usdcIssuer?: string; // USDC issuer account
  };
  accounts: {
    deployer: string;
    whale?: string;
  };
}

export interface ScriptConfig {
  network: NetworkConfig;
  networkName: string;
  secretKey: string;
  server: SorobanRpc.Server;
  keypair: StellarSdk.Keypair;
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Load configuration from environment variables
 */
export function loadConfig(): ScriptConfig {
  const secretKey = process.env.SECRET_KEY;
  const networkName = process.env.NETWORK || "futurenet";

  if (!secretKey) {
    console.error("❌ SECRET_KEY environment variable not set");
    console.error("\nUsage:");
    console.error("  export SECRET_KEY=SXXXXX...");
    console.error("  export NETWORK=futurenet  # optional, default: futurenet");
    process.exit(1);
  }

  const network = NETWORKS[networkName];
  if (!network) {
    console.error(`❌ Unknown network: ${networkName}`);
    console.error(`   Available: ${Object.keys(NETWORKS).join(", ")}`);
    process.exit(1);
  }

  const server = new SorobanRpc.Server(network.rpcUrl);
  const keypair = StellarSdk.Keypair.fromSecret(secretKey);

  return {
    network,
    networkName,
    secretKey,
    server,
    keypair,
  };
}

/**
 * Load deployment info from JSON file
 */
export async function loadDeploymentInfo(): Promise<DeploymentInfo | null> {
  try {
    const fs = await import("fs/promises");
    const data = await fs.readFile("deployment.json", "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Save deployment info to JSON file
 */
export async function saveDeploymentInfo(info: DeploymentInfo): Promise<void> {
  const fs = await import("fs/promises");
  await fs.writeFile("deployment.json", JSON.stringify(info, null, 2));
  console.log("💾 Deployment info saved to deployment.json");
}

/**
 * Fund an account using Friendbot
 */
export async function fundWithFriendbot(
  publicKey: string,
  friendbotUrl: string
): Promise<boolean> {
  try {
    const response = await fetch(`${friendbotUrl}?addr=${publicKey}`);
    if (response.ok) {
      console.log(`✅ Funded ${truncateAddress(publicKey)} via Friendbot`);
      return true;
    }
    // Account might already be funded
    console.log(`ℹ️  Account ${truncateAddress(publicKey)} may already be funded`);
    return true;
  } catch (error) {
    console.error(`❌ Friendbot funding failed for ${truncateAddress(publicKey)}`);
    return false;
  }
}

/**
 * Convert amount to stroops (7 decimals)
 */
export function toStroops(amount: number): bigint {
  return BigInt(Math.floor(amount * AMOUNT_SCALE));
}

/**
 * Convert stroops to amount
 */
export function fromStroops(stroops: bigint): number {
  return Number(stroops) / AMOUNT_SCALE;
}

/**
 * Truncate address for display
 */
export function truncateAddress(address: string): string {
  return `${address.substring(0, 8)}...${address.substring(address.length - 8)}`;
}

/**
 * Wait for transaction confirmation
 */
export async function waitForTransaction(
  server: SorobanRpc.Server,
  hash: string
): Promise<SorobanRpc.Api.GetTransactionResponse> {
  let result = await server.getTransaction(hash);

  while (result.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await server.getTransaction(hash);
  }

  return result;
}

/**
 * Submit a transaction and wait for confirmation
 */
export async function submitTransaction(
  server: SorobanRpc.Server,
  transaction: StellarSdk.Transaction,
  keypair: StellarSdk.Keypair
): Promise<string> {
  // Sign and submit
  transaction.sign(keypair);
  const sendResponse = await server.sendTransaction(transaction);

  if (sendResponse.status === "ERROR") {
    throw new Error(`Transaction submission failed: ${JSON.stringify(sendResponse)}`);
  }

  // Wait for confirmation
  const result = await waitForTransaction(server, sendResponse.hash);

  if (result.status === "SUCCESS") {
    return sendResponse.hash;
  } else {
    throw new Error(`Transaction failed: ${JSON.stringify(result)}`);
  }
}

/**
 * Print a banner
 */
export function printBanner(title: string): void {
  const line = "═".repeat(56);
  console.log(`╔${line}╗`);
  console.log(`║${title.padStart(28 + title.length / 2).padEnd(56)}║`);
  console.log(`╚${line}╝\n`);
}

/**
 * Create a horizontal rule
 */
export function printSection(title: string): void {
  console.log(`\n${"─".repeat(40)}`);
  console.log(`📦 ${title}`);
  console.log(`${"─".repeat(40)}\n`);
}

export { StellarSdk, SorobanRpc };


