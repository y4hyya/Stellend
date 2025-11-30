// Mock Contract API for Apogee DeFi Protocol

interface MockDB {
  userCollateral_sXLM: number
  userDebt_sUSDC: number
  userSupply_sUSDC: number
  userWalletBalance_sXLM: number
  userWalletBalance_sUSDC: number
  poolTotalSupply_sUSDC: number
  poolTotalBorrowed_sUSDC: number
  priceXLM_USD: number
  LTV_RATIO: number
  LIQUIDATION_THRESHOLD: number
}

const mockDB: MockDB = {
  userCollateral_sXLM: 2000,
  userDebt_sUSDC: 300,
  userSupply_sUSDC: 5000,
  userWalletBalance_sXLM: 10000,
  userWalletBalance_sUSDC: 2000,
  poolTotalSupply_sUSDC: 1500000,
  poolTotalBorrowed_sUSDC: 800000,
  priceXLM_USD: 0.3,
  LTV_RATIO: 0.5,
  LIQUIDATION_THRESHOLD: 0.8,
}

const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

export const mockContractAPI = {
  getWalletBalances: async () => {
    await delay(300)
    return {
      sXLM: mockDB.userWalletBalance_sXLM,
      sUSDC: mockDB.userWalletBalance_sUSDC,
    }
  },

  getDashboardData: async () => {
    await delay(1000)

    const collateralValue = mockDB.userCollateral_sXLM * mockDB.priceXLM_USD
    const borrowLimit = collateralValue * mockDB.LTV_RATIO
    const healthFactor =
      mockDB.userDebt_sUSDC === 0 ? 999 : (collateralValue * mockDB.LIQUIDATION_THRESHOLD) / mockDB.userDebt_sUSDC
    const utilization = mockDB.poolTotalBorrowed_sUSDC / mockDB.poolTotalSupply_sUSDC
    const borrowAPR = 0.05 + utilization * 0.15
    const supplyAPR = borrowAPR * utilization

    return {
      userCollateral_sXLM: mockDB.userCollateral_sXLM,
      userCollateral_USD: collateralValue,
      userDebt_sUSDC: mockDB.userDebt_sUSDC,
      userSupply_sUSDC: mockDB.userSupply_sUSDC,
      borrowLimit: borrowLimit,
      healthFactor: healthFactor,
      poolTotalSupply_sUSDC: mockDB.poolTotalSupply_sUSDC,
      poolTotalBorrowed_sUSDC: mockDB.poolTotalBorrowed_sUSDC,
      poolUtilization: utilization,
      borrowAPR: borrowAPR,
      supplyAPR: supplyAPR,
    }
  },

  depositCollateral: async (amount: number) => {
    await delay(2000)
    if (mockDB.userWalletBalance_sXLM < amount) {
      throw new Error("Insufficient sXLM balance")
    }
    mockDB.userWalletBalance_sXLM -= amount
    mockDB.userCollateral_sXLM += amount
    return true
  },

  withdrawCollateral: async (amount: number) => {
    await delay(2000)
    if (mockDB.userCollateral_sXLM < amount) {
      throw new Error("Insufficient collateral")
    }
    const newCollateral = mockDB.userCollateral_sXLM - amount
    const newCollateralValue = newCollateral * mockDB.priceXLM_USD
    const newHealthFactor =
      mockDB.userDebt_sUSDC === 0 ? 999 : (newCollateralValue * mockDB.LIQUIDATION_THRESHOLD) / mockDB.userDebt_sUSDC
    if (newHealthFactor < 1.05) {
      throw new Error("Position would become unhealthy")
    }
    mockDB.userCollateral_sXLM -= amount
    mockDB.userWalletBalance_sXLM += amount
    return true
  },

  borrow: async (amount: number) => {
    await delay(2000)
    const collateralValue = mockDB.userCollateral_sXLM * mockDB.priceXLM_USD
    const borrowLimit = collateralValue * mockDB.LTV_RATIO
    if (mockDB.userDebt_sUSDC + amount > borrowLimit) {
      throw new Error("Borrow limit exceeded")
    }
    mockDB.userDebt_sUSDC += amount
    mockDB.userWalletBalance_sUSDC += amount
    return true
  },

  repay: async (amount: number) => {
    await delay(2000)
    if (mockDB.userWalletBalance_sUSDC < amount) {
      throw new Error("Insufficient sUSDC balance")
    }
    const repayAmount = Math.min(amount, mockDB.userDebt_sUSDC)
    mockDB.userWalletBalance_sUSDC -= repayAmount
    mockDB.userDebt_sUSDC -= repayAmount
    return true
  },

  supplyLiquidity: async (amount: number) => {
    await delay(2000)
    if (mockDB.userWalletBalance_sUSDC < amount) {
      throw new Error("Insufficient sUSDC balance")
    }
    mockDB.userWalletBalance_sUSDC -= amount
    mockDB.userSupply_sUSDC += amount
    mockDB.poolTotalSupply_sUSDC += amount
    return true
  },

  withdrawLiquidity: async (amount: number) => {
    await delay(2000)
    if (mockDB.userSupply_sUSDC < amount) {
      throw new Error("Insufficient supplied balance")
    }
    const withdrawAmount = Math.min(amount, mockDB.userSupply_sUSDC)
    mockDB.userSupply_sUSDC -= withdrawAmount
    mockDB.userWalletBalance_sUSDC += withdrawAmount
    mockDB.poolTotalSupply_sUSDC -= withdrawAmount
    return true
  },
}
