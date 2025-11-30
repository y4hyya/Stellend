/**
 * Contract Error Parser for Apogee
 * 
 * Parses Soroban contract errors and returns user-friendly messages
 */

// Known error codes from the contracts
const CONTRACT_ERRORS: Record<string, string> = {
  // Pool contract errors
  "already initialized": "Contract is already initialized",
  "not initialized": "Contract is not initialized",
  "insufficient balance": "Insufficient balance in your wallet",
  "insufficient collateral": "Not enough collateral to complete this action",
  "insufficient liquidity": "Insufficient liquidity in the pool. Try a smaller amount.",
  "borrow limit exceeded": "Borrow limit exceeded. You need more collateral or less debt.",
  "ltv exceeded": "Loan-to-Value ratio exceeded. Deposit more collateral or borrow less.",
  "health factor too low": "Health factor would drop too low. This action is not safe.",
  "position healthy": "Position is healthy and cannot be liquidated",
  "close factor exceeded": "Cannot liquidate more than 50% of the debt at once",
  "invalid amount": "Invalid amount specified",
  "zero amount": "Amount must be greater than zero",
  "unauthorized": "You are not authorized to perform this action",
  
  // Oracle errors
  "price not set": "Price not available for this asset",
  "stale price": "Price data is stale. Please wait for oracle update.",
  
  // Token errors
  "transfer failed": "Token transfer failed. Check your balance.",
  "approval required": "Token approval required before this action",
  
  // General Soroban errors
  "simulation failed": "Transaction simulation failed. The operation may not be valid.",
  "transaction failed": "Transaction failed on-chain. Please try again.",
  "timeout": "Transaction timed out. Please check the explorer and try again.",
}

// Error patterns for regex matching
const ERROR_PATTERNS: { pattern: RegExp; message: string }[] = [
  { 
    pattern: /insufficient.*balance/i, 
    message: "Insufficient balance in your wallet" 
  },
  { 
    pattern: /insufficient.*collateral/i, 
    message: "Not enough collateral. Deposit more XLM first." 
  },
  { 
    pattern: /insufficient.*liquidity/i, 
    message: "Pool doesn't have enough liquidity. Try a smaller amount." 
  },
  { 
    pattern: /borrow.*limit|ltv.*exceeded/i, 
    message: "Borrow limit exceeded. You can only borrow up to 75% of your collateral value." 
  },
  { 
    pattern: /health.*factor/i, 
    message: "This action would make your position unsafe (Health Factor < 1.0)." 
  },
  { 
    pattern: /position.*healthy/i, 
    message: "This position is healthy and cannot be liquidated." 
  },
  { 
    pattern: /unauthorized|not.*admin/i, 
    message: "You don't have permission to perform this action." 
  },
  { 
    pattern: /simulation.*failed/i, 
    message: "Transaction simulation failed. Check your inputs and try again." 
  },
  { 
    pattern: /user.*rejected|denied/i, 
    message: "Transaction was rejected in your wallet." 
  },
  {
    pattern: /timeout|timed.*out/i,
    message: "Transaction timed out. Please check Stellar Expert and try again."
  },
  {
    pattern: /network.*error|fetch.*failed/i,
    message: "Network error. Please check your connection and try again."
  },
]

/**
 * Parse a contract error and return a user-friendly message
 */
export function parseContractError(error: unknown): string {
  // Get the error message string
  let errorMessage = ""
  
  if (error instanceof Error) {
    errorMessage = error.message
  } else if (typeof error === "string") {
    errorMessage = error
  } else if (error && typeof error === "object") {
    errorMessage = JSON.stringify(error)
  }
  
  const lowerMessage = errorMessage.toLowerCase()
  
  // Check for exact matches in known errors
  for (const [key, message] of Object.entries(CONTRACT_ERRORS)) {
    if (lowerMessage.includes(key.toLowerCase())) {
      return message
    }
  }
  
  // Check for pattern matches
  for (const { pattern, message } of ERROR_PATTERNS) {
    if (pattern.test(errorMessage)) {
      return message
    }
  }
  
  // If no match found, return a cleaned-up version of the original error
  if (errorMessage.length > 100) {
    return "Transaction failed. Please try again or contact support."
  }
  
  return errorMessage || "An unknown error occurred. Please try again."
}

/**
 * Transaction state for UI feedback
 */
export type TransactionState = 
  | "idle"
  | "signing"      // Waiting for wallet signature
  | "submitting"   // Submitting to network
  | "confirming"   // Waiting for confirmation
  | "success"
  | "error"

/**
 * Get loading message based on transaction state
 */
export function getTransactionMessage(state: TransactionState): string {
  switch (state) {
    case "signing":
      return "Waiting for wallet signature..."
    case "submitting":
      return "Submitting transaction..."
    case "confirming":
      return "Confirming on-chain..."
    case "success":
      return "Transaction confirmed!"
    case "error":
      return "Transaction failed"
    default:
      return ""
  }
}

/**
 * Specific error messages for different operations
 */
export const OPERATION_ERRORS = {
  supply: {
    insufficientBalance: "You don't have enough USDC in your wallet to supply this amount.",
    minAmount: "Minimum supply amount is 1 USDC.",
  },
  withdraw: {
    insufficientSupply: "You don't have enough supplied balance to withdraw this amount.",
    insufficientLiquidity: "Pool doesn't have enough liquidity. Some funds are borrowed by others.",
  },
  borrow: {
    insufficientCollateral: "You need more collateral to borrow this amount. Deposit more XLM first.",
    ltvExceeded: "Borrow limit exceeded. Maximum is 75% of your collateral value.",
    insufficientLiquidity: "Pool doesn't have enough USDC to lend. Try a smaller amount.",
  },
  repay: {
    insufficientBalance: "You don't have enough USDC to repay this amount.",
    noDebt: "You don't have any outstanding debt to repay.",
  },
  depositCollateral: {
    insufficientBalance: "You don't have enough XLM in your wallet.",
    minAmount: "Minimum collateral deposit is 10 XLM.",
  },
  withdrawCollateral: {
    insufficientCollateral: "You don't have enough collateral to withdraw this amount.",
    wouldLiquidate: "Withdrawing this amount would make your position liquidatable. Repay some debt first.",
  },
  liquidate: {
    positionHealthy: "This position is healthy (Health Factor ≥ 1.0) and cannot be liquidated.",
    closeFactor: "You can only liquidate up to 50% of the debt in a single transaction.",
    insufficientBalance: "You don't have enough USDC to perform this liquidation.",
  },
}

