/**
 * Stellend Token Setup Script
 *
 * Creates and wraps tokens for use with the Stellend lending protocol:
 * - Wraps native XLM as a Soroban token (SAC)
 * - Creates a custom USDC asset and wraps it as a Soroban token
 *
 * ## How Stellar Asset Contract (SAC) Works
 *
 * SAC allows Stellar Classic assets to be used in Soroban smart contracts.
 * The contract address is deterministic based on the asset (issuer + code).
 *
 * ## Usage
 *
 * ```bash
 * export SECRET_KEY="SXXXXX..."
 * export NETWORK="futurenet"  # optional
 *
 * npm run setup-tokens
 * ```
 *
 * ## Output
 *
 * Saves token contract IDs to deployment.json
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
  StellarSdk,
  SorobanRpc,
  DeploymentInfo,
  SEED_AMOUNTS,
} from "./config.js";

// ============================================================================
// TOKEN SETUP FUNCTIONS
// ============================================================================

/**
 * Wrap native XLM as a Soroban token using SAC
 */
async function wrapNativeXLM(
  server: SorobanRpc.Server,
  sourceKeypair: StellarSdk.Keypair,
  networkPassphrase: string
): Promise<string> {
  console.log("🔷 Wrapping native XLM...");

  const publicKey = sourceKeypair.publicKey();
  const sourceAccount = await server.getAccount(publicKey);

  // Get the SAC contract ID for native XLM
  const xlmAsset = StellarSdk.Asset.native();
  const xlmContractId = xlmAsset.contractId(networkPassphrase);

  console.log(`   Asset: XLM (native)`);
  console.log(`   Contract ID: ${truncateAddress(xlmContractId)}`);

  // Check if already wrapped by trying to get contract info
  try {
    const contractData = await server.getContractData(
      xlmContractId,
      StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance()
    );
    if (contractData) {
      console.log("   ✅ XLM already wrapped");
      return xlmContractId;
    }
  } catch {
    // Not wrapped yet, proceed with wrapping
  }

  // Build the SAC deployment transaction
  const operation = StellarSdk.Operation.createStellarAssetContract({
    asset: xlmAsset,
  });

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Submit
  transaction.sign(sourceKeypair);
  const sendResponse = await server.sendTransaction(transaction);

  if (sendResponse.status === "ERROR") {
    // Check if it's because contract already exists
    console.log("   ⚠️  Transaction failed - XLM may already be wrapped");
    return xlmContractId;
  }

  // Wait for confirmation
  let result = await server.getTransaction(sendResponse.hash);
  while (result.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await server.getTransaction(sendResponse.hash);
  }

  if (result.status === "SUCCESS") {
    console.log(`   ✅ XLM wrapped successfully`);
    console.log(`   Tx: ${sendResponse.hash}`);
  } else {
    console.log(`   ⚠️  XLM wrapping may have failed (possibly already exists)`);
  }

  return xlmContractId;
}

/**
 * Create a custom USDC asset and wrap it as a Soroban token
 */
async function createAndWrapUSDC(
  server: SorobanRpc.Server,
  issuerKeypair: StellarSdk.Keypair,
  networkPassphrase: string
): Promise<{ contractId: string; issuer: string }> {
  console.log("💵 Creating mock USDC asset...");

  const issuerPublicKey = issuerKeypair.publicKey();

  // Create USDC asset
  const usdcAsset = new StellarSdk.Asset("USDC", issuerPublicKey);
  const usdcContractId = usdcAsset.contractId(networkPassphrase);

  console.log(`   Issuer: ${truncateAddress(issuerPublicKey)}`);
  console.log(`   Asset: USDC`);
  console.log(`   Contract ID: ${truncateAddress(usdcContractId)}`);

  // Check if already wrapped
  try {
    const contractData = await server.getContractData(
      usdcContractId,
      StellarSdk.xdr.ScVal.scvLedgerKeyContractInstance()
    );
    if (contractData) {
      console.log("   ✅ USDC already wrapped");
      return { contractId: usdcContractId, issuer: issuerPublicKey };
    }
  } catch {
    // Not wrapped yet, proceed
  }

  // Get source account
  const sourceAccount = await server.getAccount(issuerPublicKey);

  // Build SAC deployment for USDC
  const operation = StellarSdk.Operation.createStellarAssetContract({
    asset: usdcAsset,
  });

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100000",
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(30)
    .build();

  // Submit
  transaction.sign(issuerKeypair);
  const sendResponse = await server.sendTransaction(transaction);

  if (sendResponse.status === "ERROR") {
    console.log("   ⚠️  Transaction failed - USDC may already be wrapped");
    return { contractId: usdcContractId, issuer: issuerPublicKey };
  }

  // Wait for confirmation
  let result = await server.getTransaction(sendResponse.hash);
  while (result.status === "NOT_FOUND") {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    result = await server.getTransaction(sendResponse.hash);
  }

  if (result.status === "SUCCESS") {
    console.log(`   ✅ USDC wrapped successfully`);
    console.log(`   Tx: ${sendResponse.hash}`);
  } else {
    console.log(`   ⚠️  USDC wrapping may have failed`);
  }

  return { contractId: usdcContractId, issuer: issuerPublicKey };
}

/**
 * Establish trustline for USDC on an account
 */
async function establishTrustline(
  server: SorobanRpc.Server,
  accountKeypair: StellarSdk.Keypair,
  usdcAsset: StellarSdk.Asset,
  networkPassphrase: string
): Promise<void> {
  const publicKey = accountKeypair.publicKey();
  console.log(`   Adding trustline for ${truncateAddress(publicKey)}...`);

  const sourceAccount = await server.getAccount(publicKey);

  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: "100",
    networkPassphrase,
  })
    .addOperation(
      StellarSdk.Operation.changeTrust({
        asset: usdcAsset,
        limit: "1000000000", // 1 billion limit
      })
    )
    .setTimeout(30)
    .build();

  transaction.sign(accountKeypair);

  // Use Horizon for classic transactions
  const horizonUrl = networkPassphrase.includes("Future")
    ? "https://horizon-futurenet.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);

  try {
    await horizonServer.submitTransaction(transaction);
    console.log(`   ✅ Trustline established`);
  } catch (error: any) {
    if (error?.response?.data?.extras?.result_codes?.operations?.[0] === "op_success") {
      console.log(`   ✅ Trustline already exists or established`);
    } else {
      console.log(`   ⚠️  Trustline may already exist`);
    }
  }
}

/**
 * Mint USDC to an account (classic payment from issuer)
 */
async function mintUSDC(
  issuerKeypair: StellarSdk.Keypair,
  recipientPublicKey: string,
  amount: number,
  networkPassphrase: string
): Promise<void> {
  console.log(`   Minting ${amount.toLocaleString()} USDC to ${truncateAddress(recipientPublicKey)}...`);

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

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner("Stellend Token Setup");

  const config = loadConfig();

  console.log(`📡 Network: ${config.networkName}`);
  console.log(`🔑 Deployer: ${truncateAddress(config.keypair.publicKey())}`);

  // Load existing deployment info
  let deploymentInfo = await loadDeploymentInfo();
  if (!deploymentInfo) {
    deploymentInfo = {
      network: config.networkName,
      timestamp: new Date().toISOString(),
      contracts: {},
      tokens: {},
      accounts: {
        deployer: config.keypair.publicKey(),
      },
    };
  }

  // Fund deployer if needed
  printSection("Funding Accounts");
  await fundWithFriendbot(config.keypair.publicKey(), config.network.friendbotUrl);

  // Wrap XLM
  printSection("Wrapping XLM");
  const xlmContractId = await wrapNativeXLM(
    config.server,
    config.keypair,
    config.network.networkPassphrase
  );
  deploymentInfo.tokens.xlm = xlmContractId;

  // Create and wrap USDC
  printSection("Creating USDC");
  const { contractId: usdcContractId, issuer: usdcIssuer } = await createAndWrapUSDC(
    config.server,
    config.keypair,
    config.network.networkPassphrase
  );
  deploymentInfo.tokens.usdc = usdcContractId;
  deploymentInfo.tokens.usdcIssuer = usdcIssuer;

  // Update timestamp
  deploymentInfo.timestamp = new Date().toISOString();

  // Save deployment info
  await saveDeploymentInfo(deploymentInfo);

  // Print summary
  printSection("Summary");
  console.log("Token contracts created:");
  console.log(`  XLM:  ${xlmContractId}`);
  console.log(`  USDC: ${usdcContractId}`);
  console.log(`  USDC Issuer: ${usdcIssuer}`);

  console.log("\n🎉 Token setup complete!");
  console.log("\nNext steps:");
  console.log("  1. Run 'npm run seed-pool' to add liquidity");
  console.log("  2. Run 'npm run fund-user <address>' to fund test users");
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});


