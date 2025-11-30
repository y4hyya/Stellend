// Contract Configuration for Apogee
// These addresses should be updated after deployment

export const CONTRACTS = {
  // Pool contract address (deployed on Futurenet)
  POOL: process.env.NEXT_PUBLIC_POOL_CONTRACT_ID || "",
  
  // Price Oracle contract address
  PRICE_ORACLE: process.env.NEXT_PUBLIC_ORACLE_CONTRACT_ID || "",
  
  // Interest Rate Model contract address
  INTEREST_RATE_MODEL: process.env.NEXT_PUBLIC_INTEREST_RATE_MODEL_CONTRACT_ID || "",
  
  // Token addresses (wrapped via SAC)
  XLM_TOKEN: process.env.NEXT_PUBLIC_XLM_TOKEN_ID || "",
  USDC_TOKEN: process.env.NEXT_PUBLIC_USDC_TOKEN_ID || "",
}

// Network configuration - TESTNET
export const NETWORK_CONFIG = {
  network: "TESTNET" as const,
  networkPassphrase: "Test SDF Network ; September 2015",
  horizonUrl: "https://horizon-testnet.stellar.org",
  sorobanRpcUrl: "https://soroban-testnet.stellar.org",
}

// Asset configuration
export const ASSETS = {
  XLM: {
    symbol: "XLM",
    name: "Stellar Lumens",
    decimals: 7,
    icon: "⭐",
    isCollateral: true,
  },
  USDC: {
    symbol: "USDC",
    name: "USD Coin",
    decimals: 7,
    icon: "$",
    isCollateral: false,
  },
}

// Protocol parameters
export const PROTOCOL_PARAMS = {
  LTV_RATIO: 0.75, // 75% loan-to-value
  LIQUIDATION_THRESHOLD: 0.80, // 80%
  LIQUIDATION_BONUS: 0.05, // 5% bonus for liquidators
  CLOSE_FACTOR: 0.50, // 50% max debt repayable in one liquidation
}

// Scale factor for fixed-point math (matches contract SCALE)
export const SCALE = BigInt(10_000_000) // 1e7

