/**
 * Stellend User Funding Script
 *
 * Funds a demo user account with XLM and USDC for testing.
 *
 * ## Prerequisites
 *
 * 1. Tokens must be set up (run setup_tokens.ts first)
 * 2. User account must exist (or will be created via Friendbot)
 *
 * ## Usage
 *
 * ```bash
 * export SECRET_KEY="SXXXXX..."  # Deployer/USDC issuer secret key
 *
 * # Fund a specific user
 * npm run fund-user -- <USER_ADDRESS>
 *
 * # Fund with custom amounts
 * npm run fund-user -- <USER_ADDRESS> --xlm 50000 --usdc 25000
 *
 * # Create a new random user and fund it
 * npm run fund-user -- --new
 * ```
 *
 * ## Default Amounts
 *
 * - 10,000 XLM (from Friendbot)
 * - 10,000 USDC (minted from issuer)
 */

import {
  loadConfig,
  loadDeploymentInfo,
  fundWithFriendbot,
  truncateAddress,
  printBanner,
  printSection,
  StellarSdk,
  SEED_AMOUNTS,
} from "./config.js";

// ============================================================================
// FUNDING FUNCTIONS
// ============================================================================

/**
 * Establish trustline for USDC
 */
async function establishTrustline(
  accountKeypair: StellarSdk.Keypair,
  usdcIssuer: string,
  networkPassphrase: string
): Promise<void> {
  const publicKey = accountKeypair.publicKey();
  console.log(`   Adding USDC trustline...`);

  const usdcAsset = new StellarSdk.Asset("USDC", usdcIssuer);

  const horizonUrl = networkPassphrase.includes("Future")
    ? "https://horizon-futurenet.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);

  try {
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

    await horizonServer.submitTransaction(transaction);
    console.log(`   ✅ Trustline established`);
  } catch (error: any) {
    if (error?.response?.data?.extras?.result_codes?.operations?.[0] === "op_already_exists") {
      console.log(`   ✅ Trustline already exists`);
    } else {
      console.log(`   ⚠️  Trustline may already exist or account needs funding first`);
    }
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

  try {
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

    await horizonServer.submitTransaction(transaction);
    console.log(`   ✅ Minted ${amount.toLocaleString()} USDC`);
  } catch (error: any) {
    console.error(`   ❌ USDC minting failed:`, error?.response?.data?.extras?.result_codes || error);
    throw error;
  }
}

/**
 * Get account balances
 */
async function getBalances(
  publicKey: string,
  networkPassphrase: string
): Promise<{ xlm: number; usdc: number }> {
  const horizonUrl = networkPassphrase.includes("Future")
    ? "https://horizon-futurenet.stellar.org"
    : "https://horizon-testnet.stellar.org";

  const horizonServer = new StellarSdk.Horizon.Server(horizonUrl);

  try {
    const account = await horizonServer.loadAccount(publicKey);

    let xlm = 0;
    let usdc = 0;

    for (const balance of account.balances) {
      if (balance.asset_type === "native") {
        xlm = parseFloat(balance.balance);
      } else if (
        balance.asset_type === "credit_alphanum4" &&
        (balance as any).asset_code === "USDC"
      ) {
        usdc = parseFloat(balance.balance);
      }
    }

    return { xlm, usdc };
  } catch {
    return { xlm: 0, usdc: 0 };
  }
}

// ============================================================================
// CLI ARGUMENT PARSING
// ============================================================================

interface FundingArgs {
  userAddress?: string;
  createNew: boolean;
  xlmAmount: number;
  usdcAmount: number;
}

function parseArgs(): FundingArgs {
  const args = process.argv.slice(2);

  let userAddress: string | undefined;
  let createNew = false;
  let xlmAmount = SEED_AMOUNTS.USER_XLM;
  let usdcAmount = SEED_AMOUNTS.USER_USDC;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === "--new" || arg === "-n") {
      createNew = true;
    } else if (arg === "--xlm" && args[i + 1]) {
      xlmAmount = parseInt(args[++i], 10);
    } else if (arg === "--usdc" && args[i + 1]) {
      usdcAmount = parseInt(args[++i], 10);
    } else if (arg.startsWith("G") && arg.length === 56) {
      // Stellar public key
      userAddress = arg;
    } else if (!arg.startsWith("-")) {
      // Might be an address without G prefix check
      userAddress = arg;
    }
  }

  return { userAddress, createNew, xlmAmount, usdcAmount };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  printBanner("Stellend User Funding");

  const config = loadConfig();
  const args = parseArgs();

  // Load deployment info for USDC issuer
  const deploymentInfo = await loadDeploymentInfo();
  const usdcIssuer = deploymentInfo?.tokens?.usdcIssuer;

  if (!usdcIssuer) {
    console.error("❌ USDC issuer not found in deployment.json");
    console.error("   Run 'npm run setup-tokens' first");
    process.exit(1);
  }

  console.log(`📡 Network: ${config.networkName}`);
  console.log(`💵 USDC Issuer: ${truncateAddress(usdcIssuer)}`);

  // Determine user to fund
  let userAddress: string;
  let userKeypair: StellarSdk.Keypair | null = null;

  if (args.createNew) {
    // Create a new random account
    userKeypair = StellarSdk.Keypair.random();
    userAddress = userKeypair.publicKey();
    console.log(`\n🆕 Creating new user account:`);
    console.log(`   Address: ${userAddress}`);
    console.log(`   Secret:  ${userKeypair.secret()}`);
    console.log(`\n   ⚠️  SAVE THE SECRET KEY! You'll need it to use this account.`);
  } else if (args.userAddress) {
    userAddress = args.userAddress;
    console.log(`\n👤 Funding existing user:`);
    console.log(`   Address: ${truncateAddress(userAddress)}`);
  } else {
    console.error("\n❌ No user address provided");
    console.error("\nUsage:");
    console.error("  npm run fund-user -- <USER_ADDRESS>");
    console.error("  npm run fund-user -- --new  # Create new account");
    console.error("\nOptions:");
    console.error("  --xlm <amount>   XLM amount (default: 10000)");
    console.error("  --usdc <amount>  USDC amount (default: 10000)");
    process.exit(1);
  }

  console.log(`\n💰 Funding amounts:`);
  console.log(`   XLM:  ${args.xlmAmount.toLocaleString()}`);
  console.log(`   USDC: ${args.usdcAmount.toLocaleString()}`);

  // Fund with XLM via Friendbot
  printSection("Funding with XLM");
  const funded = await fundWithFriendbot(userAddress, config.network.friendbotUrl);

  if (!funded) {
    console.error("❌ Failed to fund account with XLM");
    console.error("   The account may need to be created first");
    process.exit(1);
  }

  // Wait for account to be ready
  await new Promise((resolve) => setTimeout(resolve, 2000));

  // Check if we need to establish trustline
  // Only possible if we have the user's keypair (new account)
  if (userKeypair) {
    printSection("Setting Up USDC Trustline");
    await establishTrustline(userKeypair, usdcIssuer, config.network.networkPassphrase);
  } else {
    console.log("\n⚠️  Note: User must add USDC trustline manually if not already done");
    console.log(`   Asset: USDC`);
    console.log(`   Issuer: ${usdcIssuer}`);
  }

  // Mint USDC if trustline exists
  printSection("Minting USDC");
  try {
    await mintUSDC(
      config.keypair, // Deployer is the issuer
      userAddress,
      args.usdcAmount,
      config.network.networkPassphrase
    );
  } catch (error) {
    console.log("\n⚠️  USDC minting failed. User may need to add trustline first.");
    console.log(`   Run: stellar trustline add --asset USDC:${usdcIssuer}`);
  }

  // Get final balances
  printSection("Final Balances");
  const balances = await getBalances(userAddress, config.network.networkPassphrase);
  console.log(`   XLM:  ${balances.xlm.toLocaleString()}`);
  console.log(`   USDC: ${balances.usdc.toLocaleString()}`);

  console.log("\n🎉 User funding complete!");
  console.log(`\n📋 User Address: ${userAddress}`);

  if (userKeypair) {
    console.log(`🔐 User Secret:  ${userKeypair.secret()}`);
    console.log("\n⚠️  IMPORTANT: Save the secret key above!");
  }

  console.log("\nNext steps:");
  console.log("  1. Connect this account to Freighter wallet");
  console.log("  2. Test supply/borrow in the frontend");
}

main().catch((error) => {
  console.error("\n❌ Script failed:", error);
  process.exit(1);
});


