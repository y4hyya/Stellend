// Soroban Contract Service for Apogee
// Replaces mock-contract-api.ts with real on-chain calls

import {
  Contract,
  SorobanRpc,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  xdr,
  scValToNative,
  nativeToScVal,
  Address,
  Keypair,
} from "@stellar/stellar-sdk"
import { CONTRACTS, NETWORK_CONFIG, ASSETS, SCALE } from "@/config/contracts"

// Initialize Soroban RPC client
const sorobanServer = new SorobanRpc.Server(NETWORK_CONFIG.sorobanRpcUrl)

// Helper to convert contract i128 to JS number (with decimals)
function fromContractAmount(amount: bigint, decimals: number = 7): number {
  return Number(amount) / Math.pow(10, decimals)
}

// Helper to convert JS number to contract i128
function toContractAmount(amount: number, decimals: number = 7): bigint {
  return BigInt(Math.floor(amount * Math.pow(10, decimals)))
}

// Helper to convert scaled values (1e7 scale)
function fromScaled(value: bigint): number {
  return Number(value) / 10_000_000
}

export interface DashboardData {
  userCollateral_sXLM: number
  userCollateral_USD: number
  userDebt_sUSDC: number
  userSupply_sUSDC: number
  borrowLimit: number
  healthFactor: number
  poolTotalSupply_sUSDC: number
  poolTotalBorrowed_sUSDC: number
  poolUtilization: number
  borrowAPR: number
  supplyAPR: number
}

export interface WalletBalances {
  sXLM: number
  sUSDC: number
}

export interface MarketData {
  asset: string
  icon: string
  totalSupplied: number
  totalBorrowed: number
  supplyAPR: number
  borrowAPY: number
  utilization: number
  price: number
  priceChange24h: number
}

class SorobanContractService {
  private poolContract: Contract | null = null
  private oracleContract: Contract | null = null

  constructor() {
    if (CONTRACTS.POOL) {
      this.poolContract = new Contract(CONTRACTS.POOL)
      console.log("Pool contract configured:", CONTRACTS.POOL)
    } else {
      console.warn("Pool contract not configured. Set NEXT_PUBLIC_POOL_CONTRACT_ID in .env.local")
    }
    
    if (CONTRACTS.PRICE_ORACLE) {
      this.oracleContract = new Contract(CONTRACTS.PRICE_ORACLE)
      console.log("Oracle contract configured:", CONTRACTS.PRICE_ORACLE)
    } else {
      console.warn("Oracle contract not configured. Set NEXT_PUBLIC_ORACLE_CONTRACT_ID in .env.local")
    }
    
    // Log all contract configs for debugging
    console.log("Contract configuration:", {
      pool: CONTRACTS.POOL || "(not set)",
      oracle: CONTRACTS.PRICE_ORACLE || "(not set)",
      interestRateModel: CONTRACTS.INTEREST_RATE_MODEL || "(not set)",
      xlmToken: CONTRACTS.XLM_TOKEN || "(not set)",
      usdcToken: CONTRACTS.USDC_TOKEN || "(not set)",
      network: NETWORK_CONFIG.sorobanRpcUrl,
    })
  }

  // Check if contracts are configured
  isConfigured(): boolean {
    return !!(CONTRACTS.POOL && CONTRACTS.PRICE_ORACLE)
  }

  // Check if pool contract is properly initialized
  async isPoolInitialized(): Promise<boolean> {
    if (!this.poolContract) return false
    
    try {
      // Try to call get_ltv_ratio - this will fail if not initialized
      const result = await this.callContract("get_ltv_ratio", [
        nativeToScVal("XLM", { type: "symbol" })
      ])
      return result !== null
    } catch {
      return false
    }
  }

  // Query token balance from SAC contract
  async getTokenBalance(tokenAddress: string, userAddress: string): Promise<number> {
    if (!tokenAddress || !userAddress) return 0
    
    try {
      const tokenContract = new Contract(tokenAddress)
      const userAddr = new Address(userAddress)
      
      const tx = await this.buildReadTransaction(
        tokenContract.call("balance", userAddr.toScVal())
      )
      const result = await sorobanServer.simulateTransaction(tx)

      if (SorobanRpc.Api.isSimulationSuccess(result)) {
        const returnValue = result.result?.retval
        if (returnValue) {
          const balance = scValToNative(returnValue) as bigint
          return fromContractAmount(balance)
        }
      }
      return 0
    } catch (error) {
      console.error(`Error fetching token balance for ${tokenAddress}:`, error)
      return 0
    }
  }

  // Query classic asset balance from Horizon
  async getClassicBalance(userAddress: string, assetCode: string, assetIssuer?: string): Promise<number> {
    if (!userAddress) return 0
    
    try {
      const horizonUrl = NETWORK_CONFIG.horizonUrl || "https://horizon-testnet.stellar.org"
      const response = await fetch(`${horizonUrl}/accounts/${userAddress}`)
      
      if (!response.ok) {
        console.log(`Account ${userAddress} not found on Horizon`)
        return 0
      }
      
      const account = await response.json()
      
      // For native XLM
      if (assetCode === "XLM" && !assetIssuer) {
        const nativeBalance = account.balances?.find((b: any) => b.asset_type === "native")
        return nativeBalance ? parseFloat(nativeBalance.balance) : 0
      }
      
      // For other assets (like USDC)
      const assetBalance = account.balances?.find((b: any) => 
        b.asset_code === assetCode && 
        (!assetIssuer || b.asset_issuer === assetIssuer)
      )
      
      return assetBalance ? parseFloat(assetBalance.balance) : 0
    } catch (error) {
      console.error(`Error fetching classic balance for ${assetCode}:`, error)
      return 0
    }
  }

  // Get wallet balances for XLM and USDC tokens
  // Tries SAC first, then falls back to Horizon classic balances
  async getWalletBalances(userAddress: string): Promise<WalletBalances> {
    if (!userAddress) {
      return { sXLM: 0, sUSDC: 0 }
    }

    try {
      // Try SAC token balances first
      let xlmBalance = 0
      let usdcBalance = 0
      
      // Query XLM - try SAC first, then classic
      if (CONTRACTS.XLM_TOKEN) {
        xlmBalance = await this.getTokenBalance(CONTRACTS.XLM_TOKEN, userAddress)
      }
      if (xlmBalance === 0) {
        xlmBalance = await this.getClassicBalance(userAddress, "XLM")
      }
      
      // Query USDC - try SAC first, then classic
      if (CONTRACTS.USDC_TOKEN) {
        usdcBalance = await this.getTokenBalance(CONTRACTS.USDC_TOKEN, userAddress)
      }
      if (usdcBalance === 0) {
        // Try to find any USDC asset the user has
        usdcBalance = await this.getClassicBalance(userAddress, "USDC")
      }
      
      console.log(`Wallet balances for ${userAddress}: XLM=${xlmBalance}, USDC=${usdcBalance}`)
      
      return {
        sXLM: xlmBalance,
        sUSDC: usdcBalance,
      }
    } catch (error) {
      console.error("Error fetching wallet balances:", error)
      return { sXLM: 0, sUSDC: 0 }
    }
  }

  // Get price from oracle
  async getPrice(asset: "XLM" | "USDC"): Promise<number> {
    if (!this.oracleContract) {
      // Return mock prices if oracle not configured
      return asset === "XLM" ? 0.35 : 1.0
    }

    try {
      const result = await sorobanServer.simulateTransaction(
        await this.buildReadTransaction(
          this.oracleContract.call("get_price", nativeToScVal(asset, { type: "symbol" }))
        )
      )

      if (SorobanRpc.Api.isSimulationSuccess(result)) {
        const returnValue = result.result?.retval
        if (returnValue) {
          const price = scValToNative(returnValue) as bigint
          return fromScaled(price)
        }
      }
      return asset === "XLM" ? 0.35 : 1.0
    } catch (error) {
      console.error("Error fetching price:", error)
      return asset === "XLM" ? 0.35 : 1.0
    }
  }

  // Set price on oracle (admin only - for demo purposes)
  async setPrice(
    asset: "XLM" | "USDC",
    priceUsd: number,
    publicKey: string,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> {
    if (!this.oracleContract) {
      console.error("Oracle contract not configured")
      return false
    }

    if (!publicKey) {
      console.error("Public key required for setPrice")
      return false
    }

    try {
      // Convert price to scaled format (1e7)
      const scaledPrice = BigInt(Math.floor(priceUsd * 10_000_000))

      const txXdr = await this.buildTransaction(
        publicKey,
        this.oracleContract.call(
          "set_price",
          nativeToScVal(asset, { type: "symbol" }),
          nativeToScVal(scaledPrice, { type: "i128" })
        )
      )

      if (!txXdr) {
        console.error("Failed to build set_price transaction")
        return false
      }

      const signedXdr = await signTx(txXdr)
      const txHash = await this.submitTransaction(signedXdr)
      return !!txHash // Return true if we got a transaction hash
    } catch (error) {
      console.error("Error setting price:", error)
      return false
    }
  }

  // Crash XLM price to $0.01 (for demo liquidation)
  async crashPrice(publicKey: string, signTx: (xdr: string) => Promise<string>): Promise<boolean> {
    return this.setPrice("XLM", 0.01, publicKey, signTx)
  }

  // Reset XLM price to normal $0.25 (for demo)
  async resetPrice(publicKey: string, signTx: (xdr: string) => Promise<string>): Promise<boolean> {
    return this.setPrice("XLM", 0.25, publicKey, signTx)
  }

  // Get user position from pool contract
  async getUserPosition(userAddress: string): Promise<{
    collateral: { xlm: number }
    debt: { usdc: number }
    supply: { usdc: number }
    healthFactor: number
  }> {
    if (!this.poolContract || !userAddress) {
      return {
        collateral: { xlm: 0 },
        debt: { usdc: 0 },
        supply: { usdc: 0 },
        healthFactor: 999,
      }
    }

    try {
      const userAddr = new Address(userAddress)

      // Get user collateral (XLM)
      const collateralResult = await this.callContract("get_user_collateral", [
        userAddr.toScVal(),
        nativeToScVal("XLM", { type: "symbol" }),
      ])
      const xlmCollateral = collateralResult ? fromContractAmount(collateralResult as bigint) : 0

      // Get user debt (USDC)
      const debtResult = await this.callContract("get_user_debt", [
        userAddr.toScVal(),
        nativeToScVal("USDC", { type: "symbol" }),
      ])
      const usdcDebt = debtResult ? fromContractAmount(debtResult as bigint) : 0

      // Get user shares/supply (USDC)
      const sharesResult = await this.callContract("get_user_shares", [
        userAddr.toScVal(),
        nativeToScVal("USDC", { type: "symbol" }),
      ])
      const usdcShares = sharesResult ? fromContractAmount(sharesResult as bigint) : 0

      // Get health factor
      const hfResult = await this.callContract("get_health_factor", [userAddr.toScVal()])
      const healthFactor = hfResult ? fromScaled(hfResult as bigint) : 999

      return {
        collateral: { xlm: xlmCollateral },
        debt: { usdc: usdcDebt },
        supply: { usdc: usdcShares },
        healthFactor,
      }
    } catch (error) {
      console.error("Error fetching user position:", error)
      return {
        collateral: { xlm: 0 },
        debt: { usdc: 0 },
        supply: { usdc: 0 },
        healthFactor: 999,
      }
    }
  }

  // Get market info from pool
  async getMarketInfo(asset: "XLM" | "USDC"): Promise<{
    totalSupply: number
    totalBorrow: number
    utilizationRate: number
    borrowRate: number
    supplyRate: number
  }> {
    if (!this.poolContract) {
      return {
        totalSupply: 0,
        totalBorrow: 0,
        utilizationRate: 0,
        borrowRate: 0.05,
        supplyRate: 0.02,
      }
    }

    try {
      const assetSymbol = nativeToScVal(asset, { type: "symbol" })

      // Get total supply
      const supplyResult = await this.callContract("get_total_supply", [assetSymbol])
      const totalSupply = supplyResult ? fromContractAmount(supplyResult as bigint) : 0

      // Get total borrow
      const borrowResult = await this.callContract("get_total_borrow", [assetSymbol])
      const totalBorrow = borrowResult ? fromContractAmount(borrowResult as bigint) : 0

      // Get utilization rate
      const utilResult = await this.callContract("get_utilization_rate", [assetSymbol])
      const utilizationRate = utilResult ? fromScaled(utilResult as bigint) : 0

      // Get borrow rate
      const borrowRateResult = await this.callContract("get_borrow_rate", [assetSymbol])
      const borrowRate = borrowRateResult ? fromScaled(borrowRateResult as bigint) : 0.05

      // Get supply rate
      const supplyRateResult = await this.callContract("get_supply_rate", [assetSymbol])
      const supplyRate = supplyRateResult ? fromScaled(supplyRateResult as bigint) : 0.02

      return {
        totalSupply,
        totalBorrow,
        utilizationRate,
        borrowRate,
        supplyRate,
      }
    } catch (error) {
      console.error("Error fetching market info:", error)
      return {
        totalSupply: 0,
        totalBorrow: 0,
        utilizationRate: 0,
        borrowRate: 0.05,
        supplyRate: 0.02,
      }
    }
  }

  // Helper to call contract and parse result
  private async callContract(method: string, args: xdr.ScVal[]): Promise<unknown> {
    if (!this.poolContract) return null

    try {
      const tx = await this.buildReadTransaction(
        this.poolContract.call(method, ...args)
      )
      const result = await sorobanServer.simulateTransaction(tx)

      if (SorobanRpc.Api.isSimulationSuccess(result)) {
        const returnValue = result.result?.retval
        if (returnValue) {
          return scValToNative(returnValue)
        }
      }
      return null
    } catch (error) {
      console.error(`Error calling ${method}:`, error)
      return null
    }
  }

  // Build a read-only transaction for simulation
  private async buildReadTransaction(operation: xdr.Operation): Promise<any> {
    // Use a dummy source account for read-only operations
    const dummyKeypair = Keypair.random()
    const dummyAccount = await sorobanServer.getAccount(dummyKeypair.publicKey()).catch(() => {
      // If account doesn't exist, create a mock one
      return {
        accountId: () => dummyKeypair.publicKey(),
        sequenceNumber: () => "0",
        incrementSequenceNumber: () => {},
      }
    })

    return new TransactionBuilder(dummyAccount as any, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_CONFIG.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build()
  }

  // Build a write transaction that needs to be signed
  async buildTransaction(
    sourceAddress: string,
    operation: xdr.Operation
  ): Promise<string> {
    const account = await sorobanServer.getAccount(sourceAddress)

    const transaction = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: NETWORK_CONFIG.networkPassphrase,
    })
      .addOperation(operation)
      .setTimeout(30)
      .build()

    // Simulate to get the proper footprint
    const simResult = await sorobanServer.simulateTransaction(transaction)

    if (!SorobanRpc.Api.isSimulationSuccess(simResult)) {
      // Extract detailed error message from simulation result
      let errorMessage = "Transaction simulation failed"
      
      if (SorobanRpc.Api.isSimulationError(simResult)) {
        errorMessage = simResult.error || errorMessage
        console.error("Simulation error details:", JSON.stringify(simResult, null, 2))
      } else if (SorobanRpc.Api.isSimulationRestore(simResult)) {
        errorMessage = "Contract state needs restoration. Please try again."
        console.error("Simulation needs restore:", simResult)
      }
      
      // Try to parse common Soroban error patterns
      const lowerError = errorMessage.toLowerCase()
      
      if (lowerError.includes("hostfunction") || lowerError.includes("host function")) {
        errorMessage = "Contract call failed. The contract may not be initialized properly."
      } else if (lowerError.includes("budget") || lowerError.includes("exceeded")) {
        errorMessage = "Transaction too complex. Try a smaller amount."
      } else if (lowerError.includes("storage") || lowerError.includes("missingvalue")) {
        errorMessage = "Contract storage error. The contract may not be initialized."
      } else if (lowerError.includes("auth") || lowerError.includes("authorization")) {
        errorMessage = "Authorization failed. Please ensure your wallet is connected."
      } else if (lowerError.includes("insufficient") || lowerError.includes("balance")) {
        errorMessage = "Insufficient balance. Make sure you have enough tokens."
      } else if (lowerError.includes("panic") || lowerError.includes("trap")) {
        // Try to extract the panic message
        const panicMatch = errorMessage.match(/panic:?\s*["']?([^"'\n]+)["']?/i)
        if (panicMatch) {
          errorMessage = panicMatch[1]
        } else {
          errorMessage = "Contract panicked. Check the contract parameters."
        }
      }
      
      throw new Error(errorMessage)
    }

    // Prepare the transaction
    const preparedTx = SorobanRpc.assembleTransaction(transaction, simResult)
    return preparedTx.build().toXDR()
  }

  // Submit a signed transaction
  async submitTransaction(signedXdr: string): Promise<string> {
    const tx = TransactionBuilder.fromXDR(signedXdr, NETWORK_CONFIG.networkPassphrase)
    const result = await sorobanServer.sendTransaction(tx)

    console.log("Transaction sent, status:", result.status, "hash:", result.hash)

    // Handle error status
    if (result.status === "ERROR") {
      console.error("Transaction send error:", result)
      const errorResult = (result as any).errorResult
      throw new Error("Transaction submission failed: " + (errorResult?.toString() || "Unknown error"))
    }

    // For PENDING status, poll for completion
    if (result.status === "PENDING") {
      const txHash = result.hash
      const maxAttempts = 30  // 30 seconds max
      
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 1000))
        
        try {
          const getResult = await sorobanServer.getTransaction(txHash)
          console.log(`Attempt ${attempt}: status = ${getResult.status}`)
          
          if (getResult.status === "SUCCESS") {
            console.log("✅ Transaction confirmed:", txHash)
            return txHash
          }
          
          if (getResult.status === "FAILED") {
            console.error("Transaction failed:", getResult)
            throw new Error("Transaction failed on-chain")
          }
          
          // NOT_FOUND means still pending, continue waiting
        } catch (pollError: any) {
          // SDK parsing errors (like "Bad union switch") - transaction likely succeeded
          if (pollError.message?.includes("Bad union switch") || 
              pollError.message?.includes("union") ||
              pollError.message?.includes("XDR")) {
            console.warn("SDK parse error (transaction likely succeeded):", pollError.message)
            console.log("⚠️ Assuming success. Hash:", txHash)
            console.log("🔗 Verify: https://stellar.expert/explorer/testnet/tx/" + txHash)
            // Return success - the transaction was sent and SDK parsing issue is common
            return txHash
          }
          // For other errors, continue polling
          console.warn("Poll error:", pollError.message)
        }
      }
      
      // Timeout - but transaction may have succeeded
      console.warn("Timeout waiting for confirmation. Hash:", result.hash)
      return result.hash  // Return hash anyway, user can verify on explorer
    }

    // DUPLICATE or TRY_AGAIN_LATER
    if (result.status === "DUPLICATE") {
      console.log("Transaction already submitted:", result.hash)
      return result.hash
    }

    throw new Error(`Unexpected transaction status: ${result.status}`)
  }

  // === Write Operations ===

  // Supply/Deposit to pool
  async buildSupplyTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")

    const operation = this.poolContract.call(
      "supply",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    return this.buildTransaction(userAddress, operation)
  }

  // Withdraw from pool
  async buildWithdrawTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")

    const operation = this.poolContract.call(
      "withdraw",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    return this.buildTransaction(userAddress, operation)
  }

  // Deposit collateral
  async buildDepositCollateralTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")
    
    // Validate inputs
    if (!userAddress) throw new Error("User address is required")
    if (amount <= 0) throw new Error("Amount must be greater than 0")

    console.log(`Building deposit_collateral tx: user=${userAddress}, asset=${asset}, amount=${amount}`)

    const operation = this.poolContract.call(
      "deposit_collateral",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    try {
      return await this.buildTransaction(userAddress, operation)
    } catch (error: any) {
      // Provide more specific error messages for deposit_collateral
      if (error.message?.includes("not enabled as collateral")) {
        throw new Error("XLM is not enabled as collateral on this pool. The contract may need to be initialized.")
      }
      if (error.message?.includes("Storage")) {
        throw new Error("Pool contract is not initialized. Please run the deploy script first.")
      }
      if (error.message?.includes("transfer")) {
        throw new Error("Token transfer failed. Make sure you have enough XLM in your wallet.")
      }
      throw error
    }
  }

  // Withdraw collateral
  async buildWithdrawCollateralTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")

    const operation = this.poolContract.call(
      "withdraw_collateral",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    return this.buildTransaction(userAddress, operation)
  }

  // Borrow
  async buildBorrowTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")

    const operation = this.poolContract.call(
      "borrow",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    return this.buildTransaction(userAddress, operation)
  }

  // Repay
  async buildRepayTx(userAddress: string, asset: "XLM" | "USDC", amount: number): Promise<string> {
    if (!this.poolContract) throw new Error("Pool contract not configured")

    const operation = this.poolContract.call(
      "repay",
      new Address(userAddress).toScVal(),
      nativeToScVal(asset, { type: "symbol" }),
      nativeToScVal(toContractAmount(amount), { type: "i128" })
    )

    return this.buildTransaction(userAddress, operation)
  }
}

// Export singleton instance
export const sorobanService = new SorobanContractService()

// Helper to ensure pool is initialized before operations
async function ensurePoolInitialized(): Promise<void> {
  if (!sorobanService.isConfigured()) {
    throw new Error("Contracts not configured. Make sure .env.local has the contract addresses.")
  }
  
  const isInitialized = await sorobanService.isPoolInitialized()
  if (!isInitialized) {
    throw new Error(
      "Pool contract is not initialized. Please run 'npm run deploy-all' in the scripts folder to initialize the contracts."
    )
  }
}

// === API compatible with mock-contract-api ===
// This allows gradual migration from mock to real

export const apogeeContractAPI = {
  getWalletBalances: async (userAddress: string): Promise<WalletBalances> => {
    // Query actual token balances from SAC contracts
    if (!userAddress) {
      return { sXLM: 0, sUSDC: 0 }
    }
    
    return sorobanService.getWalletBalances(userAddress)
  },

  getDashboardData: async (userAddress: string): Promise<DashboardData> => {
    // Return empty data if not configured or no user
    if (!sorobanService.isConfigured() || !userAddress) {
      return {
        userCollateral_sXLM: 0,
        userCollateral_USD: 0,
        userDebt_sUSDC: 0,
        userSupply_sUSDC: 0,
        borrowLimit: 0,
        healthFactor: 999, // No debt = safe
        poolTotalSupply_sUSDC: 0,
        poolTotalBorrowed_sUSDC: 0,
        poolUtilization: 0,
        borrowAPR: 0.05,
        supplyAPR: 0.02,
      }
    }

    try {
      // Get real data from contracts
      const [userPosition, xlmPrice, usdcMarket] = await Promise.all([
        sorobanService.getUserPosition(userAddress),
        sorobanService.getPrice("XLM"),
        sorobanService.getMarketInfo("USDC"),
      ])

      const collateralValueUSD = userPosition.collateral.xlm * xlmPrice
      const borrowLimit = collateralValueUSD * 0.75 // 75% LTV

      return {
        userCollateral_sXLM: userPosition.collateral.xlm,
        userCollateral_USD: collateralValueUSD,
        userDebt_sUSDC: userPosition.debt.usdc,
        userSupply_sUSDC: userPosition.supply.usdc,
        borrowLimit,
        healthFactor: userPosition.healthFactor,
        poolTotalSupply_sUSDC: usdcMarket.totalSupply,
        poolTotalBorrowed_sUSDC: usdcMarket.totalBorrow,
        poolUtilization: usdcMarket.utilizationRate,
        borrowAPR: usdcMarket.borrowRate,
        supplyAPR: usdcMarket.supplyRate,
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error)
      // Return mock data on error
      return {
        userCollateral_sXLM: 0,
        userCollateral_USD: 0,
        userDebt_sUSDC: 0,
        userSupply_sUSDC: 0,
        borrowLimit: 0,
        healthFactor: 999,
        poolTotalSupply_sUSDC: 0,
        poolTotalBorrowed_sUSDC: 0,
        poolUtilization: 0,
        borrowAPR: 0.05,
        supplyAPR: 0.02,
      }
    }
  },

  getMarkets: async (): Promise<MarketData[]> => {
    const [xlmPrice, usdcPrice, xlmMarket, usdcMarket] = await Promise.all([
      sorobanService.getPrice("XLM"),
      sorobanService.getPrice("USDC"),
      sorobanService.getMarketInfo("XLM"),
      sorobanService.getMarketInfo("USDC"),
    ])

    return [
      {
        asset: "XLM",
        icon: "⭐",
        totalSupplied: xlmMarket.totalSupply * xlmPrice,
        totalBorrowed: xlmMarket.totalBorrow * xlmPrice,
        supplyAPR: xlmMarket.supplyRate * 100,
        borrowAPY: xlmMarket.borrowRate * 100,
        utilization: xlmMarket.utilizationRate * 100,
        price: xlmPrice,
        priceChange24h: 2.5, // TODO: Get from oracle or external API
      },
      {
        asset: "USDC",
        icon: "$",
        totalSupplied: usdcMarket.totalSupply,
        totalBorrowed: usdcMarket.totalBorrow,
        supplyAPR: usdcMarket.supplyRate * 100,
        borrowAPY: usdcMarket.borrowRate * 100,
        utilization: usdcMarket.utilizationRate * 100,
        price: usdcPrice,
        priceChange24h: 0.01,
      },
    ]
  },

  // Write operations that build + sign + submit
  depositCollateral: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildDepositCollateralTx(userAddress, "XLM", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },

  withdrawCollateral: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildWithdrawCollateralTx(userAddress, "XLM", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },

  borrow: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildBorrowTx(userAddress, "USDC", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },

  repay: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildRepayTx(userAddress, "USDC", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },

  supplyLiquidity: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildSupplyTx(userAddress, "USDC", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },

  withdrawLiquidity: async (
    userAddress: string,
    amount: number,
    signTx: (xdr: string) => Promise<string>
  ): Promise<boolean> => {
    await ensurePoolInitialized()
    const txXdr = await sorobanService.buildWithdrawTx(userAddress, "USDC", amount)
    const signedXdr = await signTx(txXdr)
    await sorobanService.submitTransaction(signedXdr)
    return true
  },
}

