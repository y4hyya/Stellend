/**
 * Stellend Price Oracle Keeper Script
 *
 * This script fetches real-time prices from CoinGecko and updates the
 * on-chain Price Oracle contract on Stellar Futurenet.
 *
 * ## Features
 * - Fetches XLM/USD price from CoinGecko
 * - Supports NORMAL mode (real prices) and CRASH mode (50% drop)
 * - Proper Soroban transaction building and submission
 * - Fallback to mock prices for testing without API
 *
 * ## Usage
 *
 * ```bash
 * # Normal mode - set real price
 * npm run update-price
 *
 * # Crash mode - simulate 50% price drop
 * npm run update-price -- --crash
 *
 * # Use mock price (no API call)
 * npm run update-price -- --mock
 *
 * # Crash with mock price
 * npm run update-price -- --crash --mock
 * ```
 *
 * ## Environment Variables
 *
 * - ORACLE_CONTRACT_ID: Deployed oracle contract address
 * - SECRET_KEY: Admin/keeper wallet secret key
 * - NETWORK: (optional) 'futurenet' or 'testnet' (default: futurenet)
 *
 * ## Price Scaling
 *
 * Prices are scaled by 1e7 (10,000,000):
 * - $1.00 = 10,000,000
 * - $0.30 = 3,000,000
 */

import * as StellarSdk from "@stellar/stellar-sdk";
import { SorobanRpc } from "@stellar/stellar-sdk";

// ============================================================================
// CONFIGURATION
// ============================================================================

interface NetworkConfig {
  rpcUrl: string;
  networkPassphrase: string;
  friendbotUrl?: string;
}

const NETWORKS: Record<string, NetworkConfig> = {
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

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";

// Price scaling factor (matches contract)
const PRICE_SCALE = 10_000_000;

// Default mock prices for testing
const MOCK_PRICES = {
  xlm: 0.3, // $0.30
  usdc: 1.0, // $1.00
};

// ============================================================================
// TYPES
// ============================================================================

interface PriceData {
  xlm: number;
  usdc: number;
}

interface Config {
  oracleContractId: string;
  secretKey: string;
  network: NetworkConfig;
  crashMode: boolean;
  mockMode: boolean;
}

// ============================================================================
// PRICE FETCHING
// ============================================================================

/**
 * Fetch prices from CoinGecko API
 */
async function fetchPricesFromCoinGecko(): Promise<PriceData> {
  console.log("📡 Fetching prices from CoinGecko...");

  try {
    const response = await fetch(
      `${COINGECKO_API_URL}?ids=stellar,usd-coin&vs_currencies=usd`
    );

    if (!response.ok) {
      throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    const prices: PriceData = {
      xlm: data.stellar?.usd ?? MOCK_PRICES.xlm,
      usdc: data["usd-coin"]?.usd ?? MOCK_PRICES.usdc,
    };

    console.log(`   XLM: $${prices.xlm.toFixed(4)}`);
    console.log(`   USDC: $${prices.usdc.toFixed(4)}`);

    return prices;
  } catch (error) {
    console.warn("⚠️  CoinGecko fetch failed, using mock prices");
    console.warn(`   Error: ${error}`);
    return MOCK_PRICES;
  }
}

/**
 * Get mock prices (for testing without API)
 */
function getMockPrices(): PriceData {
  console.log("🧪 Using mock prices (no API call)");
  console.log(`   XLM: $${MOCK_PRICES.xlm}`);
  console.log(`   USDC: $${MOCK_PRICES.usdc}`);
  return MOCK_PRICES;
}

/**
 * Apply crash mode (50% price drop)
 */
function applyCrashMode(prices: PriceData): PriceData {
  console.log("\n💥 CRASH MODE ACTIVATED!");
  console.log("   Applying 50% price drop to XLM...");

  const crashedPrices: PriceData = {
    xlm: prices.xlm * 0.5,
    usdc: prices.usdc, // USDC stays stable
  };

  console.log(`   XLM: $${prices.xlm.toFixed(4)} → $${crashedPrices.xlm.toFixed(4)} (-50%)`);

  return crashedPrices;
}

// ============================================================================
// BLOCKCHAIN INTERACTION
// ============================================================================

/**
 * Convert USD price to scaled integer for contract
 */
function priceToScaled(price: number): bigint {
  return BigInt(Math.floor(price * PRICE_SCALE));
}

/**
 * Build and submit price update transaction
 */
async function updatePriceOnChain(
  config: Config,
  prices: PriceData
): Promise<string> {
  const { oracleContractId, secretKey, network } = config;

  console.log("\n🔗 Connecting to Stellar network...");
  console.log(`   Network: ${network.networkPassphrase.split(" ")[0]}`);
  console.log(`   RPC: ${network.rpcUrl}`);

  // Initialize RPC client
  const server = new SorobanRpc.Server(network.rpcUrl);

  // Load source account
  const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
  const publicKey = sourceKeypair.publicKey();
  console.log(`   Keeper: ${publicKey.substring(0, 8)}...${publicKey.substring(publicKey.length - 8)}`);

  let sourceAccount;
  try {
    sourceAccount = await server.getAccount(publicKey);
  } catch (error) {
    console.error("❌ Failed to load account. Is it funded?");
    throw error;
  }

  // Create contract instance
  const contract = new StellarSdk.Contract(oracleContractId);

  // Build transaction to set XLM price
  const xlmPriceScaled = priceToScaled(prices.xlm);
  console.log(`\n📝 Building transaction...`);
  console.log(`   Contract: ${oracleContractId.substring(0, 8)}...`);
  console.log(`   XLM Price: ${xlmPriceScaled} (scaled)`);

  // Build the call operation
  const operation = contract.call(
    "set_price",
    StellarSdk.nativeToScVal("XLM", { type: "symbol" }),
    StellarSdk.nativeToScVal(xlmPriceScaled, { type: "i128" })
  );

  // Build transaction
  let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000", // 0.01 XLM
    networkPassphrase: network.networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Simulate transaction
  console.log("🔍 Simulating transaction...");
  const simulation = await server.simulateTransaction(transaction);

  if (SorobanRpc.Api.isSimulationError(simulation)) {
    console.error("❌ Simulation failed:");
    console.error(simulation.error);
    throw new Error(`Simulation failed: ${simulation.error}`);
  }

  // Prepare and sign
  const preparedTx = SorobanRpc.assembleTransaction(
    transaction,
    simulation
  ).build();
  preparedTx.sign(sourceKeypair);

  // Submit transaction
  console.log("📤 Submitting transaction...");
  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    console.error("❌ Transaction submission failed");
    throw new Error("Transaction submission failed");
  }

  // Wait for confirmation
  console.log("⏳ Waiting for confirmation...");
  let result = await server.getTransaction(sendResponse.hash);

  while (result.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await server.getTransaction(sendResponse.hash);
  }

  if (result.status === "SUCCESS") {
    console.log("\n✅ Price updated successfully!");
    console.log(`   Transaction: ${sendResponse.hash}`);
    return sendResponse.hash;
  } else {
    console.error("❌ Transaction failed");
    console.error(result);
    throw new Error("Transaction failed");
  }
}

// ============================================================================
// MAIN
// ============================================================================

/**
 * Parse command line arguments
 */
function parseArgs(): { crashMode: boolean; mockMode: boolean } {
  const args = process.argv.slice(2);
  return {
    crashMode: args.includes("--crash") || args.includes("-c"),
    mockMode: args.includes("--mock") || args.includes("-m"),
  };
}

/**
 * Load configuration from environment
 */
function loadConfig(args: { crashMode: boolean; mockMode: boolean }): Config {
  const oracleContractId = process.env.ORACLE_CONTRACT_ID;
  const secretKey = process.env.SECRET_KEY;
  const networkName = process.env.NETWORK || "futurenet";

  if (!oracleContractId) {
    console.error("❌ ORACLE_CONTRACT_ID environment variable not set");
    console.error("\nUsage:");
    console.error("  export ORACLE_CONTRACT_ID=CXXXXX...");
    console.error("  export SECRET_KEY=SXXXXX...");
    console.error("  npm run update-price [--crash] [--mock]");
    process.exit(1);
  }

  if (!secretKey) {
    console.error("❌ SECRET_KEY environment variable not set");
    process.exit(1);
  }

  const network = NETWORKS[networkName];
  if (!network) {
    console.error(`❌ Unknown network: ${networkName}`);
    console.error(`   Available: ${Object.keys(NETWORKS).join(", ")}`);
    process.exit(1);
  }

  return {
    oracleContractId,
    secretKey,
    network,
    crashMode: args.crashMode,
    mockMode: args.mockMode,
  };
}

/**
 * Main entry point
 */
async function main() {
  console.log("╔══════════════════════════════════════════════════════╗");
  console.log("║        Stellend Price Oracle Keeper Script           ║");
  console.log("╚══════════════════════════════════════════════════════╝\n");

  const args = parseArgs();
  const config = loadConfig(args);

  console.log(`Mode: ${config.crashMode ? "🔴 CRASH" : "🟢 NORMAL"}`);
  console.log(`Price Source: ${config.mockMode ? "Mock" : "CoinGecko"}\n`);

  try {
    // Fetch prices
    let prices: PriceData;
    if (config.mockMode) {
      prices = getMockPrices();
    } else {
      prices = await fetchPricesFromCoinGecko();
    }

    // Apply crash mode if enabled
    if (config.crashMode) {
      prices = applyCrashMode(prices);
    }

    // Update on-chain
    await updatePriceOnChain(config, prices);

    console.log("\n🎉 Done!");
  } catch (error) {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  }
}

// Run
main();

// ============================================================================
// EXPORTS (for testing)
// ============================================================================

export {
  fetchPricesFromCoinGecko,
  getMockPrices,
  applyCrashMode,
  priceToScaled,
  PriceData,
  Config,
};
