/**
 * Price Oracle Keeper Script
 * 
 * Fetches asset prices from CoinGecko and updates the on-chain oracle contract.
 * Supports "chaos mode" for demo purposes (simulates 50% price crash).
 * 
 * Usage:
 *   Normal mode: npm run update-price
 *   Crash mode:  npm run update-price -- --crash
 */

import * as StellarSdk from '@stellar/stellar-sdk';
import { SorobanRpc } from '@stellar/stellar-sdk';
import axios from 'axios';

// Configuration
const COINGECKO_API_URL = 'https://api.coingecko.com/api/v3/simple/price';
const FUTURENET_RPC_URL = 'https://rpc-futurenet.stellar.org';
const FUTURENET_NETWORK_PASSPHRASE = 'Test SDF Future Network ; October 2022';

interface Config {
  oracleContractId: string;
  secretKey: string;
  crashMode: boolean;
}

/**
 * Fetch XLM price from CoinGecko
 */
async function fetchXLMPrice(): Promise<number> {
  try {
    const response = await axios.get(COINGECKO_API_URL, {
      params: {
        ids: 'stellar',
        vs_currencies: 'usd',
      },
    });
    
    return response.data.stellar.usd;
  } catch (error) {
    console.error('Error fetching price from CoinGecko:', error);
    throw error;
  }
}

/**
 * Update price on-chain oracle contract
 */
async function updatePrice(config: Config): Promise<void> {
  const { oracleContractId, secretKey, crashMode } = config;
  
  // Fetch current price
  let price = await fetchXLMPrice();
  console.log(`Current XLM price: $${price}`);
  
  // Apply crash mode if enabled
  if (crashMode) {
    price = price * 0.5;
    console.log(`⚠️  CRASH MODE: Price reduced to $${price} (50% drop)`);
  }
  
  // Initialize Soroban RPC client
  const server = new SorobanRpc.Server(FUTURENET_RPC_URL, { allowHttp: true });
  
  // Load account
  const sourceKeypair = StellarSdk.Keypair.fromSecret(secretKey);
  const sourceAccount = await server.getAccount(sourceKeypair.publicKey());
  
  // Create contract instance
  const contract = new StellarSdk.Contract(oracleContractId);
  
  // Build transaction
  const transaction = new StellarSdk.TransactionBuilder(sourceAccount, {
    fee: StellarSdk.BASE_FEE,
    networkPassphrase: FUTURENET_NETWORK_PASSPHRASE,
  })
    .addOperation(
      contract.call(
        'set_price',
        StellarSdk.nativeToScVal('XLM', { type: 'symbol' }),
        StellarSdk.nativeToScVal(Math.floor(price * 1e7), { type: 'i128' }) // Scale to 7 decimals
      )
    )
    .setTimeout(30)
    .build();
  
  // Sign and submit
  transaction.sign(sourceKeypair);
  
  console.log('Submitting transaction...');
  const result = await server.sendTransaction(transaction);
  
  if (result.status === 'SUCCESS') {
    console.log(`✅ Price updated successfully!`);
    console.log(`   Transaction hash: ${result.hash}`);
  } else {
    console.error('❌ Transaction failed:', result);
    throw new Error('Transaction failed');
  }
}

/**
 * Main function
 */
async function main() {
  const args = process.argv.slice(2);
  const crashMode = args.includes('--crash');
  
  // Load configuration from environment variables
  const config: Config = {
    oracleContractId: process.env.ORACLE_CONTRACT_ID || '',
    secretKey: process.env.SECRET_KEY || '',
    crashMode,
  };
  
  if (!config.oracleContractId) {
    console.error('❌ Error: ORACLE_CONTRACT_ID environment variable not set');
    process.exit(1);
  }
  
  if (!config.secretKey) {
    console.error('❌ Error: SECRET_KEY environment variable not set');
    process.exit(1);
  }
  
  try {
    await updatePrice(config);
  } catch (error) {
    console.error('❌ Script failed:', error);
    process.exit(1);
  }
}

// Run if executed directly
main().catch(console.error);

export { updatePrice, fetchXLMPrice };

