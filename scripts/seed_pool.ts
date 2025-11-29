/**
 * Stellend Pool Seeding Script
 *
 * Seeds the lending pool with initial liquidity:
 * - Creates a "whale" account
 * - Mints USDC to the whale
 * - Deposits USDC into the pool via supply()
 * - Optionally adds XLM collateral for testing
 *
 * ## Prerequisites
 *
 * 1. Contracts must be deployed (run deploy_all.ts first)
 * 2. Tokens must be set up (run setup_tokens.ts first)
 *
 * ## Usage
 *
 * ```bash
 * export SECRET_KEY="SXXXXX..."  # Deployer/admin secret key
 * export POOL_CONTRACT_ID="CXXXXX..."  # Pool contract ID
 *
 * npm run seed-pool
 * ```
 *
 * ## Output
 *
 * - Creates whale account with 1,000,000 USDC
 * - Supplies 500,000 USDC to the pool
 * - Prints pool state summary
 */

import {
  loadConfig,
  loadDeploymentInfo,
  saveDeploymentInfo,
  fundWithFriendbot,
  truncateAddress,
  printBanner,
  printSection,
  toStroops,
  fromStroops,
  waitForTransaction,
  StellarSdk,
  SorobanRpc,
  SEED_AMOUNTS,
} from "./config.js";

// ============================================================================
// POOL INTERACTION FUNCTIONS
// ============================================================================

/**
 * Supply assets to the lending pool via Soroban contract call
 */
async function supplyToPool(
  server: SorobanRpc.Server,
  poolContractId: string,
  userKeypair: StellarSdk.Keypair,
  asset: string, // "XLM" or "USDC"
  amount: bigint,
  networkPassphrase: string
): Promise<string> {
  console.log(`   Supplying ${Number(amount) / 10_000_000} ${asset} to pool...`);

  const publicKey = userKeypair.publicKey();
  const sourceAccount = await server.getAccount(publicKey);

  // Create contract instance
  const contract = new StellarSdk.Contract(poolContractId);

  // Build the supply call
  const operation = contract.call(
    "supply",
    StellarSdk.nativeToScVal(publicKey, { type: "address" }),
    StellarSdk.nativeToScVal(asset, { type: "symbol" }),
    StellarSdk.nativeToScVal(amount, { type: "i128" })
  );

  // Build transaction
  let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Simulate
  const simulation = await server.simulateTransaction(transaction);

  if (SorobanRpc.Api.isSimulationError(simulation)) {
    throw new Error(`Supply simulation failed: ${simulation.error}`);
  }

  // Prepare and sign
  const preparedTx = SorobanRpc.assembleTransaction(transaction, simulation).build();
  preparedTx.sign(userKeypair);

  // Submit
  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error("Supply transaction submission failed");
  }

  // Wait for confirmation
  const result = await waitForTransaction(server, sendResponse.hash);

  if (result.status === "SUCCESS") {
    console.log(`   ✅ Supplied ${Number(amount) / 10_000_000} ${asset}`);
    return sendResponse.hash;
  } else {
    throw new Error(`Supply transaction failed: ${JSON.stringify(result)}`);
  }
}

/**
 * Deposit collateral to the lending pool
 */
async function depositCollateral(
  server: SorobanRpc.Server,
  poolContractId: string,
  userKeypair: StellarSdk.Keypair,
  asset: string,
  amount: bigint,
  networkPassphrase: string
): Promise<string> {
  console.log(`   Depositing ${Number(amount) / 10_000_000} ${asset} as collateral...`);

  const publicKey = userKeypair.publicKey();
  const sourceAccount = await server.getAccount(publicKey);

  const contract = new StellarSdk.Contract(poolContractId);

  const operation = contract.call(
    "deposit_collateral",
    StellarSdk.nativeToScVal(publicKey, { type: "address" }),
    StellarSdk.nativeToScVal(asset, { type: "symbol" }),
    StellarSdk.nativeToScVal(amount, { type: "i128" })
  );

  let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  if (SorobanRpc.Api.isSimulationError(simulation)) {
    throw new Error(`Deposit collateral simulation failed: ${simulation.error}`);
  }

  const preparedTx = SorobanRpc.assembleTransaction(transaction, simulation).build();
  preparedTx.sign(userKeypair);

  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    throw new Error("Deposit collateral transaction submission failed");
  }

  const result = await waitForTransaction(server, sendResponse.hash);

  if (result.status === "SUCCESS") {
    console.log(`   ✅ Deposited ${Number(amount) / 10_000_000} ${asset} as collateral`);
    return sendResponse.hash;
  } else {
    throw new Error(`Deposit collateral failed: ${JSON.stringify(result)}`);
  }
}

/**
 * Get pool market info
 */
async function getMarketInfo(
  server: SorobanRpc.Server,
  poolContractId: string,
  asset: string,
  sourceKeypair: StellarSdk.Keypair,
  networkPassphrase: string
): Promise<any> {
  const publicKey = sourceKeypair.publicKey();
  const sourceAccount = await server.getAccount(publicKey);

  const contract = new StellarSdk.Contract(poolContractId);

  const operation = contract.call(
    "get_market_info",
    StellarSdk.nativeToScVal(asset, { type: "symbol" })
  );

  let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  if (SorobanRpc.Api.isSimulationError(simulation)) {
    return null;
  }

  // Parse the result from simulation
  return simulation.result?.retval;
}

/**
 * Establish trustline for USDC
 */
async function establishTrustline(
  accountKeypair: StellarSdk.Keypair,
  usdcIssuer: string,
  networkPassphrase: string
): Promise<void> {
  const publicKey = accountKeypair.publicKey();
  console.log(`   Adding USDC trustline for ${truncateAddress(publicKey)}...`);

  const usdcAsset = new StellarSdk.Asset("USDC", usdcIssuer);

  const horizonUrl = networkPassphrase.includes("Future")
    ? "https://horizon-futurenet.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
  const sourceAccount = await horizonServer.loadAccount(publicKey);

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: usdcAsset,
        limit: "1000000000",
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(accountKeypair);

  try {
    await horizonServer.submitTransaction(transaction);
    console.log(`   ✅ Trustline established`);
  } catch (error: any) {
    console.log(`   ⚠️  Trustline may already exist`);
  }
}

/**
 * Mint USDC to an account
 */
async function mintUSDC(
  issuerKeypair: StellarSdk.Keypair,
  recipientPublicKey: string,
  amount: number,
  networkPassphrase: string
): Promise<void> {
  console.log(`   Minting ${amount.toLocaleString()} USDC...`);

  const issuerPublicKey = issuerKeypair.publicKey();
  const usdcAsset = new StellarSdk.Asset("USDC", issuerPublicKey);

  const horizonUrl = networkPassphrase.includes("Future")
    ? "https://horizon-futurenet.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);
  const sourceAccount = await horizonServer.loadAccount(issuerPublicKey);

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.payment({
        destination: recipientPublicKey,
        asset: usdcAsset,
        amount: amount.toString(),
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(issuerKeypair);

  try {
    await horizonServer.submitTransaction(transaction);
    console.log(`   ✅ Minted ${amount.toLocaleString()} USDC`);
  } catch (error: any) {
    console.error(`   ❌ Minting failed:`, error?.response?.data?.extras?.result_codes || error);
    throw error;
  }
}

/**
 * Approve token spending for the pool contract (Soroban SAC)
 */
async function approveTokenSpending(
  server: SorobanRpc.Server,
  tokenContractId: string,
  ownerKeypair: StellarSdk.Keypair,
  spenderContractId: string,
  amount: bigint,
  networkPassphrase: string
): Promise<void> {
  console.log(`   Approving token spending...`);

  const publicKey = ownerKeypair.publicKey();
  const sourceAccount = await server.getAccount(publicKey);

  const contract = new StellarSdk.Contract(tokenContractId);

  // Approve with a long expiration (1 year in ledgers, ~12 seconds each)
  const expirationLedger = Math.floor(Date.now() / 1000 / 12) + 2629746; // ~1 year

  const operation = contract.call(
    "approve",
    StellarSdk.nativeToScVal(publicKey, { type: "address" }),
    StellarSdk.nativeToScVal(spenderContractId, { type: "address" }),
    StellarSdk.nativeToScVal(amount, { type: "i128" }),
    StellarSdk.nativeToScVal(expirationLedger, { type: "u32" })
  );

  let transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  const simulation = await server.simulateTransaction(transaction);

  if (SorobanRpc.Api.isSimulationError(simulation)) {
    console.log(`   ⚠️  Approval simulation failed (may not be needed)`);
    return;
  }

  const preparedTx = SorobanRpc.assembleTransaction(transaction, simulation).build();
  preparedTx.sign(ownerKeypair);

  const sendResponse = await server.sendTransaction(preparedTx);

  if (sendResponse.status === "ERROR") {
    console.log(`   ⚠️  Approval may not be needed`);
    return;
  }

  await waitForTransaction(server, sendResponse.hash);
  console.log(`   ✅ Token spending approved`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner("Stellend Pool Seeding");

  const config = loadConfig();

  // Get pool contract ID from env or deployment.json
  const poolContractId = process.env.POOL_CONTRACT_ID;
  const deploymentInfo = await loadDeploymentInfo();

  const actualPoolId = poolContractId || deploymentInfo?.contracts?.pool;

  if (!actualPoolId) {
    console.error("❌ POOL_CONTRACT_ID not set and not found in deployment.json");
    console.error("\nEither:");
    console.error("  1. Set POOL_CONTRACT_ID environment variable");
    console.error("  2. Run 'npm run deploy-all' first");
    process.exit(1);
  }

  const usdcIssuer = deploymentInfo?.tokens?.usdcIssuer;
  const usdcContractId = deploymentInfo?.tokens?.usdc;
  const xlmContractId = deploymentInfo?.tokens?.xlm;

  if (!usdcIssuer || !usdcContractId) {
    console.error("❌ Token info not found in deployment.json");
    console.error("   Run 'npm run setup-tokens' first");
    process.exit(1);
  }

  console.log(`📡 Network: ${config.networkName}`);
  console.log(`🔑 Deployer: ${truncateAddress(config.keypair.publicKey())}`);
  console.log(`🏦 Pool: ${truncateAddress(actualPoolId)}`);
  console.log(`💵 USDC Issuer: ${truncateAddress(usdcIssuer)}`);

  // Create whale account
  printSection("Creating Whale Account");
  const whaleKeypair = StellarSdk.Keypair.random();
  console.log(`   Whale: ${truncateAddress(whaleKeypair.publicKey())}`);
  console.log(`   Secret: ${whaleKeypair.secret()}`);

  // Fund whale
  await fundWithFriendbot(whaleKeypair.publicKey(), config.network.friendbotUrl);

  // Establish USDC trustline for whale
  printSection("Setting Up USDC for Whale");
  await establishTrustline(whaleKeypair, usdcIssuer, config.network.networkPassphrase);

  // Mint USDC to whale
  await mintUSDC(
    config.keypair, // Deployer is the issuer
    whaleKeypair.publicKey(),
    SEED_AMOUNTS.WHALE_USDC_MINT,
    config.network.networkPassphrase
  );

  // Approve pool to spend whale's USDC
  printSection("Approving Pool");
  if (usdcContractId) {
    await approveTokenSpending(
      config.server,
      usdcContractId,
      whaleKeypair,
      actualPoolId,
      toStroops(SEED_AMOUNTS.POOL_USDC_SUPPLY * 2), // Approve more than needed
      config.network.networkPassphrase
    );
  }

  // Supply USDC to pool
  printSection("Supplying to Pool");
  try {
    await supplyToPool(
      config.server,
      actualPoolId,
      whaleKeypair,
      "USDC",
      toStroops(SEED_AMOUNTS.POOL_USDC_SUPPLY),
      config.network.networkPassphrase
    );
  } catch (error) {
    console.error("   ⚠️  Supply failed. Pool may need initialization first.");
    console.error(`   Error: ${error}`);
  }

  // Update deployment info with whale
  if (deploymentInfo) {
    deploymentInfo.accounts.whale = whaleKeypair.publicKey();
    deploymentInfo.timestamp = new Date().toISOString();
    await saveDeploymentInfo(deploymentInfo);
  }

  // Print summary
  printSection("Pool State Summary");
  console.log("Whale account:");
  console.log(`  Address: ${whaleKeypair.publicKey()}`);
  console.log(`  USDC Supplied: ${SEED_AMOUNTS.POOL_USDC_SUPPLY.toLocaleString()}`);
  console.log(`  USDC Remaining: ${(SEED_AMOUNTS.WHALE_USDC_MINT - SEED_AMOUNTS.POOL_USDC_SUPPLY).toLocaleString()}`);

  console.log("\n🎉 Pool seeding complete!");
  console.log("\nNext steps:");
  console.log("  1. Run 'npm run fund-user <address>' to fund test users");
  console.log("  2. Test supply/borrow/repay in the frontend");
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});


